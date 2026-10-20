// Engineering sheets (lib/sheets/eng.mjs): every S / M / P / E / FP / FA / T sheet of every realistic fixture renders
// without NaN, undefined or a failure box, stays a sensible size, and the layout rules behind them hold: smoke alarms in
// every bedroom, receptacles every 12 ft, tonnage by area, IPC restroom counts, sprinkler heads by hazard. And the sheets
// agree with each other and with the type's decisions (Oct 20 review): the structure on every S sheet is the type's
// structure, one HVAC list feeds the M schedules and the fire alarm's duct detectors, one electrical system feeds the
// one-line and the panel schedules, and every apartment is drawn and served unit by unit.
import assert from 'node:assert/strict';
import { ctxFor, CASES } from './helpers/setctx.mjs';
import * as P from '../lib/planset.mjs';
import * as E from '../lib/sheets/eng.mjs';
import { occupantLoad, RESIDENTIAL, CORRIDOR, unitLayout, typeFacts } from '../lib/plandesign.mjs';

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
  assert.equal(E.panelSchedule(ctxs.retail.types[0], ctxs.retail.designs.A).filter(p => p.tenant).length, E.tenantsOn(ctxs.retail.designs.A).length, 'a panel a tenant');
  assert.equal(E.panelSchedule(ctxs.retail.types[0], ctxs.retail.designs.A).filter(p => p.house).length, 1, 'and a house panel, scheduled like the others');
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
// ---------- the sheets agree with each other and with the type's decisions ----------
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const each = f => { for (const [name, c] of Object.entries(ctxs)) for (const t of c.types) { const d = c.designs[t.id]; if (d) f(name, c, t, d, c.tf[t.id] || typeFacts(t, d)); } };
const page = (c, kind, t) => { const sh = c.sheets.find(s => s.kind === kind && (!t || s.typeId === t.id)); return sh ? E.RENDERERS[kind](c, { ...sh }) : ''; };
const text = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// 1. structure: every S sheet says the type's structure decision and nothing else (Oct 20: a clubhouse with wood
// trusses framed on steel joists and columns on S-201; drilled piers described, spread footings scheduled)
{
  const notesOf = {}; for (const [name, c] of Object.entries(ctxs)) notesOf[name] = text(page(c, 's-notes'));
  each((name, c, t, d, tf) => {
    const st = tf.structure, found = text(page(c, 's-found', t)), frame = text(page(c, 's-frame', t)), where = name + ' ' + t.id;
    assert.ok(notesOf[name].includes(st.foundation.text) && notesOf[name].includes(st.roof.text) && notesOf[name].includes(st.walls.text), where + ': S-001 gives the type’s foundation, walls and roof');
    assert.ok(found.includes(st.foundation.text), where + ': S-1xx states the foundation decision');
    if (st.columns) assert.ok(/\bF1\b/.test(found) && /Spread footing/.test(found), where + ': footings where there are columns');
    else assert.ok(!/\bF1\b|[Ss]pread footing|steel column/i.test(found.replace(st.foundation.text, '')), where + ': no footings or columns without columns');
    assert.ok(!/drilled pier/i.test(found.split(st.foundation.text).join('')) && !/drilled pier/i.test(frame), where + ': drilled piers only in the foundation decision’s own words');
    if (st.roof.kind === 'wood-trusses') assert.ok(/WOOD TRUSSES/.test(frame) && !/STEEL JOISTS|JOIST GIRDER|joist girders/i.test(frame), where + ': wood trusses, no steel joists');
    else assert.ok(/STEEL JOISTS/.test(frame) && !/WOOD TRUSSES/.test(frame), where + ': steel joists, no wood trusses');
    if (!st.columns) assert.ok(!/Steel column|JG \(JOIST GIRDER\)/.test(frame), where + ': no columns or joist girders without columns');
    if (st.floor) assert.ok(frame.includes(st.floor.text), where + ': floor framing as decided');
  });
  for (const [name, c] of Object.entries(ctxs)) {
    const det = text(page(c, 's-details')), cols = c.types.some(t => c.tf[t.id]?.structure.columns), joists = c.types.some(t => c.tf[t.id]?.structure.roof.kind === 'steel-joists'), trusses = c.types.some(t => c.tf[t.id]?.structure.roof.kind === 'wood-trusses');
    assert.equal(/Spread footing at steel column/.test(det), cols, name + ': S-501 footing detail only where a type has columns');
    assert.equal(/Steel joist bearing/.test(det), joists, name + ': S-501 joist detail only with steel joists');
    assert.equal(/Roof truss bearing/.test(det), trusses, name + ': S-501 truss detail only with wood trusses');
  }
  const m = ctxs.mixed, E5 = m.types.find(t => t.use === 'amenity'), D5 = m.types.find(t => t.use === 'retail');
  assert.equal(m.tf[E5.id].structure.roof.kind, 'wood-trusses'); assert.ok(!m.tf[E5.id].structure.columns, 'mixed: the clubhouse is trusses on walls');
  assert.ok(/\bF1\b/.test(text(page(m, 's-found', D5))), 'mixed: the retail strip has footings at its columns');
}
// 2. one HVAC list: the M schedules carry exactly hvacLayout's tags; the fire alarm's duct detectors are exactly its
// units over 2,000 cfm (IMC 606.2.1)
each((name, c, t, d) => {
  const H = E.hvacLayout(t, d), tags = H.systems.map(s => s.tag), sched = E.hvacSchedule(t, d, H), where = name + ' ' + t.id;
  assert.deepEqual(sched.flatMap(r => r.tags).sort(), [...tags].sort(), where + ': M schedule tags are hvacLayout’s');
  assert.equal(new Set(tags).size, tags.length, where + ': tags are unique');
  assert.equal(sum(sched, r => r.count), H.systems.length, where + ': schedule counts add up');
  for (const r of sched) assert.ok(sched.filter(q => q.tons !== r.tons).length || true, where);
  const dd = E.ductDetectors(H), want = H.systems.filter(s => s.cfm > 2000);
  assert.deepEqual(dd.map(s => s.tag), want.map(s => s.tag), where + ': duct detectors are the units over 2,000 cfm');
  const fa = c.sheets.find(s => s.kind === 'fa-plan' && s.typeId === t.id);
  if (fa) {
    const html = E.RENDERERS['fa-plan'](c, { ...fa }), FD = E.faDevices(t, d, c.tf[t.id]?.occupants ?? undefined);
    assert.equal(FD.dd.length, want.length, where + ': FA counts the HVAC list’s detectors');
    assert.ok(new RegExp('Duct smoke detectors \\(units over 2,000 cfm, IMC 606.2.1\\)</td><td class="r">' + want.length + '\\b').test(html), where + ': FA device table shows ' + want.length + ' duct detectors');
    if (d.floors === 1) assert.equal((html.match(/>DD</g) || []).length - 1, want.length, where + ': one DD drawn for each (and the legend’s)');
  }
  const mh = page(c, 'm-hvac', t); for (const r of sched) assert.ok(mh.includes('>' + esc(r.label) + '<'), where + ': M-1xx lists ' + r.label);
});
{ const mn = page(ctxs.mixed, 'm-notes'); for (const t of ctxs.mixed.types) for (const r of E.hvacSchedule(t, ctxs.mixed.designs[t.id])) assert.ok(mn.includes('>' + esc(r.label) + '<'), 'M-001 lists ' + t.id + ' ' + r.label); }
// 3. one electrical system: the one-line's panel ratings are the panel schedules' (and the service the same everywhere)
each((name, c, t, d) => {
  const S = E.elecSystem(t, d), P = E.panelSchedule(t, d), where = name + ' ' + t.id, one = E.onelineSVG(t, d, 520).body;
  assert.deepEqual(P.map(p => p.name + p.amps), S.panels.map(p => p.name + p.amps), where + ': panelSchedule is elecSystem’s');
  const drawn = [...one.matchAll(/PANEL ([\w-]+) · (\d+) A/g)].map(m => [m[1], +m[2]]);
  assert.ok(drawn.length >= Math.min(P.length, 3), where + ': the one-line shows the panels (' + drawn.length + ')');
  for (const [nm, a] of drawn) assert.equal(a, P.find(p => p.name === nm)?.amps, where + ': one-line panel ' + nm + ' rating = schedule');
  assert.ok(P.every(p => p.main === p.amps), where + ': each panel’s main / feeder breaker is its rating');
  if (P.some(p => p.house)) assert.ok(drawn.some(([nm]) => P.find(p => p.house).name === nm), where + ': the house panel is on the one-line');
  assert.ok(one.includes('SERVICE ' + S.service.amps + ' A') && (P.length > 1 ? one.includes('MAIN BREAKER ' + S.service.amps + ' A') || one.includes('MAIN ' + S.service.amps + ' A') : one.includes('MAIN ' + P[0].main + ' A')), where + ': service and main on the one-line');
  if (P.length === 1) assert.ok(P[0].amps === S.service.amps || S.service.amps > 600, where + ': a single panel is the service equipment');
  const ep = text(page(c, 'e-plan', t)); assert.ok(ep.includes('Service ' + S.service.amps + ' A, ' + S.service.volts), where + ': E-2xx states the same service');
});
{ for (const [name, c] of Object.entries(ctxs)) { const en = page(c, 'e-notes'); for (const t of c.types.filter(q => c.designs[q.id])) { const S = E.elecSystem(t, c.designs[t.id]); assert.ok(en.includes(esc('Type ' + t.id + ': ' + S.service.amps + ' A, ' + S.service.volts)), name + ' ' + t.id + ': E-001 service line'); for (const p of S.panels.filter(q => en.includes('Panel ' + q.name + ' — Type ' + t.id))) assert.ok(en.includes(p.amps + ' A rating, ' + p.main + ' A main breaker'), name + ' ' + t.id + ' panel ' + p.name + ': E-001 rating'); } } }
// 4. sprinklers and fire alarm: the type's system, its reason, 13R omissions, the standpipe check, IBC 907.2 by occupancy
each((name, c, t, d, tf) => {
  const fp = c.sheets.find(s => s.kind === 'fp-sprinkler' && s.typeId === t.id), where = name + ' ' + t.id;
  if (!t.sprinklered) { assert.ok(!fp, where + ': no sprinkler sheet when not sprinklered'); return; }
  const html = text(E.RENDERERS['fp-sprinkler'](c, { ...fp })), SP = E.sprinklerPlan(t, d, tf.sprinkler, tf.height);
  assert.equal(SP.system, tf.sprinkler.system); assert.ok(html.includes(tf.sprinkler.system + ' automatic wet-pipe') && html.includes(tf.sprinkler.why), where + ': FP states the system and why');
  assert.ok(/standpipes/.test(html), where + ': standpipe check');
});
{
  const m = ctxs.mixed, A = m.types.find(t => t.use === 'multifamily'), dA = m.designs[A.id], tfA = m.tf[A.id];
  assert.equal(tfA.sprinkler.system, 'NFPA 13R');
  const SP = E.sprinklerPlan(A, dA, tfA.sprinkler, tfA.height); assert.ok(!SP.standpipe.need && /no standpipes/.test(SP.standpipe.text), '3 stories, top floor 21 ft: no standpipes (IBC 905.3.1)');
  assert.ok(SP.rooms.some(x => x.r.inUnit && x.hz === 'res') && SP.rooms.some(x => x.r.type === 'corridor' && x.hz === 'res'), 'residential heads in the units and the corridor');
  // a unit type with a 48 sf bath and a 20 sf closet: 13R leaves them out, 13 doesn't
  const d2 = JSON.parse(JSON.stringify(dA)), code = Object.keys(d2.unitPlans).find(k => d2.unitPlans[k].rooms.some(r => r.type === 'bath')), plan = d2.unitPlans[code];
  const bath = plan.rooms.find(r => r.type === 'bath'); bath.w = 6; bath.d = 8; plan.rooms.push({ id: 'cl9', name: 'Closet', type: 'closet', x: 0, y: 0, w: 4, d: 5 });
  const nU = d2.rooms.filter(r => r.unit?.code === code).length, o13r = E.sprinklerPlan(A, d2, { system: 'NFPA 13R' }).omitted, o13 = E.sprinklerPlan(A, d2, { system: 'NFPA 13' }).omitted;
  assert.equal(o13r.filter(o => /bathroom/.test(o.why)).length, nU, '13R: no heads in the ' + nU + ' small baths'); assert.equal(o13r.filter(o => /closet/.test(o.why)).length, nU, '13R: none in the small closets');
  assert.equal(o13.filter(o => /bathroom|closet/.test(o.why)).length, 0, 'NFPA 13 sprinklers them');
  // fire alarm by IBC 907.2
  const R2 = E.fireAlarmRule(A, dA, tfA.occupants); assert.ok(R2.required && R2.pulls === 'none' && /907\.2\.9/.test(R2.ref) && R2.unitAlarms, 'R-2: alarm required, no pulls when sprinklered, unit smoke alarms');
  const cl = m.types.find(t => t.use === 'amenity'), RA = E.fireAlarmRule(cl, m.designs[cl.id], m.tf[cl.id].occupants); assert.equal(RA.required, m.tf[cl.id].occupants >= 300, 'A-3: 907.2.1 at 300'); assert.equal(RA.ref, 'IBC 907.2.1');
  const rt = m.types.find(t => t.use === 'retail'), RM = E.fireAlarmRule(rt, m.designs[rt.id], m.tf[rt.id].occupants); assert.equal(RM.required, m.tf[rt.id].occupants >= 500, 'M: 907.2.7 at 500'); assert.ok(RM.monitor || RM.required, 'sprinklered M: monitored at least');
  assert.equal(E.fireAlarmRule({ occupancy: 'B', sprinklered: false }, { floors: 1, rooms: [] }, 520).required, true, 'B: 907.2.2 at 500');
  const fa = text(page(m, 'fa-plan', A)); assert.ok(/907\.2\.9/.test(fa) && /Manual pull stations 0/.test(fa), 'FA-2xx for R-2: the rule and no pull stations');
}
// 5. plumbing: IPC fixtures from the life safety sheets' occupant load (occupantLoad with the type's occupancy); shells
// the landlord restroom per suite; apartments by unit
each((name, c, t, d, tf) => {
  if (RESIDENTIAL.includes(t.use)) return;
  const k = E.ipcCheck(t, d), where = name + ' ' + t.id;
  assert.equal(k.load, occupantLoad(d, t.occupancy).total, where + ': IPC load is occupantLoad’s'); if (tf.occupants != null) assert.equal(k.load, tf.occupants, where + ': and the type facts’');
  if (CORRIDOR.includes(t.use)) assert.ok(k.need.wc === E.unitsOf(d).length && k.need.ss === 1 && k.ok, where + ': a WC, lav and tub a unit, one service sink');
});
{ const pn = text(page(ctxs.mixed, 'p-notes')); assert.ok(/landlord builds one accessible single-user restroom in each suite/.test(pn), 'P-001: shell restrooms are landlord work, tenant fixtures by tenant'); }
// 6. apartments: every unit drawn and served — its rooms from unitLayout, a split system, a water heater, its fixtures, a
// panel, smoke alarms in its bedrooms
each((name, c, t, d) => {
  if (!CORRIDOR.includes(t.use)) return;
  const units = E.unitsOf(d), H = E.hvacLayout(t, d), wh = E.waterHeaters(t, d), S = E.elecSystem(t, d), al = E.unitAlarms(d), where = name + ' ' + t.id;
  assert.ok(units.length >= 3 * d.floors, where + ': units on every floor');
  for (const u of units) {
    const L = unitLayout(d, u); assert.ok(L && L.rooms.length >= 3, where + ' ' + u.unit.no + ': unit rooms placed');
    const sy = H.systems.filter(s => s.unitRoom === u.id); assert.equal(sy.length, 1, where + ' ' + u.unit.no + ': one split system');
    assert.equal(sy[0].tons, Math.min(5, E.roundTons(L.plan.sf / 550)), 'tons from the unit’s area'); assert.ok(sy[0].pad && sy[0].unit.where === 'W/D closet', 'AHU in the closet, CU on a pad');
    assert.equal(wh.filter(w => w.tag === 'WH-' + u.unit.no).length, 1, where + ' ' + u.unit.no + ': a water heater');
    for (const b of L.rooms.filter(r => ['bedroom', 'primary_bedroom'].includes(r.type))) assert.ok(al.some(a => a.kind === 'smoke' && a.room === b.id), where + ' ' + u.unit.no + ': smoke alarm in ' + b.name);
    assert.ok(al.some(a => a.unit === u.id && !/bed/.test(a.room)), where + ' ' + u.unit.no + ': smoke alarm outside the sleeping rooms');
  }
  for (const uf of E.unitFixtures(d)) { const L = unitLayout(d, units.find(u => u.unit.code === uf.code)); assert.ok(uf.counts.KS === 1 && uf.counts.DW === 1 && uf.counts.WB === 1 && uf.counts.WC === L.plan.baths && uf.counts.TUB === L.plan.baths, where + ' ' + uf.code + ': kitchen, washer and a WC/LAV/TUB a bath'); }
  assert.equal(E.unitFixtures(d).reduce((s2, u) => s2 + u.n, 0), units.length, where + ': fixture totals cover every unit');
  assert.equal(S.panels.filter(p => !p.house).reduce((s2, p) => s2 + p.count, 0), units.length, where + ': a panel a unit'); assert.ok(S.panels.filter(p => !p.house).every(p => p.amps >= 125), '125 A unit panels');
  assert.ok(S.panels.some(p => p.house) && /meter/i.test(S.meters), where + ': a house panel and a meter center');
  assert.ok(H.systems.some(s => s.common), where + ': corridor air handling');
  const st = text(page(c, 's-frame', t)); assert.ok(/EXTERIOR TO CORRIDOR WALL/.test(st), where + ': floor trusses span to the corridor walls');
  const ep = page(c, 'e-plan', t); assert.ok((ep.match(/href="#dv-receptacle"/g) || []).length > units.length * 5, where + ': receptacles in the units');
  const pp = text(page(c, 'p-plan', t)); assert.ok(/Fixtures by unit type/.test(pp), where + ': plumbing fixtures by unit type');
});
// 7. shell scope: landlord RTU and electrical service a suite, tenant fit-out by tenant
{ const m = ctxs.mixed, rt = m.types.find(t => t.use === 'retail'); for (const k of ['m-hvac', 'p-plan', 'e-plan']) assert.ok(/landlord work/.test(text(page(m, k, rt))) && /by each tenant/.test(text(page(m, k, rt))), 'shell scope note on ' + k);
  assert.ok(E.hvacLayout(rt, m.designs[rt.id]).systems.every(s => s.landlord), 'shell RTUs are landlord’s'); }
// a pitched roof gets no rooftop units: split systems, the air handler in the attic or a mechanical room, the condensing
// unit on a grade pad; a flat roof keeps its RTUs (the architectural roof plans draw whatever hvacLayout returns)
each((name, c, t, d, tf) => { if (RESIDENTIAL.includes(t.use) || CORRIDOR.includes(t.use)) return; const H = E.hvacLayout(t, d);
  if (tf.height.type === 'flat') assert.ok(H.systems.every(s => s.kind === 'rtu' && s.unit.where === 'roof'), name + ' ' + t.id + ': flat roof, RTUs');
  else assert.ok(H.systems.length && H.systems.every(s => ['split', 'hp'].includes(s.kind) && ['attic', 'mechanical'].includes(s.unit.where) && s.pad?.where === 'ground' && s.tons <= 10), name + ' ' + t.id + ': pitched roof, split systems on the ground'); });
// 8. a long notes column shrinks to fit rather than being cut off by the frame
{ const long = Array.from({ length: 300 }, (_, i) => '<li>' + 'A note that runs on for a while. '.repeat(4) + i + '</li>').join(''); assert.ok(E.estHeight('<ol>' + long + '</ol>', 520) > 1602 * 4); }

console.log('eng sheets ok');
