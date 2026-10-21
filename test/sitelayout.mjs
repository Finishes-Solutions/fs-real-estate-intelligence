// Offline tests for the site layout planner (lib/sitelayout.mjs) on realistic lots: a 7.7-acre lot rebuilt from a
// user's screenshot (920 x 378 ft, frontage on the short west side, a notch out of the east end), a real 27-acre
// parcel from the team database, and a 20-acre surveyed-style tract for a five-use mixed-use program.
// Every option must be usable: nothing outside the lot or in a setback, no overlaps, enough parking, every drive and
// parking row reachable from the entry, buildings next to a drive, the pool on its deck by the clubhouse.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), G = await import('../lib/sitesheet.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const fm362 = mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]]);
const tract = mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]]);
const stokes = { type: 'Polygon', coordinates: [[[-95.910874,30.0542135],[-95.910869,30.0538835],[-95.9087685,30.05391],[-95.9088785,30.058805],[-95.9109745,30.0587885],[-95.910974,30.058761],[-95.910947,30.0575345],[-95.9109315,30.0567925],[-95.9109225,30.056363],[-95.9109105,30.055827],[-95.9108955,30.0551115],[-95.910874,30.0542135]]] };
const siteOf = (g, west) => { const b = S.unionParcels([g]); return { ...b, front: west ? b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9) : null, setbacks: { ...S.SETBACKS } }; };

// the drive network from the entry: drives that touch, and the parking rows on them
function reached(els) {
  const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), grow = e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 };
  const seen = new Set(D.filter(e => e.name === 'Main entry').map(e => e.id)), st = D.filter(e => seen.has(e.id));
  while (st.length) { const e = st.pop(); for (const f of D) if (!seen.has(f.id) && S.rectsOverlap(grow(e), grow(f), 0)) { seen.add(f.id); st.push(f); } }
  return { seen, D };
}
// what's on a roundabout's lane or island: a drive across its island (the streets cut back to it meet its lane), or
// anything else on either; and the homes not on a street reached from the main entry (within 60 ft of one)
const overRing = (e, els) => { const lane = S.shapeOf(e), inner = S.grow(S.islandOf(e), -1), ov = (a, b) => S.rectsOverlap({ poly: a }, { poly: b }, 0.5);
  return els.filter(o => o !== e && (o.kind === 'drive' ? ov(S.shapeOf(o), inner) : ['truck', 'parking', 'building', 'garage', 'pond', 'pool', 'plaza'].includes(o.kind) ? ov(S.shapeOf(o), lane) || ov(S.shapeOf(o), inner) : o.kind === 'lot' && (q => ov(q, lane) || ov(q, inner))(S.grow(S.shapeOf(o), -2)))).map(o => o.kind + ' ' + (o.name || '')); };
const offStreet = els => { const { seen, D } = reached(els), R = D.filter(d => seen.has(d.id)).map(d => { const q = S.shapeOf(d), xs = q.map(p => p[0]), ys = q.map(p => p[1]); return { q, b: [Math.min(...xs) - 60, Math.min(...ys) - 60, Math.max(...xs) + 60, Math.max(...ys) + 60] }; });
  return els.filter(e => e.kind === 'building' && e.use === 'sfr').filter(h => !R.some(r => h.x > r.b[0] && h.x < r.b[2] && h.y > r.b[1] && h.y < r.b[3] && S.gapBetween(S.shapeOf(h), r.q) <= 60)).map(h => h.name); };
function usable(plan, o, what) {
  const p = { ...plan, elements: o.elements, zones: o.zones, program: o.program }, m = S.metrics(p), bad = S.check(p).filter(i => i.level === 'bad');
  assert.deepEqual(bad.map(i => i.text), [], what + ': ' + o.name);
  assert.ok(m.spaces >= m.required, what + ': ' + o.name + ' parking ' + m.spaces + ' of ' + m.required);
  const { seen, D } = reached(o.elements);
  assert.equal(o.elements.filter(e => e.name === 'Main entry').length, 1, what + ': one main entry');
  for (const d of D) if (d.note !== 'Drive-thru lane') assert.ok(seen.has(d.id), what + ': ' + o.name + ' drive at ' + Math.round(d.x) + ',' + Math.round(d.y) + ' is cut off');
  for (const e of o.elements.filter(e => e.kind === 'parking')) assert.ok(D.some(d => seen.has(d.id) && S.rectsOverlap({ ...e, w: e.w + 3, d: e.d + 3 }, d.path ? { ...d, width: d.width + 3 } : d.poly ? { ...d, poly: S.grow(d.poly, 1.5) } : { ...d, w: d.w + 3, d: d.d + 3 }, 0)), what + ': a parking row is off the network');
  for (const b of o.elements.filter(e => e.kind === 'building' && e.use !== 'amenity')) {
    const c = [b.x, b.y], near = D.some(d => S.outline(d).some((q, i, r) => S.segDist(c, q, r[(i + 1) % r.length]) < Math.max(b.w, b.d) / 2 + 160));
    assert.ok(near, what + ': ' + b.name + ' is far from any drive');
  }
  return { p, m };
}

// ---- the user's 7.7-acre lot: apartments, as many as fit ----
{
  const plan = siteOf(fm362, true), t0 = Date.now(), opts = L.layoutOptions(plan, { use: 'multifamily' }), ms = Date.now() - t0;
  assert.ok(ms < 8000, 'took ' + ms + ' ms');
  assert.equal(opts.length, 3, 'three options'); assert.equal(new Set(opts.map(o => o.name)).size >= 2, true, 'they differ');
  for (const o of opts) {
    const { m } = usable(plan, o, 'FM 362 apartments');
    assert.ok(m.units >= 130, o.name + ': ' + m.units + ' units on 7.7 acres'); // ~20 an acre with surface parking and detention
    assert.ok(m.pond >= 0.08 * m.siteSf, o.name + ': detention ' + (m.pond / 43560).toFixed(2) + ' ac');
    const club = o.elements.find(e => e.name === 'Clubhouse'), pool = o.elements.find(e => e.kind === 'pool');
    if (club) { // the pool sits on its deck right beside the clubhouse, nothing in between
      assert.ok(pool && Math.hypot(pool.x - club.x, pool.y - club.y) < 140, o.name + ': pool by the clubhouse');
      for (const pd of o.elements.filter(e => e.kind === 'pond')) assert.ok(!S.outline(pd).some((q, i, r) => S.segsCross([club.x, club.y], [pool.x, pool.y], q, r[(i + 1) % r.length])), o.name + ': no pond between the pool and the clubhouse');
    }
    // the land is used: open lawn (not counting the pond's banks) is a small share of the site
    const lawn = o.elements.filter(e => e.kind === 'green' && e.name === 'Open lawn').reduce((s, e) => s + S.elArea(e), 0);
    assert.ok(lawn < 0.15 * m.siteSf, o.name + ': ' + Math.round(lawn / m.siteSf * 100) + '% open lawn');
    // curved where it should be (drives on arcs, an entry with curb returns), square where it reads cleaner (ponds), staggered buildings
    assert.ok(o.elements.some(e => e.kind === 'drive' && e.path && e.r > 0), o.name + ': curved drives');
    assert.ok(o.elements.some(e => e.name === 'Main entry' && e.poly?.length > 12), 'curb returns');
    assert.ok(o.elements.filter(e => e.kind === 'pond').every(e => !e.poly || e.poly.length <= 30), 'clean straight-edged ponds, no blobs (the default)');
    assert.ok(o.elements.some(e => e.kind === 'building' && e.jog), 'staggered buildings');
  }
  assert.ok(opts.some(o => o.elements.some(e => e.name === 'Clubhouse')), 'a clubhouse');
  // a curved piece moves as a whole and stays valid
  const o = opts[0], pd = o.elements.find(e => e.name === 'Main entry'), before = S.ringArea(pd.poly);
  const moved = S.moveBy({ ...pd }, 3, -2); assert.ok(Math.abs(S.ringArea(moved.poly) - before) < 1 && Math.abs(moved.poly[0][0] - pd.poly[0][0] - 3) < 0.01);
  // drawings: plan SVG with curved drives' centre lines, the sheet, the DXF
  const p = { ...plan, elements: o.elements, zones: o.zones, program: o.program }, svg = G.planSVG(p, { px: 900 }).svg;
  assert.match(svg, /<polyline/); assert.ok(!/NaN/.test(svg), 'no NaN in the drawing');
  assert.match(G.sheetHTML({ plan: p, planName: o.name, size: 'tabloid' }), /SP-1/);
  const dxf = S.toDXF(p, 'TEST'); assert.ok(!/NaN/.test(dxf) && /POOL|AMENITY/.test(dxf));
  const fc = S.planFeatures(p); assert.ok(fc.features.length > 100 && fc.features.every(f => !JSON.stringify(f.geometry).includes('null')));
}
// ---- the same lot, other uses ----
{
  const plan = siteOf(fm362, true);
  const r = L.layoutOptions(plan, { use: 'retail', gfa: 40000 }); assert.equal(r.length, 3);
  r.forEach(o => usable(plan, o, 'FM 362 retail')); assert.ok(S.metrics({ ...plan, elements: r[0].elements, program: r[0].program }).gfa >= 38000, 'the best retail option holds the 40,000 sf');
  const t = L.layoutOptions(plan, { use: 'townhomes' }); assert.equal(t.length, 3);
  for (const o of t) { const { m } = usable(plan, o, 'FM 362 townhomes'); assert.ok(m.units >= 65 && m.garages === m.units * 2, o.name + ': ' + m.units + ' townhomes'); // (guest parking, a quarter space a home, takes a little of the land)
    assert.ok(o.elements.some(e => e.kind === 'parking' && e.note === 'Guest parking'), o.name + ': guest parking'); assert.ok(o.elements.some(e => /Private lane/.test(e.note || ''))); }
  const w = L.layoutOptions(plan, { use: 'industrial' }); assert.equal(w.length, 3);
  for (const o of w) { usable(plan, o, 'FM 362 warehouse'); const b = o.elements.find(e => e.use === 'industrial'), tc = o.elements.find(e => e.kind === 'truck'); assert.ok(b && tc, 'warehouse and truck court');
    assert.ok(S.rectsOverlap({ ...b, w: b.w + 4, d: b.d + 4 }, tc, 0), o.name + ': the truck court is on the dock side'); }
}
// ---- a real 27-acre parcel: 300 apartments, the rest kept for later ----
{
  const plan = siteOf(stokes), opts = L.layoutOptions(plan, { use: 'multifamily', units: 300 });
  assert.equal(opts.length, 3);
  for (const o of opts) usable(plan, o, 'Stokes apartments');
  const m = S.metrics({ ...plan, elements: opts[0].elements, program: opts[0].program }); assert.ok(m.units >= 285, 'about 300 units: ' + m.units);
}
// ---- mixed use on a 20-acre tract: shops and pads in front, a commons with a lake, apartments, townhomes, duplexes ----
{
  const plan = siteOf(tract, true), prog = S.guessProgram('37,700 sf retail with 2 pads, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units');
  const t0 = Date.now(), opts = L.layoutOptions(plan, prog), ms = Date.now() - t0; assert.ok(ms < 8000, 'mixed took ' + ms + ' ms');
  assert.equal(opts.length, 3);
  for (const o of opts) {
    const { p } = usable(plan, o, 'mixed use'), B = o.elements.filter(e => e.kind === 'building'), by = u => B.filter(e => e.use === u);
    for (const u of ['retail', 'multifamily', 'townhomes', 'duplex']) assert.ok(by(u).length, o.name + ': has ' + u);
    assert.ok(B.some(e => /^Pad /.test(e.name)), 'pad sites'); assert.ok(o.elements.some(e => e.name === 'Amenity lake'), 'the commons holds the detention as a lake');
    assert.ok(o.zones.length >= 4 && o.zones.every(z => z.ring.length >= 3), 'zones drawn');
    const retail = by('retail').reduce((s, e) => s + e.w * e.d * e.floors, 0); assert.ok(retail > 0.8 * 37700, 'retail ' + Math.round(retail));
    assert.ok(!/NaN/.test(G.planSVG(p, { px: 800 }).svg));
  }
}
// ---- a small, skewed lot still gets three usable options ----
{
  const pine = { type: 'Polygon', coordinates: [[[-95.6439025,30.0225675],[-95.643898,30.022461],[-95.6438135,30.022392],[-95.6426535,30.0224135],[-95.6425615,30.0224175],[-95.6425615,30.022573],[-95.642561,30.022587],[-95.642555,30.0227385],[-95.642544,30.02289],[-95.6439335,30.023295],[-95.6439025,30.0225675]]] };
  const plan = siteOf(pine), opts = L.layoutOptions(plan, { use: 'multifamily', units: 60 });
  assert.equal(opts.length, 3); opts.forEach(o => usable(plan, o, 'Pine apartments'));
  assert.ok(opts[0].notes.some(n => /of the 60 units/.test(n)), 'says how many of the asked-for units fit');
}
// ---- single-family homes: lots on both sides of the street, a mix of 1-, 2- and 3-story homes ----
{
  const plan = siteOf(fm362, true), prog = { use: 'sfr', homeMix: [{ stories: 1, pct: 40 }, { stories: 2, pct: 50 }, { stories: 3, pct: 10 }] }, opts = L.layoutOptions(plan, prog);
  assert.equal(opts.length, 3);
  for (const o of opts) {
    const { m } = usable(plan, o, 'FM 362 homes'), H = o.elements.filter(e => e.use === 'sfr'), lots = o.elements.filter(e => e.kind === 'lot');
    assert.ok(H.length >= 20 && lots.length === H.length, o.name + ': ' + H.length + ' homes on their own lots');
    assert.equal(m.units, H.length); assert.equal(m.garages, 2 * H.length);
    for (const h of H) assert.ok(lots.some(l => S.hitRect(l, [h.x, h.y])), 'each home sits on a lot');
    const n1 = H.filter(e => e.floors === 1).length, n2 = H.filter(e => e.floors === 2).length; assert.ok(n1 > 0 && n2 > 0 && Math.abs(n1 / H.length - 0.4) < 0.2, 'the mix: ' + n1 + ' one-story, ' + n2 + ' two-story');
    assert.ok(new Set(H.map(e => Math.round(S.toLocal({ x: 0, y: 0, rot: e.rot }, [e.x, e.y])[1] / 40))).size >= 2, 'homes on both sides of a street');
  }
}
// ---- site parameters: stall size, square shapes, trees off, setbacks by side ----
{
  const base = siteOf(fm362, true);
  const plan = { ...base, setbacks: { ...S.SETBACKS, paveSide: 20, rear: 30 }, params: { stallW: 9.5, stallD: 19, aisle: 26, trees: false, style: { ponds: 'square', islands: 'square', corners: 'square' } } };
  const o = L.layoutOptions(plan, { use: 'multifamily' })[0], p = { ...plan, elements: o.elements, program: o.program }, P = o.elements.filter(e => e.kind === 'parking');
  usable(plan, o, 'parameters');
  assert.ok(P.length && P.every(e => e.sw === 9.5 && e.sd === 19 && !e.caps), 'stalls 9.5 x 19, square ends');
  assert.ok(o.elements.filter(e => e.kind === 'pond').every(e => !e.poly || e.poly.length <= 30), 'square-edged ponds (a rectangle, or straight edges along an L-shaped strip)'); assert.ok(o.elements.filter(e => e.kind === 'pool').every(e => !e.poly), 'square pool');
  assert.ok(!o.elements.some(e => e.kind === 'drive' && e.path), 'square corners: no curved drives');
  assert.equal(S.details(p).trees.length, 0, 'trees off'); assert.ok(S.details({ ...p, params: { trees: true } }).trees.length > 20, 'trees on');
  const R = S.edgeRules(p.ring, p.front, p.setbacks); assert.ok(R.some(r => r.role === 'side' && r.pave === 20) && R.some(r => r.role === 'rear' && r.build === 30), 'buffers and setbacks by side');
  assert.ok(S.edgeRules(p.ring, p.front, { ...p.setbacks, buildOn: false }).every(r => r.build === 0), 'setbacks can be turned off');
}
// ---- unit mix: units by type, beds, rentable area ----
{
  const plan = siteOf(fm362, true), mix = [{ name: '1 BR', sf: 700, pct: 60, beds: 1 }, { name: '2 BR', sf: 1050, pct: 40, beds: 2 }];
  const o = L.layoutOptions(plan, { use: 'multifamily', mix })[0], m = S.metrics({ ...plan, elements: o.elements, program: o.program });
  assert.equal(S.normalizeProgram({ use: 'multifamily', mix }).unitSf, 840, 'the mix sets the average unit');
  assert.equal(m.mix.reduce((s, t) => s + t.n, 0), m.units); assert.ok(Math.abs(m.mix[0].n / m.units - 0.6) < 0.02);
  assert.equal(m.beds, m.mix[0].n + 2 * m.mix[1].n); assert.equal(m.nrsf, m.mix[0].n * 700 + m.mix[1].n * 1050); assert.ok(m.duAc > 15);
}
// ---- edits: move a building, make the pond bigger; the plan re-fits around them ----
{
  const plan = { ...siteOf(fm362, true), program: { use: 'multifamily' } }, opts = L.layoutOptions(plan, plan.program);
  for (const [k, o] of opts.entries()) {
    const P = { ...plan, elements: JSON.parse(JSON.stringify(o.elements)), recipe: JSON.parse(JSON.stringify(o.recipe)) }, b = P.elements.find(e => e.use === 'multifamily');
    const a = (b.rot || 0) * Math.PI / 180, step = k === 1 ? 30 : -30; S.moveBy(b, step * Math.cos(a), step * Math.sin(a)); b.pinned = true; // slid along its row
    const t0 = Date.now(), r = L.refit(P); assert.ok(r && Date.now() - t0 < 6000, 'refit took ' + (Date.now() - t0) + ' ms');
    const kept = r.elements.find(e => e.id === b.id); assert.ok(kept && kept.x === b.x && kept.y === b.y, 'the moved building stays put');
    const m = S.metrics({ ...P, elements: r.elements }); assert.ok(m.units >= 0.75 * S.metrics({ ...P, elements: o.elements }).units, 'still a full plan: ' + m.units + ' units');
    const bad = S.check({ ...P, elements: r.elements }).filter(i => i.level === 'bad' && i.id !== b.id); assert.deepEqual(bad.map(i => i.text), [], 'nothing else breaks a rule');
  }
  const P = { ...plan, elements: JSON.parse(JSON.stringify(opts[1].elements)), recipe: opts[1].recipe }, pd = P.elements.find(e => e.kind === 'pond');
  S.scaleBy(pd, 1.25); pd.pinned = true; const r = L.refit(P), m = S.metrics({ ...P, elements: r.elements });
  assert.ok(r.elements.some(e => e.id === pd.id) && m.pond >= S.elArea(pd) - 1, 'the bigger pond is kept');
  assert.equal(S.check({ ...P, elements: r.elements }).filter(i => i.level === 'bad' && i.id !== pd.id).length, 0);
  const shape = { kind: 'pond', x: 0, y: 0, w: 120, d: 80, rot: 0 }; S.reshape(shape, 'organic'); assert.ok(shape.poly && Math.abs(S.elArea(shape) - 9600) < 50); S.reshape(shape, 'rounded'); assert.ok(shape.shape === 'round' && Math.abs(S.elArea(shape) - 9600) < 50);
}
// ---- more options than three, for the list ----
{ const plan = siteOf(fm362, true), many = L.layoutOptions(plan, { use: 'multifamily' }, { count: 10 }); assert.ok(many.length > 3, many.length + ' options'); many.forEach(o => usable(plan, o, 'more options')); }
// ---- what was asked for: 28,000 sf across 4 buildings, parking trimmed to the need, detention sized to the land used ----
{
  const plan0 = siteOf(fm362, true), prog = { use: 'retail', gfa: 28000, buildings: 4 };
  // the default fills the site (the owner wants the most leasable floor area the land holds): the same size of building
  // fills the rest as one plan, no Phase 2 marked, the ask kept on the program and said in the notes
  const filled = L.layoutOptions(plan0, prog); assert.ok(filled.length >= 2, filled.length + ' options');
  for (const o of filled) {
    usable(plan0, o, 'filled'); const B = o.elements.filter(e => e.kind === 'building');
    assert.ok(B.length > 4 && B.every(b => Math.abs(S.footArea(b) - 7000) < 400), o.name + ': ' + B.length + ' buildings of about 7,000 sf'); assert.ok(!B.some(e => e.phase === 2 || /Phase 2/.test(e.note || '')), o.name + ': nothing marked Phase 2 unless asked');
    assert.ok(!o.elements.some(e => e.future), o.name + ': no land held for later');
    assert.deepEqual(o.program.asked, { gfa: 28000, units: null, buildings: 4 }, 'what was asked for is kept'); assert.match(o.notes[0], /^Asked for 4 buildings, 28,000 sq ft; the land holds \d+ buildings, [\d,]+ sq ft with their parking and detention, so the plan builds them all/);
  }
  // Phase 2 asked for (Settings › Leftover land › marked Phase 2): the four asked for are Phase 1, the same size of building fills the rest as Phase 2
  const phased = L.layoutOptions({ ...plan0, params: { fill: 'phase' } }, prog); assert.ok(phased.length >= 2, phased.length + ' options');
  for (const o of phased) {
    usable(plan0, o, 'phased'); const B = o.elements.filter(e => e.kind === 'building'), P1 = B.filter(e => e.phase !== 2);
    assert.equal(P1.length, 4, o.name + ': four Phase 1 buildings'); assert.ok(B.length > 4 && B.every(b => Math.abs(S.footArea(b) - 7000) < 400), o.name + ': ' + B.length + ' buildings of about 7,000 sf');
    assert.deepEqual(o.program.asked, { gfa: 28000, units: null, buildings: 4 }, 'what was asked for is kept'); assert.match(o.notes[0], /Phase 1 is what was asked for: 4 buildings, 28,000 sq ft/);
  }
  // with filling off: just what was asked for, the rest kept as land for later
  const plan = { ...plan0, params: { fill: false } }, opts = L.layoutOptions(plan, prog);
  assert.equal(opts.length, 3);
  for (const o of opts) {
    const { m } = usable(plan, o, '28k retail in 4'), B = o.elements.filter(e => e.kind === 'building');
    assert.equal(B.length, 4, o.name + ': four buildings, not one 28,000 sf box');
    for (const b of B) assert.ok(Math.abs(b.w * b.d - 7000) < 350, 'each about 7,000 sf: ' + Math.round(b.w * b.d));
    assert.ok(Math.abs(m.gfa - 28000) < 840 && m.spaces <= m.required * 1.35, o.name + ': ' + m.spaces + ' spaces for ' + m.required + ' needed (no acres of spare parking)');
    assert.ok(m.pond > 0 && m.pond < 0.6 * 43560, 'detention for the ~2 acres developed, not the whole 7.7: ' + (m.pond / 43560).toFixed(2) + ' ac');
    assert.ok(o.elements.some(e => e.kind === 'green' && e.future), 'the land not used is kept as a future pad or phase');
    const T = S.placeTrash({ ...plan, params: { fill: false, trash: { mode: 'auto' } }, elements: o.elements, program: o.program }).elements.filter(e => e.kind === 'trash'); assert.ok(T.length >= 2, 'a trash enclosure per ~25,000 sf (two here), when turned on');
    for (const t of T) assert.ok(B.some(b => S.outline(b).some((p, i, r) => S.segDist([t.x, t.y], p, r[(i + 1) % r.length]) < 250)), 'every enclosure within 250 ft of a building');
    const pv = S.pavement({ ...plan, elements: o.elements }); assert.equal(pv.length, 1, 'drives and parking are one paved surface');
    const raw = o.elements.filter(e => e.kind === 'parking').reduce((s, e) => s + S.stalls(e).count, 0), A = S.accessible({ ...plan, elements: o.elements });
    assert.equal(A.stalls.length, S.adaCount(raw), 'every accessible stall the ADA table asks for'); assert.equal(m.spaces, raw - S.adaLoss(raw), 'a shared access aisle costs a stall per pair');
    for (const a of A.stalls) assert.ok(B.some(b => Math.hypot(a.sym[0] - b.x, a.sym[1] - b.y) < 200), 'accessible stalls by the buildings');
    assert.ok(S.entryMarks({ ...plan, elements: o.elements }).length >= 1, 'a stop bar at the entry');
  }
  const svg = G.planSVG({ ...plan, elements: opts[0].elements, program: opts[0].program }).svg; assert.ok(svg.includes('clip-path') && svg.includes(G.PALETTE.ada), 'one curb line round the paving, accessible stalls drawn');
}
// ---- stormwater: detention, retention, underground, none ----
{
  assert.equal(S.stormNeed(10).mode, 'detention'); assert.ok(Math.abs(S.stormNeed(10).volume - 5.5) < 1e-9 && Math.abs(S.stormNeed(10).area - 5.5 * 43560 / 5 * 1.2) < 1, '0.55 ac-ft an acre, 5 ft deep, a fifth for slopes');
  assert.equal(S.stormNeed(0.6).mode, 'none', 'under an acre: no pond by default'); assert.equal(S.stormNeed(10, {}, { storm: 'underground' }).area, 0, 'vaults take no land');
  assert.equal(S.stormNeed(10, { storm: { rate: 1, depth: 4 } }).volume, 10);
  const plan = siteOf(fm362, true);
  const u = L.layoutOptions(plan, { use: 'multifamily', units: 120, storm: 'underground' })[0]; assert.ok(!u.elements.some(e => e.kind === 'pond') && u.notes.some(n => /underground/.test(n)), 'underground: no pond, a note on the vaults');
  const w = L.layoutOptions({ ...plan, params: { storm: { mode: 'retention' } } }, { use: 'multifamily', units: 120 })[0]; assert.ok(w.elements.some(e => e.kind === 'pond' && /Retention/.test(e.name)), 'retention: a wet pond');
  const sw = S.stormOf({ ...plan, elements: u.elements, program: u.program }); assert.ok(sw.vault > 1 && sw.mode === 'underground');
}
// ---- trash enclosures by the rules ----
{
  const plan = { ...siteOf(fm362, true), params: { trash: { mode: 'auto' } } }, mf = L.layoutOptions(plan, { use: 'multifamily' })[0], m = S.metrics({ ...plan, elements: mf.elements, program: mf.program });
  assert.equal(L.layoutOptions(siteOf(fm362, true), { use: 'multifamily' })[0].elements.filter(e => e.kind === 'trash').length, 0, 'left out unless turned on (the default)');
  assert.equal(L.layoutOptions(siteOf(fm362, true), { use: 'retail', gfa: 28000 })[0].elements.filter(e => e.kind === 'trash').length, 0, 'shops too: none unless asked for');
  const asked = S.guessProgram('28,000 sf retail strip with dumpsters'); assert.ok(asked.trash); assert.ok(L.layoutOptions(siteOf(fm362, true), asked)[0].elements.some(e => e.kind === 'trash'), 'asked for: there');
  assert.equal(mf.elements.filter(e => e.kind === 'trash').length, Math.ceil(m.units / 50), 'apartments: a double enclosure per ~50 units');
  const th = L.layoutOptions(plan, { use: 'townhomes' })[0]; assert.equal(th.elements.filter(e => e.kind === 'trash').length, 0, 'homes roll carts to the curb');
  const off = L.layoutOptions({ ...plan, params: { trash: { mode: 'none' } } }, { use: 'retail', gfa: 28000 })[0]; assert.equal(off.elements.filter(e => e.kind === 'trash').length, 0, 'turned off');
  assert.equal(S.trashNeeds({ ...plan, program: { use: 'multifamily' }, elements: [{ kind: 'building', use: 'multifamily', x: 0, y: 0, w: 200, d: 60, units: 240 }] }).map(t => t.type).join(), 'compactor,double', 'a compactor from 200 units, with recycling');
}
// ---- building shapes, garages, the paving's holes, 3D detail ----
{
  const b = { kind: 'building', x: 0, y: 0, w: 200, d: 120, rot: 0, floors: 3 };
  assert.equal(S.footArea(b), 24000); assert.ok(S.footArea({ ...b, form: 'L' }) < 24000 && S.footArea({ ...b, form: 'U' }) < 24000 && S.footArea({ ...b, form: 'U' }) > S.footArea({ ...b, form: 'L' }), 'L and U leave a courtyard');
  const tw = { ...b, form: 'tower', podium: 2, floors: 10 }; assert.ok(S.gfaOf(tw) > 24000 * 2 && S.gfaOf(tw) < 24000 * 10, 'a tower: podium floors over the footprint, tower floors over its own');
  const site = { ...siteOf(fm362, true), program: { use: 'office' } }, g = { id: 'g', kind: 'garage', x: 0, y: 0, w: 180, d: 120, rot: 0, levels: 4 };
  assert.equal(S.metrics({ ...site, elements: [g] }).spaces, Math.floor(180 * 120 * 4 / 330), 'a garage counts its spaces');
  // a drive loop round a lawn: one paved surface with a hole, not two surfaces
  const loop = [{ kind: 'drive', x: 0, y: 100, w: 300, d: 24, rot: 0 }, { kind: 'drive', x: 0, y: -100, w: 300, d: 24, rot: 0 }, { kind: 'drive', x: -138, y: 0, w: 24, d: 224, rot: 0 }, { kind: 'drive', x: 138, y: 0, w: 24, d: 224, rot: 0 }];
  const pv = S.pavement({ ...site, elements: loop }); assert.equal(pv.length, 1); assert.equal(pv[0].holes.length, 1, 'the lawn inside the loop is a hole');
  const fc = S.planFeatures({ ...site, origin: site.origin, elements: [{ ...b, id: 'b1', form: 'U' }, { id: 'p', kind: 'parking', x: 0, y: -160, w: 180, d: 60, rot: 0 }], params: { trees: true } });
  const ks = new Set(fc.features.map(f => f.properties.k)); assert.ok(ks.has('b3') && ks.has('tree'), '3D detail (parapets, floor lines) and 3D trees');
  assert.ok(fc.features.filter(f => f.properties.k === 'b3' && f.properties.part === 'floor').length === 2, 'a line at each floor between three floors');
  const fo = L.layoutOptions({ ...siteOf(fm362, true), params: { form: 'U' } }, { use: 'multifamily', floors: 4 })[0]; usable(siteOf(fm362, true), fo, 'courtyard buildings');
  assert.ok(fo.elements.some(e => e.kind === 'building' && e.form === 'U'), 'courtyard (U) apartment buildings when asked for');
}

// ---- a duplex/townhome count that doesn't fit on lots: rows on a shared parking court (the Waller Tomball tract, a
// 1.46-acre 178 x 357 ft survey, street on the south, Fields Store Rd on the west); "pull through" adds a second drive ----
{
  const W = mk([-95.9339, 30.0598], [[0, 0], [178.001, 0.578], [184.601, 357.497], [6.602, 356.919]]), b = S.unionParcels([W]), front = b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[1] < -0.9);
  const west = b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9);
  const prog = S.guessProgram('A twenty four unit duplex community with a pull through drive. No detention pond needed.');
  assert.deepEqual([prog.use, prog.units, prog.storm, prog.through], ['duplex', 24, 'underground', true], 'words to a program: "twenty four", "no pond", "pull through"');
  const plan = { ...b, front, streets: [west], setbacks: { ...S.SETBACKS }, program: prog }, opts = L.layoutOptions(plan, prog);
  assert.ok(opts.length >= 1 && opts.every(o => !/Simple layout/.test(o.name)), opts.map(o => o.name).join());
  const o = opts[0], p = { ...plan, elements: o.elements, program: o.program }, m = S.metrics(p);
  assert.equal(m.units, 24, 'all 24 units: ' + o.notes.join(' ')); assert.ok(m.spaces >= m.required, m.spaces + '/' + m.required);
  assert.deepEqual(S.check(p).filter(i => i.level === 'bad').map(i => i.text), []);
  const B = o.elements.filter(e => e.kind === 'building'); assert.ok(B.every(e => e.units === 6 && e.unitW === 19 && e.floors === 2), 'six-unit two-story rows');
  const pt = o.elements.find(e => e.name === 'Second entry'); assert.ok(pt?.through, 'a pull-through drive');
  assert.ok(pt.poly.some(q => S.segDist(q, b.ring[west], b.ring[(west + 1) % 4]) < 1.5), 'it reaches the side street');
  assert.ok(B.every(e => S.outline(e).every(q => !S.inRing(q, pt.poly))), 'between buildings, not through one');
  const d = S.details(p); assert.equal(d.patios.length, 24, 'a fenced patio behind every unit'); assert.ok(d.patios.every(q => q.poly.every(c => S.inRing(c, b.ring))));
  assert.ok(S.edgeRules(b.ring, front, plan.setbacks, [west])[west].street && S.edgeRules(b.ring, front, plan.setbacks, [west])[west].build === 25, 'a side street takes the street setback');
  const none = L.layoutOptions({ ...plan, streets: [] }, prog)[0]; assert.ok(!none.elements.some(e => e.through) && none.notes.some(t => /Side Street/.test(t)), 'no side street marked: says how to add one');
  // a local edit: move one building and only it changes; the parking under it gives way in whole stalls
  { const els = structuredClone(o.elements), b1 = els.find(e => e.name === 'Bldg 1'), rows0 = els.filter(e => e.kind === 'parking'), n0 = rows0.reduce((s2, e) => s2 + S.stalls(e).count, 0);
    b1.x -= 30; const cut = S.cutRows(els, S.outline(b1), 5), rows = cut.filter(e => e.kind === 'parking');
    assert.ok(rows.every(r => !S.rectsOverlap({ ...b1, w: b1.w + 10, d: b1.d + 10 }, r)), 'no stall left under the moved building (5 ft clear)');
    assert.ok(rows.reduce((s2, e) => s2 + S.stalls(e).count, 0) < n0 && rows.every(r => Math.abs(r.w / 9 - Math.round(r.w / 9)) < 1e-6 || Math.abs(r.d / 9 - Math.round(r.d / 9)) < 1e-6), 'whole stalls');
    assert.deepEqual(cut.filter(e => e.kind !== 'parking'), els.filter(e => e.kind !== 'parking'), 'nothing else moves');
    assert.ok(new Set(rows.map(r => r.id).filter(Boolean)).size === rows.filter(r => r.id != null).length, 'no doubled ids'); }
  { const els = structuredClone(o.elements), b3 = els.find(e => e.name === 'Bldg 3'), p2 = { ...plan, elements: els };
    b3.x -= 40; const [dx, dy] = S.settleShift(p2, b3); b3.x += dx; b3.y += dy;
    assert.ok(!S.check(p2).some(i => i.id === b3.id && /setback/.test(i.text)) && S.corners(b3).every(c => S.inRing(c, b.ring)), 'dragged into the street setback: settles back out');
    const e2 = structuredClone(o.elements), b4 = e2.find(e => e.name === 'Bldg 4'), x0 = b4.x; b4.x += 2; const [ax] = S.settleShift({ ...plan, elements: e2 }, b4); assert.ok(Math.abs(b4.x + ax - x0) < 0.01, 'within 3 ft of its old line: lines up again'); }
  const roads = [[[-200, -178 - 30], [300, -178 - 30]], [[-93 - 35, -400], [-86 - 35, 400]]].map(l => l.map(([x, y]) => [x, y]));
  assert.deepEqual(S.streetsFromRoads(b.ring, roads, front), [west], 'side street found from road lines');
}

// ---- curving neighbourhood streets: the same lots as straight streets, streets that bend, lots and homes that follow ----
{
  const g = mk([-95.70, 29.90], [[0, 0], [1400, 0], [1400, 620], [0, 620]]), b = S.unionParcels([g]), front = b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[1] < -0.9);
  const plan = { ...b, front, setbacks: { ...S.SETBACKS } }, homes = o => o.elements.filter(e => e.use === 'sfr').length;
  const cv = L.layoutOptions(plan, { use: 'sfr' }), st = L.layoutOptions({ ...plan, params: { streets: 'straight' } }, { use: 'sfr' });
  assert.ok(homes(cv[0]) >= homes(st[0]) * 0.95, 'curving costs (almost) no lots: ' + homes(cv[0]) + ' vs ' + homes(st[0]));
  for (const o of cv) usable(plan, o, 'curving streets');
  const streets = cv[0].elements.filter(e => e.kind === 'drive' && e.path && e.path.length > 8), turn = P => { let m = 0; for (let i = 1; i + 1 < P.length; i++) { const a = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]), c = Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]); m = Math.max(m, Math.abs(((c - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)); } return m; };
  assert.ok(streets.length && streets.some(e => { const P = e.path, ang = P.slice(1).map((q, i) => Math.atan2(q[1] - P[i][1], q[0] - P[i][0])); return Math.max(...ang) - Math.min(...ang) > 0.15; }), 'streets bend');
  assert.ok(streets.every(e => turn(e.path) < 0.5), 'smoothly, no kinks');
  assert.ok(cv[0].elements.filter(e => e.kind === 'lot').some(e => e.poly) && new Set(cv[0].elements.filter(e => e.use === 'sfr').map(e => Math.round(e.rot))).size > 3, 'lots bend and homes turn with the street');
  assert.ok(st[0].elements.filter(e => e.kind === 'drive' && e.path).every(e => turn(e.path) > 0.3 || e.path.length <= 8), 'straight when asked');
  const r = L.refit({ ...plan, program: { use: 'sfr' }, elements: cv[0].elements.map((e, i) => i === cv[0].elements.findIndex(x => x.use === 'sfr') ? { ...e, pinned: true } : e), recipe: cv[0].recipe });
  assert.ok(r && r.elements.filter(e => e.use === 'sfr').length >= homes(cv[0]) - 3, 're-fits a bent plan');
  assert.deepEqual(S.fillet([[0, 0], [10, 0], [10, 10]], 0), [[0, 0], [10, 0], [10, 10]], 'r 0: no rounding');
  // a roundabout where two bent streets meet (phase 2): they're cut back to it as bent paths still, joined to it, every
  // drive and home reached; a re-fit (the wave recipe, bent) keeps it there and joined
  { const base = { ...plan, program: { use: 'sfr' }, elements: cv[0].elements, recipe: cv[0].recipe }, bent = e => e?.kind === 'drive' && e.path?.length > 8, bad = els => S.check({ ...base, elements: els }).filter(i => i.level === 'bad').map(i => i.text);
    const j = S.junctionsOf(base).find(j => j.ids.filter(id => bent(base.elements.find(e => e.id === id))).length >= 2 && !S.addRoundabout(base, j.at).error); assert.ok(j, 'a junction of two bent streets with room');
    const r = S.addRoundabout(base, j.at), rb = r.roundabout, stubs = r.elements.filter(e => e.cut === rb.id), { seen, D } = reached(r.elements);
    assert.ok(stubs.length >= 2 && stubs.every(e => e.path && e.r === 0) && stubs.filter(e => e.path.length > 8).length >= 2, 'the bent streets cut back to it, bent still'); assert.deepEqual(overRing(rb, r.elements), []); assert.deepEqual(bad(r.elements), []);
    assert.deepEqual(D.filter(d => !seen.has(d.id)).map(d => d.id), [], 'every drive reached'); assert.deepEqual(offStreet(r.elements), [], 'every home on a street');
    const rf = L.refit({ ...base, elements: r.elements }, { keep: true }), rb2 = rf.elements.find(e => e.id === rb.id);
    assert.ok(rb2 && rb2.x === rb.x && rb2.y === rb.y && rf.elements.filter(e => e.cut === rb.id).length >= 2, 're-fitted: there, joined'); assert.deepEqual(overRing(rb2, rf.elements), []); assert.deepEqual(bad(rf.elements), []);
    assert.ok(homes(rf) >= homes({ elements: r.elements }) - 2 && !offStreet(rf.elements).length, homes(rf) + ' homes'); }
}

// ---- a restaurant on a 2.35-acre wedge with a curved highway frontage (squared with the street, not the long lot
// lines), with what was asked for beside it; and an ask far bigger than a site holds comes back as the most that fits ----
{
  const arc = Array.from({ length: 11 }, (_, i) => { const t = (i + 1) / 12; return [560 - 560 * t, -10 + 10 * t - 40 * Math.sin(Math.PI * t)]; });
  const g = mk([-95.95, 30.08], [[0, 0], [290, 310], [560, -10], ...arc]), b = S.unionParcels([g]), front = b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[1] < -0.95), plan = { ...b, front, setbacks: { ...S.SETBACKS } };
  const prog = S.guessProgram('A single large restaurant space with outdoor seating, grass area with a playground.'); assert.deepEqual(prog.extras, ['patio', 'playground', 'lawn']);
  const opts = L.layoutOptions(plan, prog); assert.ok(opts.length >= 2 && opts.every(o => !/Simple layout/.test(o.name)), opts.map(o => o.name).join());
  for (const o of opts) { const p = { ...plan, elements: o.elements, program: o.program }, m = S.metrics(p), k = new Set(o.elements.map(e => e.kind));
    assert.ok(m.spaces >= m.required && m.gfa > 3000, o.name + ': a parked restaurant ' + m.spaces + '/' + m.required);
    for (const want of ['building', 'parking', 'drive', 'play']) assert.ok(k.has(want), o.name + ': has ' + want);
    assert.ok(!k.has('trash'), o.name + ': no dumpster unless asked for');
    assert.ok(o.elements.some(e => e.name === 'Main entry') && o.elements.some(e => e.name === 'Lawn'), 'an entry and a lawn');
    assert.deepEqual(S.check(p).filter(i => i.level === 'bad').map(i => i.text), []); }
  assert.ok(opts.some(o => o.elements.some(e => e.kind === 'patio')), 'outdoor seating against the building');
  const W = S.unionParcels([mk([-95.9339, 30.0598], [[0, 0], [178.001, 0.578], [184.601, 357.497], [6.602, 356.919]])]), wf = W.ring.findIndex((p, i) => S.outwardOf(W.ring, i)[1] < -0.9), wp = { ...W, front: wf, setbacks: { ...S.SETBACKS } };
  for (const ask of [{ use: 'retail', gfa: 100000 }, { use: 'office', gfa: 100000 }, { use: 'multifamily', units: 300 }]) {
    const o = L.layoutOptions(wp, ask)[0], p = { ...wp, elements: o.elements, program: o.program }, m = S.metrics(p);
    assert.ok(m.spaces >= m.required && m.gfa > 5000 && !S.check(p).some(i => i.level === 'bad'), ask.use + ': the most that fits, parked: ' + m.gfa + ' sf ' + m.spaces + '/' + m.required);
    assert.ok(o.notes.some(t => /won’t fit on 1\.46 acres/.test(t)), o.notes.join(' '));
  }
}

// ---- the building library ----
{
  const B = await import('../lib/buildings.mjs');
  assert.ok(B.BUILDING_TYPES.length >= 200 && new Set(B.BUILDING_TYPES.map(t => t.id)).size === B.BUILDING_TYPES.length, 'hundreds of types, each its own id');
  for (const g of ['Apartments', 'Townhomes', 'Single-family homes', 'Restaurants', 'Shops', 'Offices', 'Industrial']) assert.ok(B.BUILDING_TYPES.some(t => t.group === g), g);
  assert.ok(B.HOUSE_PLANS.length >= 20 && B.HOUSE_PLANS.every(h => h.lotW >= h.w + 10), 'house plans that fit their lots');
  const t = B.BUILDING_TYPES.find(x => x.family === 'garden' && x.floors === 3 && x.w === 180), e = { id: 'x', ...B.fromType(t, [0, 0], 0) };
  assert.equal(S.metrics({ ring: [[-200, -200], [200, -200], [200, 200], [-200, 200]], program: { use: 'multifamily' }, elements: [e] }).units, t.units, 'a library building counts its units');
  const g = mk([-95.70, 29.90], [[0, 0], [1400, 0], [1400, 620], [0, 620]]), b = S.unionParcels([g]), o = L.layoutOptions({ ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[1] < -0.9), setbacks: { ...S.SETBACKS } }, { use: 'sfr' }, { count: 1 })[0];
  assert.ok(new Set(o.elements.filter(e2 => e2.use === 'sfr').map(e2 => e2.type)).size >= 6, 'homes vary through the house plans');
}
// ---- amenities where people use them: one pool, by its clubhouse, on the drive ----
{
  const plan = siteOf(tract), near = (a, b) => S.gapBetween(S.shapeOf(a), S.shapeOf(b));
  assert.deepEqual([...L.commonsWants(['Pool', 'clubhouse', 'playground'], { clubhouse: true })].sort(), ['playground'], 'the apartments’ clubhouse and pool serve: no second ones in the commons');
  assert.deepEqual([...L.commonsWants(['pool'], { clubhouse: true, homes: true })].sort(), ['center', 'pool'], 'homeowners get their own centre, with its pool');
  // apartments with a commons the program filled with a centre and a pool (as the AI may ask): one pool, at the clubhouse by the entry
  const opts = L.layoutOptions(plan, { use: 'mixed', zones: [{ use: 'multifamily', units: 240, floors: 3 }, { use: 'amenity', items: ['center', 'pool', 'playground', 'pavilion'] }] });
  for (const o of opts) {
    const P = o.elements.filter(e => e.kind === 'pool'), club = o.elements.filter(e => e.kind === 'building' && e.use === 'amenity' && /club|center/i.test(e.name || ''));
    assert.equal(P.length, 1, o.name + ': one pool, not ' + P.length);
    assert.ok(club.some(c => near(P[0], c) <= 30), o.name + ': the pool is beside its clubhouse');
    const entry = o.elements.find(e => e.name === 'Main entry'), drives = o.elements.filter(e => e.kind === 'drive');
    for (const a of o.elements.filter(e => e.kind === 'play' || e.name === 'Pavilion')) assert.ok(drives.some(d => near(a, d) <= 40), o.name + ': ' + (a.name || a.kind) + ' sits on the drive, not out in the park');
    assert.ok(entry && !S.check({ ...plan, elements: o.elements, program: o.program }).some(i => /pool/i.test(i.text)), o.name + ': no pool warnings');
  }
  // homes and a commons with a pool: the pool comes with its community centre, on a deck against it
  const big = siteOf(mk([-95.97, 30.07], [[-610, 0], [1933, 0], [2594, 865], [2391, 1780], [0, 1780]])); big.front = S.unionParcels([mk([-95.97, 30.07], [[-610, 0], [1933, 0], [2594, 865], [2391, 1780], [0, 1780]])]).ring.findIndex((p, i, r) => S.outwardOf(r, i)[1] < -0.9);
  const o2 = L.layoutOptions(big, { use: 'mixed', zones: [{ use: 'sfr' }, { use: 'amenity', items: ['pool', 'playground'] }] }, { count: 1 })[0];
  const cc = o2.elements.find(e => e.name === 'Community center'), pl2 = o2.elements.filter(e => e.kind === 'pool');
  assert.ok(cc && pl2.length === 1 && near(pl2[0], cc) <= 15 && o2.elements.some(e => e.kind === 'plaza' && /pool deck/i.test(e.note || '') && near(e, cc) <= 1), 'the community centre with its pool on a deck');
  // the checks flag a pool out on its own, and a second one
  const ring = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]], c0 = { id: 'c', kind: 'building', use: 'amenity', name: 'Clubhouse', x: 200, y: 200, w: 90, d: 60, rot: 0 };
  const p1 = { id: 'p1', kind: 'pool', name: 'Pool', x: 290, y: 200, w: 70, d: 32, rot: 0 }, p2 = { id: 'p2', kind: 'pool', name: 'Pool', x: 700, y: 800, w: 70, d: 32, rot: 0 };
  assert.deepEqual(S.check({ ring, front: 0, elements: [c0, p1] }).map(i => i.text), []);
  const w2 = S.check({ ring, front: 0, elements: [c0, p1, p2] }); assert.ok(w2.some(i => i.id === 'p2' && /away from the clubhouse/.test(i.text)) && w2.some(i => /2 pools/.test(i.text)), w2.map(i => i.text).join(' / '));
}

// ---- moving a building in Edit Layout (a real apartment plan: bars packed between drive aisles) ----
{
  const plan = siteOf(tract), o = L.layoutOptions(plan, { use: 'multifamily', units: 240, floors: 3 }, { count: 1 })[0], base = { ...plan, elements: o.elements, program: o.program };
  const overlaps = els => S.check({ ...base, elements: els }).filter(i => /overlaps|setback|outside/.test(i.text));
  assert.deepEqual(overlaps(o.elements), []);
  const stalls = els => els.filter(e => e.kind === 'parking').reduce((s, e) => s + S.stalls(e).count, 0), s0 = stalls(o.elements);
  // as the editor does it: follow the pointer, settle (edges, setbacks), then the nearest clear spot; carried pieces move along; parking gives way
  const drop = (els, id, dx, dy, spare = []) => {
    const p = { ...base, elements: els }, B = els.find(e => e.id === id), att = S.attachedTo(p, B), obs = S.spotObstacles(p, B, att), el = S.moveBy(structuredClone(B), dx, dy);
    const [sx, sy] = S.settleShift(p, el); S.moveBy(el, sx, sy);
    const carry = att.map(a => S.moveBy(structuredClone(a), el.x - B.x, el.y - B.y)), c = S.clearSpot({ ...p, elements: els.map(e => e.id === id ? el : carry.find(a => a.id === e.id) || e) }, el, { carry, obs });
    if (c) { S.moveBy(el, c[0], c[1]); for (const a of carry) S.moveBy(a, c[0], c[1]); }
    let out = els.map(e => e.id === id ? el : carry.find(a => a.id === e.id) || e); out = S.cutRows(out, S.outline(el), 5, spare); for (const a of carry) out = S.cutRows(out, S.outline(a), 1, spare);
    for (const g of [B, ...att]) out = S.regrowRows(out, S.outline(g), 5, spare);
    return { els: out, el, att, c, spare };
  };
  const apt = o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily'), b = apt[Math.floor(apt.length / 2)], others = o.elements.filter(e => e.kind === 'building' && e.id !== b.id).map(e => e.x + ',' + e.y).join();
  for (const [dx, dy] of [[50, 0], [-50, 0], [0, 40], [25, 25]]) {
    const r = drop(o.elements, b.id, dx, dy);
    assert.ok(r.c, 'a clear spot near (' + dx + ', ' + dy + ')'); assert.deepEqual(overlaps(r.els), [], 'dropped ' + dx + ',' + dy + ': no overlaps');
    assert.equal(r.els.filter(e => e.kind === 'building' && e.id !== b.id).map(e => e.x + ',' + e.y).join(), others, 'nothing else moves');
    // and back again: the parking it cut grows back
    const back = drop(r.els, b.id, b.x - r.el.x, b.y - r.el.y, r.spare); assert.ok(Math.hypot(back.el.x - b.x, back.el.y - b.y) < 1, 'it goes back to its spot');
    assert.ok(stalls(back.els) >= s0 - 2, 'parking grows back: ' + stalls(back.els) + ' of ' + s0);
  }
  // the clubhouse takes its pool deck and pool with it
  const club = o.elements.find(e => e.name === 'Clubhouse'), r = drop(o.elements, club.id, 0, -30);
  assert.deepEqual(r.att.map(a => a.kind).sort(), ['plaza', 'pool']); const pool = r.els.find(e => e.kind === 'pool');
  assert.ok(S.gapBetween(S.shapeOf(pool), S.shapeOf(r.el)) <= 30 && !S.check({ ...base, elements: r.els }).some(i => /pool|overlaps/i.test(i.text)), 'the pool is still at the clubhouse');
}
// ---- changes by name (Change With AI), applied to a real apartment plan, then re-fitted ----
{
  const E = await import('../lib/siteedit.mjs');
  const plan = siteOf(tract), o = L.layoutOptions(plan, { use: 'multifamily', units: 240, floors: 3 }, { count: 1 })[0], base = { ...plan, elements: o.elements, program: o.program, recipe: o.recipe };
  const by = (els, n) => els.find(e => e.name === n), bad = els => S.check({ ...base, elements: els }).filter(i => i.level === 'bad').map(i => i.text);
  // the sheet's frame: the street along the bottom
  const f = E.sheetFrame(base), fi = base.front ?? S.longestEdge(base.ring), fr = base.ring[fi], fr2 = base.ring[(fi + 1) % base.ring.length];
  assert.ok(Math.abs(f.to(fr)[1]) < 1 && Math.abs(f.to(fr2)[1]) < 1, 'the street edge is y = 0'); const q = f.from(f.to([123, 456])); assert.ok(Math.hypot(q[0] - 123, q[1] - 456) < 1e-6);
  const d = E.describePlan(base, by(o.elements, 'Apt Bldg 7').id); assert.ok(d.pieces.some(p => p.name === 'Apt Bldg 7' && p.selected) && d.pieces.some(p => p.name === 'Clubhouse') && !d.pieces.some(p => p.kind === 'parking'), 'the plan as the AI reads it');
  // plain words: four stories on one building, another removed; nothing else moves, parking where it left grows back
  const ops = E.guessEdits('Make apt bldg 7 four stories. Remove building 3', base);
  assert.deepEqual(ops.map(x => [x.action, o.elements.find(e => e.id === x.target)?.name, x.floors ?? null]), [['change', 'Apt Bldg 7', 4], ['remove', 'Apt Bldg 3', null]]);
  const b7 = by(o.elements, 'Apt Bldg 7'), r = E.applyEdits(base, ops), n7 = r.elements.find(e => e.id === b7.id);
  assert.equal(n7.floors, 4); assert.ok(n7.pinned && n7.x === b7.x && n7.y === b7.y, 'changed in place, pinned');
  if (b7.units) assert.equal(n7.units, Math.round(b7.units * 4 / 3), 'more floors, more units');
  assert.ok(!by(r.elements, 'Apt Bldg 3'), 'removed'); assert.deepEqual(bad(r.elements), []);
  assert.equal(r.elements.filter(e => e.kind === 'building' && e.id !== b7.id).map(e => e.x + ',' + e.y).join(), o.elements.filter(e => e.kind === 'building' && e.id !== b7.id && e.name !== 'Apt Bldg 3').map(e => e.x + ',' + e.y).join(), 'nothing else moves');
  assert.ok(S.metrics({ ...base, elements: r.elements }).units > S.metrics(base).units - (by(o.elements, 'Apt Bldg 3').units || 40), 'units: the extra floor counts');
  // a bigger clubhouse from the library takes the old one's place; its pool stays with it
  const club = by(o.elements, 'Clubhouse'), rc = E.applyEdits(base, E.guessEdits('make the clubhouse a 7,500 sf clubhouse', base)), nc = rc.elements.find(e => e.id === club.id);
  assert.equal(nc.type, 'clubhouse-clubhouse-7-500-sf'); assert.equal(nc.name, 'Clubhouse'); assert.ok(Math.hypot(nc.x - club.x, nc.y - club.y) < 60, 'about where it was');
  const pool = rc.elements.find(e => e.kind === 'pool'); assert.ok(S.gapBetween(S.shapeOf(pool), S.shapeOf(nc)) <= 30, 'the pool still beside it'); assert.deepEqual(bad(rc.elements), []);
  // a swap: two buildings trade places
  const b2 = by(o.elements, 'Apt Bldg 2'), b5 = by(o.elements, 'Apt Bldg 5'), rs = E.applyEdits(base, E.guessEdits('swap bldg 2 and bldg 5', base));
  assert.ok(Math.hypot(rs.elements.find(e => e.id === b2.id).x - b5.x, rs.elements.find(e => e.id === b2.id).y - b5.y) < 1, 'swapped');
  // the AI's move, in the sheet's frame: the clubhouse to the back, beside the last building; then a full re-fit round it
  const back = d.pieces.filter(p => p.kind === 'building').sort((a, b2) => b2.at[1] - a.at[1])[0];
  const rm = E.applyEdits(base, [{ action: 'move', target: club.id, x: back.at[0], y: back.at[1] - 150 }], { refit: true }), mc = rm.elements.find(e => e.id === club.id);
  assert.ok(f.to([mc.x, mc.y])[1] > f.to([club.x, club.y])[1] + 100 && rm.elements.filter(e => e.kind === 'pool').every(p => S.gapBetween(S.shapeOf(p), S.shapeOf(mc)) <= 30), 'moved back, its pool with it');
  const rf = L.refit({ ...base, elements: rm.elements }, { amount: 'current' }); assert.ok(rf, 'the rest re-fits');
  assert.equal(!!rf.fresh, !!rf.recipe, 'a re-fit from the from-scratch search (new drives, a recipe of its own) says so');
  // Change With AI keeps the arrangement: never the from-scratch search; when its own re-fit isn't clean it says so and
  // points to New Layouts (Oct 19)
  { const rk = L.refit({ ...base, elements: rm.elements }, { amount: 'current', keep: true }), pin = new Set(rm.elements.filter(e => e.pinned).map(e => e.id));
    assert.ok(rk && !rk.fresh && !rk.recipe, 'kept: the layout’s own recipe'); const pk = { ...base, elements: rk.elements }, mk2 = S.metrics(pk), clean = mk2.spaces >= mk2.required && !S.check(pk).some(i => i.level === 'bad' && !pin.has(i.id));
    assert.equal(!!rk.kept, !clean, 'marked kept only when it isn’t clean'); if (rk.kept) assert.ok(rk.notes.some(t => /New Layouts/.test(t)), rk.notes.join(' ')); }
  const names = rf.elements.filter(e => e.kind === 'building' && e.name).map(e => e.name); assert.equal(new Set(names).size, names.length, 'no two buildings share a name');
  const kept = rf.elements.find(e => e.id === club.id); assert.ok(kept && Math.hypot(kept.x - mc.x, kept.y - mc.y) < 0.5, 'the changed piece stays where it was put');
  const m0 = S.metrics(base), m1 = S.metrics({ ...base, elements: rf.elements });
  assert.deepEqual(bad(rf.elements), []); assert.ok(m1.spaces >= m1.required && m1.units >= m0.units * 0.85, 'parked, and about the same amount of housing: ' + m1.units + ' vs ' + m0.units);
  assert.equal(rf.elements.filter(e => e.kind === 'pool').length, 1, 'still one pool');
}
// ---- more than one way in: entrances added by hand, by the AI's edits, or asked for in the program ----
{
  const E = await import('../lib/siteedit.mjs');
  const T0 = siteOf(tract), T = { ...T0, front: T0.ring.findIndex((p, i) => S.outwardOf(T0.ring, i)[1] < -0.9) }, side = T.ring.findIndex((p, i) => S.outwardOf(T.ring, i)[0] > 0.9); // street along the south; the east lot line a side street
  const plan = { ...T, streets: [side] }, o = L.layoutOptions(plan, { use: 'multifamily', units: 240, floors: 3, entrances: 1 }, { count: 1 })[0], base = { ...plan, elements: o.elements, program: o.program }; // (one way in to start: the rest come by hand below)
  const bad = els => S.check({ ...base, elements: els }).filter(i => i.level === 'bad').map(i => i.text), m0 = S.metrics(base);
  // by hand: a click on the side street, part way back
  const a = T.ring[side], b = T.ring[(side + 1) % T.ring.length], at = [a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45];
  const r = S.addEntrance(base, at, { id: 'ent2' }); assert.ok(!r.error, r.error); assert.equal(r.entrance.name, 'Entrance 2'); assert.ok(r.entrance.pinned && r.entrance.entry);
  const p1 = { ...base, elements: r.elements }; assert.deepEqual(bad(r.elements), []);
  const { seen } = reached(r.elements); assert.ok(seen.has('ent2'), 'the new driveway joins the drives from the main entry');
  assert.ok(S.metrics(p1).spaces >= m0.spaces - 12, 'it costs only the stalls it crosses: ' + S.metrics(p1).spaces + ' vs ' + m0.spaces);
  assert.equal(S.entryMarks(p1).filter(l => l.color === '#ffffff').length, S.entrancesOf(r.elements).filter(e => !e.through).length, 'a stop bar at each entrance');
  // no stalls in its mouth: within 50 ft of the street, beside the driveway, cars backing out would meet cars turning in
  const mouthy = els => S.check({ ...base, elements: els }).filter(i => /is at the mouth of/.test(i.text));
  assert.deepEqual(mouthy(r.elements).map(i => i.text), [], 'the new entrance clears its mouth');
  for (const q of [o, ...L.layoutOptions(plan, { use: 'multifamily', units: 240, floors: 3 })]) assert.deepEqual(mouthy(q.elements).map(i => i.text), [], (q.name || '') + ': nothing parked at an entrance\'s mouth');
  { const ent = S.entrancesOf(r.elements).find(e => e.id === 'ent2'), c = S.centroid(S.shapeOf(ent)), n = S.outwardOf(T.ring, side), stall = { id: 'st', kind: 'parking', x: c[0] - n[0] * 10, y: c[1] - n[1] * 10 + 20, w: 18, d: 9, rot: 0, row: 1 };
    const p2 = r.elements.concat([{ ...stall, x: a[0] + (b[0] - a[0]) * 0.45 - n[0] * 30, y: a[1] + (b[1] - a[1]) * 0.45 - n[1] * 30 + 22 }]);
    assert.ok(mouthy(p2).some(i => i.id === 'st'), 'a stall dropped beside the driveway near the street is flagged'); }
  // a lot line that isn't a street becomes one; a click where nothing connects says why
  const back = T.ring.findIndex((p, i) => S.outwardOf(T.ring, i)[1] > 0.9), r2 = S.addEntrance(base, [(T.ring[back][0] + T.ring[(back + 1) % T.ring.length][0]) / 2, (T.ring[back][1] + T.ring[(back + 1) % T.ring.length][1]) / 2]);
  if (!r2.error) assert.ok(r2.streets.includes(back) && /now marked as a street/.test(r2.note)); else assert.match(r2.error, /No way in/);
  // automatic: as far from the others as the streets allow, at least 150 ft apart
  const m = S.moreEntrances(base, 2); assert.equal(m.added.length, 2, m.note);
  const cs = S.entrancesOf(m.elements).map(e => S.centroid(S.shapeOf(e))); for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) assert.ok(Math.hypot(cs[i][0] - cs[j][0], cs[i][1] - cs[j][1]) >= 140, 'entrances spaced apart');
  assert.deepEqual(bad(m.elements), []);
  // in the program: "two entrances" from the words gives two in every option
  assert.equal(S.guessProgram('240 apartments with two entrances').entrances, 2); assert.equal(S.guessProgram('a retail strip with a second driveway').entrances, 2); assert.equal(S.normalizeProgram({ use: 'retail' }).entrances, null);
  const two = L.layoutOptions(plan, S.guessProgram('240 apartments, 3 stories, two entrances'), { count: 2 }); assert.ok(S.entrancesOf(two[0].elements).length >= 2, 'the first option has both ways in');
  for (const op of two) assert.ok(!bad(op.elements).length && (S.entrancesOf(op.elements).length >= 2 || op.notes.some(t => /No room for another entrance/.test(t))), op.name + ': two ways in, or says why not');
  // Change With AI: "add a second entrance" (words), and the AI's own point on the lot line (sheet frame: x along, y = 0 the street)
  const ops = E.guessEdits('add another entrance', base); assert.deepEqual(ops, [{ action: 'add', kind: 'entrance' }]);
  const re = E.applyEdits(base, ops); assert.equal(S.entrancesOf(re.elements).length, 2, re.skipped.join(' '));
  const f = E.sheetFrame(base), fa = f.to(T.ring[T.front]), fb = f.to(T.ring[(T.front + 1) % T.ring.length]);
  const ra = E.applyEdits(base, [{ action: 'add', kind: 'entrance', x: (fa[0] + fb[0]) / 2 + 200, y: 0 }]); assert.ok(ra.done.length || ra.skipped.length);
}
// ---- the most a site holds: shops, offices and warehouses grow to what the parking carries; garages; homes fill; housing types ranked ----
{
  const PF = await import('../lib/proforma.mjs');
  const H = S.unionParcels([mk([-95.70, 30.02], [[0, 0], [1180, 0], [1330, 1520], [150, 1520]])]), hk = { ...H, front: H.ring.findIndex((p, i) => S.outwardOf(H.ring, i)[1] < -0.9), setbacks: { ...S.SETBACKS } };
  const ask = { use: 'mixed', zones: [{ use: 'retail', gfa: 60000 }, { use: 'medical', gfa: 60000, floors: 3 }, { use: 'office', gfa: 80000, floors: 3 }, { use: 'industrial', gfa: 120000 }] };
  const opts = L.layoutOptions(hk, ask);
  for (const o of opts) {
    const p = { ...hk, elements: o.elements, program: o.program }, m = S.metrics(p), B = o.elements.filter(e => e.kind === 'building'), by = u => B.filter(e => e.use === u).reduce((t, e) => t + S.gfaOf(e), 0);
    assert.ok(!B.some(e => ['duplex', 'sfr', 'townhomes'].includes(e.use)), o.name + ': warehouse land, never homes');
    assert.ok(by('industrial') >= 120000 * 0.97 && o.elements.some(e => e.kind === 'truck'), o.name + ': the warehouse with its truck court');
    for (const z of ask.zones) assert.ok(by(z.use) >= z.gfa * 0.97, o.name + ': at least the ' + z.gfa + ' sf of ' + z.use + ' asked (' + Math.round(by(z.use)) + ')');
    assert.ok(m.gfa >= 320000 * 1.25, o.name + ': far more leasable floor area than asked when the land holds it: ' + Math.round(m.gfa));
    assert.ok(m.spaces >= m.required, o.name + ': still parked ' + m.spaces + '/' + m.required);
    assert.ok(!o.elements.some(e => e.kind === 'trash'), 'no dumpsters unless asked for');
    assert.ok(o.elements.filter(e => /pad site/i.test(e.name || '')).length <= 2, 'two future pads at most');
    assert.deepEqual(S.check(p).filter(i => i.level === 'bad').map(i => i.text), []);
  }
  // a garage where the words put it: built, counted, and the plan still parked
  const g = S.guessProgram('A mixed use development with retail in the front, medical and office in the middle, a parking garage behind that and warehouse/storage in the back');
  assert.deepEqual(S.normalizeProgram(g).zones.map(z => z.use), ['retail', 'office', 'medical', 'garage', 'industrial']);
  const og = L.layoutOptions(hk, { ...g, zones: g.zones.map(z => ({ ...z, gfa: { retail: 60000, office: 80000, medical: 60000, industrial: 120000 }[z.use] ?? null })) }, { count: 1 })[0], pg = { ...hk, elements: og.elements, program: og.program }, mg = S.metrics(pg), gar = og.elements.filter(e => e.kind === 'garage');
  assert.ok(gar.length === 1 && S.garageStalls(gar[0]) >= 200, 'a parking garage: ' + gar.map(e => S.garageStalls(e)).join());
  assert.ok(mg.spaces >= mg.required && !S.check(pg).some(i => i.level === 'bad'), 'parked, garage counted: ' + mg.spaces + '/' + mg.required);
  // homes with a count on a big tract: the land fills past the count (one plan, not a phase 1 and a later phase, unless
  // Phase 2 is asked for), and the detention still fits (or the plan says so)
  const N = S.unionParcels([mk([-95.96, 30.07], [[0, 0], [2600, 0], [2600, 1700], [0, 1700]])]), nb = { ...N, front: N.ring.findIndex((p, i) => S.outwardOf(N.ring, i)[1] < -0.9), setbacks: { ...S.SETBACKS } };
  const prog = { use: 'mixed', zones: [{ use: 'retail', gfa: 60000 }, { use: 'sfr', units: 250 }, { use: 'amenity', items: ['lake', 'center', 'pool', 'playground'] }] }, on = L.layoutOptions(nb, prog, { count: 1 })[0], mn = S.metrics({ ...nb, elements: on.elements, program: on.program });
  const need = S.stormNeed(S.ringArea(N.ring) / 43560, {}, S.normalizeProgram(prog)).area;
  assert.ok(mn.units > 250 * 1.1 && on.notes.some(t => /250 homes asked for; the land holds [\d,]+, so the plan builds them all/.test(t)), 'more homes than asked, as one plan: ' + mn.units + ' · ' + on.notes.join(' / '));
  assert.ok(mn.pond >= need * 0.9 || on.notes.some(t => /detention the site needs/.test(t)), 'the detention fits, or the plan says how much doesn’t');
  // housing in general: the types a developer would weigh, ranked by value
  assert.ok(S.guessProgram('a multifamily rental community').compare && !S.guessProgram('240 apartments').compare);
  const T = siteOf(tract), hs = L.layoutOptions({ ...T, front: T.ring.findIndex((p, i) => S.outwardOf(T.ring, i)[1] < -0.9) }, S.guessProgram('a multifamily rental community'));
  assert.ok(hs.length >= 3 && new Set(hs.slice(0, 3).map(o => o.product)).size === 3 && hs.every(o => o.fin && o.fin.value > 0), hs.map(o => o.name).join(' | '));
  assert.ok(/Best value of the housing types tried/.test(hs[0].notes[0]));
  assert.ok(PF.quick({ ...T, elements: hs[0].elements, program: hs[0].program }).value === hs[0].fin.value);
}
// ---- a community center moved into the middle of the houses (with a pool beside it): the houses under it make way,
// nothing else is lost, and the detention stays the size it was (a re-fit used to drop whole streets of homes) ----
{
  const E = await import('../lib/siteedit.mjs'), site = { origin: [-95.93, 30.09], ring: [[-600, -450], [600, -450], [600, 450], [-600, 450]], front: 0, setbacks: { ...S.SETBACKS } };
  const home = { use: 'sfr', name: 'Single-story homes', floors: 1 }, prog = { use: 'sfr', max: true, storm: 'detention', unitSf: 2400, floors: 1, zones: [home, { use: 'amenity', name: 'Central community center and park', items: ['center', 'pool', 'playground', 'lawn'] }, home] }, o = L.layoutOptions({ ...site, params: { entry: { style: 'narrow' } } }, prog)[0], base = { ...site, program: o.program, elements: o.elements, recipe: o.recipe };
  // (laid out with the narrow entry, the plan these edits were written on: by default the 73-home layout with the full
  // boulevard and the second way in fire access needs goes first, ahead of this 75-home one with one way in)
  const m0 = S.metrics(base), cc = o.elements.find(e => e.kind === 'building' && e.use === 'amenity'); assert.ok(cc && m0.units > 50, 'a neighbourhood with its center: ' + m0.units + ' homes');
  { const all = L.layoutOptions(site, prog), on = L.layoutOptions({ ...site, params: { entry: { style: 'narrow' } } }, prog), un = q => S.metrics({ ...site, program: q.program, elements: q.elements }).units; // the full boulevard where it costs no more than 2% of the homes; else the narrow one and the notes say what it would cost
    assert.ok(un(all[0]) >= un(on[0]) || S.entrancesOf(all[0].elements).length > S.entrancesOf(on[0].elements).length && un(all[0]) >= un(on[0]) * 0.9, 'the first layout has no fewer homes, or has the second way in fire access needs: ' + un(all[0]) + ' vs ' + un(on[0])); // (the fire-access ranking, not the boulevard, puts it first)
    for (const q of all) { if (q.elements.find(e => e.name === 'Main entry').blvd) assert.ok(on.some(n => n.name === q.name && un(q) >= un(n) * 0.98), q.name + ': a boulevard, ' + un(q) + ' homes');
      else assert.ok(/narrow median: a full boulevard .* (would cost \d+ homes here|would leave less room for the detention|doesn’t fit here)/.test(q.notes.join(' ')), q.name + ': narrow, and says why: ' + q.notes.join(' / ')); } }
  const f = E.sheetFrame(base), homes = o.elements.filter(e => e.kind === 'building' && e.use === 'sfr').map(e => f.to([e.x, e.y])), back = homes.filter(h => h[1] > f.depth * 0.6), mid = [back.reduce((t, h) => t + h[0], 0) / back.length, back.reduce((t, h) => t + h[1], 0) / back.length];
  const r = E.applyEdits(base, [{ action: 'move', target: cc.id, x: Math.round(mid[0]), y: Math.round(mid[1]) }, { action: 'add', kind: 'pool', with: cc.id, w: 60, d: 30 }]), p = { ...base, elements: r.elements }, m = S.metrics(p);
  const c2 = r.elements.find(e => e.id === cc.id), pool = r.elements.find(e => e.kind === 'pool' && !o.elements.some(x => x.id === e.id));
  assert.ok(pool && Math.hypot(pool.x - c2.x, pool.y - c2.y) < 160, 'the pool is beside it: ' + r.done.join(' ') + ' ' + r.skipped.join(' '));
  assert.ok(r.done.some(t => /homes? made way/.test(t)) && m.units >= m0.units - 12 && m.units < m0.units, 'a handful of homes made way, not streets of them: ' + m0.units + ' → ' + m.units);
  assert.ok(!S.check(p).some(i => i.level === 'bad' && (i.id === cc.id || i.id === pool.id)), 'the center and pool sit clear: ' + S.check(p).filter(i => i.level === 'bad').map(i => i.text).join('; '));
  assert.equal(Math.round(m.pond), Math.round(m0.pond), 'the detention is untouched');
  // a pool or playground beside the center goes on the community lawn (an amenity may stand in a park), not over homes;
  // and the community park pinned where it is (renamed by Change With AI) re-fits with every home (its lots run up to it)
  for (const kind of ['pool', 'play']) { const q = E.applyEdits(base, [{ action: 'add', kind, with: cc.id }]), x = q.elements.find(e => e.kind === kind && !o.elements.some(y => y.id === e.id));
    assert.ok(x && S.metrics({ ...base, elements: q.elements }).units === m0.units && Math.hypot(x.x - cc.x, x.y - cc.y) < 200, kind + ': ' + q.done.join(' ')); }
  for (const g of o.elements.filter(e => e.kind === 'green' && e.name === 'Community park')) { const q = E.applyEdits(base, [{ action: 'change', target: g.id, name: 'Big park' }], { refit: true }), rf = L.refit({ ...base, elements: q.elements }, { amount: 'current', keep: true });
    assert.equal(S.metrics({ ...base, elements: rf.elements }).units, m0.units, 'the park pinned: every home'); assert.equal(rf.elements.filter(e => e.kind === 'green' && /park/i.test(e.name || '')).length, o.elements.filter(e => e.kind === 'green' && e.name === 'Community park').length, 'not doubled'); }
  // places in words: the plan's places, and the words read without the AI
  const P = E.placesOf(base); assert.ok(P.site.front[1] < P.site.middle[1] && P.site.middle[1] < P.site.back[1], 'front, middle, back run away from the street');
  assert.ok(P.areas.some(a => a.name === 'Single-family homes' && a.count === m0.units), 'the homes are an area: ' + JSON.stringify(P.areas.map(a => a.name + ' ' + a.count)));
  const g = E.guessEdits('move the community center to the middle of the lots for single family homes and add a pool to it', base);
  assert.equal(g.length, 2); assert.ok(g[0].action === 'move' && g[0].target === cc.id && g[1].action === 'add' && g[1].kind === 'pool' && g[1].with === cc.id, JSON.stringify(g));
  const hm = P.areas.find(a => a.name === 'Single-family homes').middle; assert.deepEqual([g[0].x, g[0].y], hm, 'the middle of the homes');
  const bk = E.guessEdits('move the community center to the back', base)[0]; assert.ok(bk && bk.y === P.site.back[1], 'the back of the site');
}
// ---- changes across the whole site (Oct 19): "Residential homes should only be 1 story and two-story homes, no 3 story
// homes" on a 100-acre mixed plan (retail out front, a few hundred homes on lots, a lake and commons) did nothing: the
// houses weren't listed for the AI (too many) and it could only change pieces one by one. Homes on lots now change
// stories through the home mix (their lots are sized for them: the lots are laid out again along the same streets), and
// every piece of a use or kind can change at once ----
{
  const E = await import('../lib/siteedit.mjs'), N = S.unionParcels([mk([-95.96, 30.07], [[0, 0], [2600, 0], [2600, 1700], [0, 1700]])]), site = { ...N, front: N.ring.findIndex((p, i) => S.outwardOf(N.ring, i)[1] < -0.9), setbacks: { ...S.SETBACKS } };
  const o = L.layoutOptions(site, { use: 'mixed', zones: [{ use: 'retail', gfa: 60000 }, { use: 'sfr', units: 250 }, { use: 'amenity', items: ['lake', 'center', 'pool', 'playground'] }] }, { count: 1 })[0], base = { ...site, program: o.program, elements: o.elements, recipe: o.recipe };
  const homes = els => els.filter(e => e.kind === 'building' && e.use === 'sfr'), storiesOf = els => [...new Set(homes(els).map(e => e.floors))].sort(), retail = els => els.filter(e => e.kind === 'building' && e.use === 'retail');
  assert.ok(homes(o.elements).length > 120 && storiesOf(o.elements).includes(3), 'a big neighbourhood with some 3-story homes: ' + homes(o.elements).length + ' ' + storiesOf(o.elements));
  // a re-fit with nothing changed keeps every street (its added entrances used to be taken for the way in, or kept off
  // like buildings, and 17 of 39 streets moved), and a park beside each named piece lands clear or says there's no room
  { const st = els => els.filter(e => e.kind === 'drive' || e.kind === 'truck').map(e => JSON.stringify(S.shapeOf(e).map(p => p.map(v => Math.round(v))))).sort(), rf0 = L.refit(base, { amount: 'current', keep: true });
    assert.deepEqual(st(rf0.elements), st(o.elements), 'nothing changed: the same streets'); assert.equal(homes(rf0.elements).length, homes(o.elements).length);
    for (const a of o.elements.filter(e => e.name && ['building', 'pond', 'pool', 'play'].includes(e.kind) && e.use !== 'sfr')) { const q = E.applyEdits(base, [{ action: 'add', kind: 'green', with: a.id, name: 'Park' }]), pk = q.elements.find(e => e.name === 'Park');
      if (!pk) { assert.ok(q.skipped.some(t => /^No room beside/.test(t)), q.skipped.join(' ')); continue; }
      assert.deepEqual(q.elements.filter(e => ['drive', 'truck', 'building', 'garage', 'pond', 'pool'].includes(e.kind) && S.rectsOverlap(pk, e)).map(e => e.name || e.kind), [], 'a park beside ' + a.name + ' lands clear');
      assert.ok(S.gapBetween(S.shapeOf(pk), S.shapeOf(a)) <= 150, 'and beside it'); } }
  const d = E.describePlan(base); assert.ok(d.houses && !d.houses.listed && d.houses.count === homes(o.elements).length && d.houses.byStories[3] > 0 && d.houses.mix.length === 3 && !d.pieces.some(p => p.use === 'sfr'), 'the AI is told how many homes there are by stories, and their mix: ' + JSON.stringify(d.houses));
  // the request word for word, read without the AI: 1- and 2-story only, in the shares they had
  const mix = E.guessMix('Residential homes should only be 1 story and two-story homes, no 3 story homes.', base); assert.deepEqual(mix.map(t => t.stories), [1, 2]); assert.equal(mix.reduce((t, x) => t + x.pct, 0), 100);
  assert.equal(E.guessMix('make lot 12 two stories', base), null, 'one home named: an edit on it, not the mix'); assert.equal(E.guessMix('make bldg 7 four stories', base), null);
  assert.deepEqual(E.guessMix('no 3-story houses', base).map(t => t.stories), [1, 2]); assert.deepEqual(E.guessMix('make all the homes single story', base) || [], [], '(no number: not read as a mix)');
  const hm = E.withHomeMix(base, mix), p2 = { ...base, program: hm.program, recipe: hm.recipe }, rf = L.refit(p2, { amount: 'current' });
  assert.ok(rf?.elements?.length, 'the site re-fits with the new mix');
  const p3 = { ...p2, elements: rf.elements }, n0 = homes(o.elements).length, n1 = homes(rf.elements).length;
  assert.deepEqual(storiesOf(rf.elements), [1, 2], 'no 3-story homes left: ' + storiesOf(rf.elements));
  assert.ok(n1 >= n0 * 0.85 && n1 <= n0, 'a few homes fewer on the wider lots, not streets of them: ' + n0 + ' → ' + n1);
  assert.equal(retail(rf.elements).reduce((t, e) => t + S.gfaOf(e), 0), retail(o.elements).reduce((t, e) => t + S.gfaOf(e), 0), 'the retail is untouched');
  assert.ok(rf.elements.some(e => e.kind === 'pond') && rf.elements.some(e => e.kind === 'building' && e.use === 'amenity'), 'the lake and commons stay');
  for (const h of homes(rf.elements)) { const lot = rf.elements.find(l => l.kind === 'lot' && S.inRing(S.centroid(S.shapeOf(h)), S.shapeOf(l))); assert.ok(lot && Math.min(lot.w, lot.d) >= h.w, 'each home on a lot as wide as it needs'); }
  assert.deepEqual(S.check(p3).filter(i => i.level === 'bad').map(i => i.text), S.check(base).filter(i => i.level === 'bad').map(i => i.text), 'no new problems');
  assert.equal(E.withHomeMix(base, [{ stories: 3, pct: 0 }]), null, 'a mix with no homes is no mix');
  assert.ok(hm.program.zones.find(z => z.use === 'sfr').homeMix.every(t => t.stories < 3) && JSON.stringify(hm.recipe.seq).includes('"homeMix":[{"stories":1'), 'the program and the recipe both carry it, so a later re-fit keeps it');
  // "make the main entry a boulevard" on a plan laid out with the narrow entry (the shops in front: the first drive 38 ft
  // in): no room for a median, so it stays as it is and says why (a 50 ft throat with nothing down its middle gained
  // nothing, and its note claimed a median that wasn't there); the checks say the first drive is too close
  { const nb = L.layoutOptions({ ...site, params: { entry: { style: 'narrow' } } }, base.program, { count: 1 })[0], np = { ...site, program: nb.program, elements: nb.elements, recipe: nb.recipe }, me = nb.elements.find(e => e.name === 'Main entry');
    assert.ok(!me.blvd, 'narrow: ' + me.note); const ops = E.guessEdits('make the main entry a boulevard', np); assert.deepEqual(ops, [{ action: 'change', target: me.id, boulevard: true, signs: null }]);
    const q = E.applyEdits(np, [{ ...ops[0], signs: null, x: null, y: null, turnBy: null }]), p4 = { ...np, elements: q.elements }, e4 = q.elements.find(e => e.id === me.id), why = q.done.concat(q.skipped).join(' ');
    assert.ok(!e4.blvd && e4.note === me.note && JSON.stringify(S.shapeOf(e4)) === JSON.stringify(S.shapeOf(me)) && JSON.stringify(S.entryParts(p4, e4).map(x => x.id)) === JSON.stringify(S.entryParts(np, me).map(x => x.id)), 'it stays as it is: ' + why);
    assert.ok(q.skipped.some(t => /^No room for a boulevard there: it meets the first drive \d+ ft in from the street, too soon for a planted median/.test(t)) && !/median\)/.test(q.done.join(' ')), 'and says why: ' + why);
    assert.ok(S.entryIssues(p4).some(i => i.id === me.id && /meets the first drive \d+ ft in from the street/.test(i.text)), 'the first drive too close to the street'); }
  // every piece of a use or kind at once, listed or not
  const r1 = E.applyEdits(base, [{ action: 'change', every: 'retail', floors: 2 }]);
  assert.ok(retail(r1.elements).length && retail(r1.elements).every(e => e.floors === 2) && r1.done.length === 1 && /All \d+ retail buildings: 2 stories/.test(r1.done[0]), r1.done.join(' '));
  const r2 = E.applyEdits(base, [{ action: 'change', every: 'building', floorsOver: 2, floors: 2 }]);
  assert.ok(r2.skipped.some(t => /home mix/.test(t)) && storiesOf(r2.elements).includes(3), 'homes on lots never change stories one by one (their lots wouldn’t fit them): ' + r2.skipped.join(' '));
  const pools = o.elements.filter(e => e.kind === 'pool').length, r3 = E.applyEdits(base, [{ action: 'remove', every: 'pool' }]);
  assert.ok(!r3.elements.some(e => e.kind === 'pool') && (pools ? r3.done[0].startsWith('Removed ' + pools + ' pool') : r3.skipped.includes('No pools on the plan.')), r3.done.concat(r3.skipped).join(' '));
  assert.deepEqual(E.applyEdits(base, [{ action: 'change', every: 'multifamily', floors: 4 }]).skipped, ['No apartment buildings on the plan.']);
  // a neighbourhood of homes only: the same
  const sf = { origin: [-95.93, 30.09], ring: [[-700, -500], [700, -500], [700, 500], [-700, 500]], front: 0, setbacks: { ...S.SETBACKS } }, os = L.layoutOptions(sf, { use: 'sfr' })[0], bs = { ...sf, program: os.program, elements: os.elements, recipe: os.recipe };
  assert.ok(storiesOf(os.elements).includes(3), 'some 3-story homes: ' + storiesOf(os.elements));
  const hs = E.withHomeMix(bs, E.guessMix('no 3 story homes', bs)), rs = L.refit({ ...bs, program: hs.program, recipe: hs.recipe }, { amount: 'current' });
  assert.deepEqual(storiesOf(rs.elements), [1, 2], 'homes only: no 3-story left'); assert.ok(homes(rs.elements).length >= homes(os.elements).length * 0.85, homes(os.elements).length + ' → ' + homes(rs.elements).length);
}
// ---- a park beside the community center, an entrance at the open space (Oct 19). On a Waller-sized tract (about 246
// acres, the back corner clipped off) with shops and pads out front, some 800 homes on lots, a lake and a commons, "add a
// park beside the community center" put the park across a street (beside() only checked the sheet's box), nothing
// flagged it, and the re-fit after laid the streets through it and moved the rest; an entrance asked for at the open
// space ran under it, drawn hidden below the lawn. Parks are places now: clear of the streets or not added, homes under
// them make way, re-fits keep the streets, entrances go round them or say they can't ----
{
  const E = await import('../lib/siteedit.mjs'), W = S.unionParcels([mk([-95.93, 30.06], [[0, 0], [3400, 0], [3400, 2400], [2300, 3300], [0, 3300]])]), site = { ...W, front: W.ring.findIndex((p, i) => S.outwardOf(W.ring, i)[1] < -0.9), setbacks: { ...S.SETBACKS } };
  const o = L.layoutOptions(site, { use: 'mixed', zones: [{ use: 'retail', gfa: 60000, pads: 2 }, { use: 'sfr', units: 600 }, { use: 'amenity', items: ['lake', 'center', 'pool', 'playground'] }] }, { count: 1 })[0], base = { ...site, program: o.program, elements: o.elements, recipe: o.recipe };
  const streets = els => els.filter(e => e.kind === 'drive' || e.kind === 'truck').map(e => JSON.stringify(S.shapeOf(e).map(p => p.map(v => Math.round(v))))).sort(), s0 = streets(o.elements);
  const over = (pk, els) => els.filter(e => e.id !== pk.id && ['drive', 'truck', 'building', 'garage', 'lot', 'pond', 'pool'].includes(e.kind) && S.rectsOverlap(pk, e)).map(e => e.kind + ' ' + (e.name || ''));
  const homes = els => els.filter(e => e.kind === 'building' && e.use === 'sfr').length, n0 = homes(o.elements), bad = els => S.check({ ...base, elements: els }).filter(i => i.level === 'bad');
  assert.ok(n0 > 600 && S.entrancesOf(o.elements).length >= 3 && s0.length > 60, 'a big mixed plan: ' + n0 + ' homes, ' + s0.length + ' drives'); assert.deepEqual(bad(o.elements).map(i => i.text), []);
  // a re-fit with nothing changed: every street where it was
  const rf0 = L.refit(base, { amount: 'current', keep: true }); assert.deepEqual(streets(rf0.elements), s0, 'nothing changed: the same streets'); assert.equal(homes(rf0.elements), n0); assert.ok(!rf0.kept && !rf0.fresh);
  // "add a park beside the community center": the words, then the edit as the AI gives it (no re-fit)
  const cc = o.elements.find(e => e.kind === 'building' && e.use === 'amenity'); assert.ok(cc, 'the community center');
  for (const t of ['add a park beside the community center', 'add a park beside the community center and re-fit', 'Add a park beside the community center, then re-fit the rest']) assert.deepEqual(E.guessEdits(t, base), [{ action: 'add', kind: 'green', with: cc.id, name: 'Park' }], t);
  const r = E.applyEdits(base, [{ action: 'add', kind: 'green', with: cc.id, name: 'Park' }]), park = r.elements.find(e => e.name === 'Park');
  assert.ok(park?.pinned, r.done.concat(r.skipped).join(' ')); assert.deepEqual(over(park, r.elements), [], 'clear of every street, building and lot');
  assert.ok(Math.hypot(park.x - cc.x, park.y - cc.y) <= 300, 'beside it'); assert.deepEqual(streets(r.elements), s0, 'the streets are unchanged');
  assert.ok(!bad(r.elements).some(i => i.id === park.id) && homes(r.elements) >= n0 - 12, 'no problem with it, a handful of homes at most made way');
  // …then re-fitted (the AI said full, or Re-fit was ticked): the park stays, the streets stay, nothing under it
  const rf = L.refit({ ...base, elements: r.elements }, { amount: 'current', keep: true }), p2 = rf.elements.find(e => e.id === park.id);
  assert.ok(p2 && p2.x === park.x && p2.y === park.y, 'the park where it was put'); assert.deepEqual(over(p2, rf.elements), [], 'nothing laid over it');
  assert.deepEqual(streets(rf.elements), s0, 'the re-fit keeps every street'); assert.ok(!rf.kept && !rf.fresh && homes(rf.elements) >= n0 - 12, homes(rf.elements) + ' homes');
  assert.deepEqual(bad(rf.elements).map(i => i.text), [], 'no new problems');
  // a park put in the middle of the homes: the homes under it make way, the streets don't
  { const f = E.sheetFrame(base), hm = E.placesOf(base).areas.find(a => a.name === 'Single-family homes').middle, q = E.applyEdits(base, [{ action: 'add', kind: 'green', name: 'Park', x: hm[0], y: hm[1], w: 160, d: 120 }]), pk = q.elements.find(e => e.name === 'Park');
    assert.ok(pk, q.skipped.join(' ')); assert.deepEqual(over(pk, q.elements), [], 'no street, home or lot under it'); assert.deepEqual(streets(q.elements), s0);
    assert.ok(Math.hypot(...f.to([pk.x, pk.y]).map((v, i) => v - hm[i])) < 250 && homes(q.elements) < n0 && homes(q.elements) >= n0 - 16 && q.done.some(t => /made way/.test(t)), q.done.join(' '));
    // with room to spare round it (a park flush against a street had the re-fit cut that street to keep its margin), no
    // home within 4 ft of it, and the lots of the homes that stay cut back off it; then the re-fit keeps every street
    const gap = Math.min(...q.elements.filter(e => e.kind === 'drive' || e.kind === 'truck').map(e => S.gapBetween(S.shapeOf(pk), S.shapeOf(e)))); assert.ok(gap >= 7.5, 'off the streets: ' + gap.toFixed(1));
    assert.ok(q.elements.filter(e => e.kind === 'building' && e.use === 'sfr').every(h => S.gapBetween(S.shapeOf(pk), S.shapeOf(h)) >= 3.9));
    const rq = L.refit({ ...base, elements: q.elements }, { amount: 'current', keep: true }); assert.deepEqual(streets(rq.elements), s0, 'the re-fit keeps every street'); assert.deepEqual(over(rq.elements.find(e => e.id === pk.id), rq.elements), []); }
  // an entrance asked for by Pad A comes in from the front street (not the side lot line beside it, made a street), and
  // a re-fit after keeps the streets and lays no parking across it (it used to lay a row over a driveway added by hand)
  { const pad = o.elements.find(e => e.name === 'Pad A'), g = E.guessEdits('add an entrance by Pad A', base); assert.deepEqual(g, [{ action: 'add', kind: 'entrance', with: pad.id }]);
    const q = E.applyEdits(base, g), ent = q.elements.find(e => q.touched.includes(e.id) && e.kind === 'drive'); assert.ok(ent, q.skipped.join(' ')); assert.deepEqual(q.streets || [], base.streets || [], 'no lot line made a street');
    const rq = L.refit({ ...base, elements: q.elements, streets: q.streets }, { amount: 'current', keep: true });
    assert.deepEqual(rq.elements.filter(e => e.kind === 'parking' && S.rectsOverlap(e, ent, 1)).length, 0, 'no stalls on the driveway'); assert.ok(rq.elements.some(e => e.id === ent.id)); }
  // beside every named piece: a clear spot, or it says there's no room (it used to land on Pad A and a drive)
  for (const a of o.elements.filter(e => e.name && ['building', 'pond', 'pool', 'play'].includes(e.kind) && e.use !== 'sfr')) {
    const q = E.applyEdits(base, [{ action: 'add', kind: 'green', with: a.id, name: 'Park' }]), pk = q.elements.find(e => e.name === 'Park');
    if (!pk) { assert.ok(q.skipped.some(t => t.startsWith('No room beside ' + a.name)), q.skipped.join(' ')); continue; }
    assert.deepEqual(over(pk, q.elements).filter(t => !t.startsWith('lot')), [], 'a park beside ' + a.name); assert.ok(!bad(q.elements).some(i => i.id === pk.id));
    assert.ok(S.gapBetween(S.shapeOf(pk), S.shapeOf(a)) <= 150, 'beside ' + a.name + ', not across the site from it'); }
  // the park renamed and made far too big (or moved onto the lake): it stays as it was, its new name kept, and says so
  // by that name (the whole change used to be put back without a word about the name)
  { const lake = o.elements.find(e => e.kind === 'pond' && e.name === 'Amenity lake'), P1 = { ...base, elements: r.elements }, lc = E.sheetFrame(P1).to(S.centroid(S.shapeOf(lake)));
    for (const [op, word] of [[{ w: 900, d: 900 }, 'resized'], [{ x: lc[0], y: lc[1] }, 'moved']]) { const q = E.applyEdits(P1, [{ action: 'change', target: park.id, name: 'Big park', ...op }]), pk = q.elements.find(e => e.id === park.id);
      assert.ok(pk.name === 'Big park' && pk.x === park.x && pk.y === park.y && pk.w === park.w, word + ': ' + JSON.stringify(pk)); assert.deepEqual(q.done, ['Park: named Big park.']);
      assert.deepEqual(q.skipped, ['Big park doesn’t fit there clear of the streets and buildings, so it wasn’t ' + word + '.' + (word === 'resized' ? ' Try a smaller one, or another spot.' : '')]); } }
  // two entrances asked for by Pad A: the second comes in along the street from the first, not on top of it
  { const q = E.applyEdits(base, E.guessEdits('add 2 entrances by Pad A', base)), ents = q.elements.filter(e => q.touched.includes(e.id) && e.kind === 'drive');
    assert.equal(ents.length, 2, q.skipped.join(' ')); assert.ok(S.gapBetween(S.shapeOf(ents[0]), S.shapeOf(ents[1])) >= 80, 'apart: ' + S.gapBetween(S.shapeOf(ents[0]), S.shapeOf(ents[1]))); }
  // an open space on the west side, between two streets (as a person would draw it), then an entrance asked for at it
  // on the west lot line: it goes along the street past it (and says how far), or says the open space is in the way
  const f = E.sheetFrame(base); let os = null, ro = null;
  for (let y = 300; y < 3000 && !os; y += 70) { ro = E.applyEdits(base, [{ action: 'add', kind: 'green', name: 'Open space', x: 60, y, w: 110, d: 200 }]); const g = ro.elements.find(e => e.name === 'Open space'); if (g && f.to([g.x, g.y])[0] < 150) os = g; }
  assert.ok(os, 'room for an open space along the west lot line'); const oy = Math.round(f.to([os.x, os.y])[1]), b2 = { ...base, elements: ro.elements, streets: ro.streets };
  const entered = (q, how) => { const ent = q.elements.find(e => q.touched.includes(e.id) && e.kind === 'drive'), osIssues = S.check({ ...b2, elements: q.elements, streets: q.streets }).filter(i => i.id === os.id && /overlaps/.test(i.text));
    assert.deepEqual(osIssues.map(i => i.text), [], how + ': the open space isn’t under anything');
    if (ent) assert.ok(!S.rectsOverlap(ent, os) && q.done.some(t => /ft along the street from where it was asked, clear of Open space/.test(t)), how + ': round it: ' + q.done.join(' '));
    else assert.ok(q.skipped.some(t => /Open space/.test(t)), how + ': says it’s in the way: ' + q.skipped.join(' ')); };
  entered(E.applyEdits(b2, [{ action: 'add', kind: 'entrance', x: 0, y: oy }]), 'at x, y');
  const g = E.guessEdits('add an entrance at the open space', b2); assert.deepEqual(g, [{ action: 'add', kind: 'entrance', with: os.id }]);
  entered(E.applyEdits(b2, g), 'with the open space');
  // the main entry a real boulevard by default: 50 ft, two 18 ft lanes either side of a 14 ft median at least 60 ft long,
  // the monument sign in it; no fewer homes than with the narrow entry, the same arrangement
  { const me = o.elements.find(e => e.name === 'Main entry'), parts = S.entryParts(base, me), md = parts.find(S.isMedian), sg = parts.filter(x => x.kind === 'sign'), rt = S.routeOf(me, base.ring);
    assert.ok(me.blvd && rt.width === 50 && md, me.note); const ax = md.poly, far = Math.max(...ax.flatMap(a => ax.map(b => Math.hypot(a[0] - b[0], a[1] - b[1]))));
    const n = rt.mouth, ws = ax.map(q => q[0] * n[1] - q[1] * n[0]); assert.ok(Math.abs(Math.max(...ws) - Math.min(...ws) - 14) < 0.5 && far >= 60, 'a 14 ft median, ' + far.toFixed(0) + ' ft long');
    const es = S.shapeOf(me); assert.ok(ax.every(q => S.inRing(q, es)), 'inside the drive');
    assert.ok(sg.length === 1 && sg[0].sign === 'median' && S.corners(sg[0]).every(q => S.inRing(q, ax)) || sg.length && o.notes.some(t => /monument signs stand at the corners/.test(t)), 'a sign in the median (or the corners, and why)');
    const on = L.layoutOptions({ ...site, params: { entry: { style: 'narrow' } } }, base.program, { count: 1 })[0]; assert.equal(on.name, o.name, 'the same arrangement'); assert.ok(homes(o.elements) >= homes(on.elements) * 0.98, homes(o.elements) + ' vs ' + homes(on.elements) + ' with the narrow entry');
    assert.ok(!on.elements.find(e => e.name === 'Main entry').blvd, 'narrow: the 40 ft entry'); }
  // the main entry turned 15° by hand, then the site re-fitted: its mouth on the lot line, its median inside it, the
  // streets kept, the homes kept
  { const p = structuredClone(base), me = p.elements.find(e => e.name === 'Main entry'), t = S.turnPiece(p, me, 15); p.elements = t.elements; assert.equal(t.deg, 15);
    const rq = L.refit(p, { amount: 'current', keep: true }), pin = new Set(rq.elements.filter(e => e.pinned).map(e => e.id)), e2 = rq.elements.find(e => e.id === me.id);
    assert.deepEqual(S.check({ ...p, elements: rq.elements }).filter(i => i.level === 'bad' && !pin.has(i.id)).map(i => i.text), [], 'no problems outside what was placed by hand');
    assert.ok(e2 && S.segDist(e2.path[0], p.ring[p.front], p.ring[(p.front + 1) % p.ring.length]) < 0.05, 'the entrance kept, its mouth on the street'); const es = S.shapeOf(e2), md = S.entryParts({ ...p, elements: rq.elements }, e2).find(S.isMedian);
    assert.ok(md && md.poly.every(q => S.inRing(q, es) || Math.min(...es.map((a, i) => S.segDist(q, a, es[(i + 1) % es.length]))) <= 2), 'its median inside it');
    const s1 = streets(rq.elements); assert.ok(s0.filter(x => s1.includes(x)).length >= s0.length * 0.9, 'the streets kept: ' + s0.filter(x => s1.includes(x)).length + ' of ' + s0.length); assert.ok(homes(rq.elements) >= n0 * 0.97, homes(rq.elements) + ' homes'); }
  // roundabouts and drop-off loops (phase 2): "add a roundabout at the main intersection" goes at the main junction and
  // joins its streets, every drive reached, a handful of homes at most made way; a re-fit keeps it joined and the streets;
  // "at the entry" keeps the main entry the main entry, its mouth on the street; "remove the roundabout" puts the streets
  // back; a circle drive at the community center says why there's no room (its front is 28 ft from the street)
  { let t = Date.now(); const J = S.junctionsOf(base), ms = Date.now() - t, jm = J.find(j => j.main), f = E.sheetFrame(base); assert.ok(ms < 200, 'junctions in ' + ms + ' ms'); assert.ok(jm && !jm.parking && J.length > 20);
    const g = E.guessEdits('add a roundabout at the main intersection', base), at = f.to(jm.at).map(Math.round); assert.deepEqual(g, [{ action: 'add', kind: 'roundabout', x: at[0], y: at[1] }]);
    t = Date.now(); const r = E.applyEdits(base, g), ams = Date.now() - t, rb = r.elements.find(S.isRing); assert.ok(ams < 1500, 'added in ' + ams + ' ms');
    assert.ok(rb && (Math.hypot(rb.x - jm.at[0], rb.y - jm.at[1]) < 0.5 || r.done.some(x => /no room \(.+ in the way\), so it’s at the next one/.test(x))) && r.done.some(x => /^Added Roundabout \(\d+ ft across\) where .+ meet\./.test(x)), r.done.concat(r.skipped).join(' ')); // (here Main drive runs beside the main junction, over where its lane would be: it's at Main drive's own junction, next to it)
    assert.deepEqual(bad(r.elements).map(i => i.text), []); const { seen, D } = reached(r.elements); assert.deepEqual(D.filter(d => !seen.has(d.id) && d.note !== 'Drive-thru lane').map(d => d.id), [], 'every drive reached');
    assert.ok(homes(r.elements) >= n0 - 6, n0 - homes(r.elements) + ' homes made way'); assert.deepEqual(overRing(rb, r.elements), []);
    const s1 = streets(r.elements), cut = new Set(rb.rb.cuts.flatMap(k => streets([k.was]))); assert.ok(cut.size >= 2 && s0.every(x => s1.includes(x) || cut.has(x)), 'every street kept but the ones cut back to it');
    const rf = L.refit({ ...base, elements: r.elements }, { amount: 'current', keep: true }), rb2 = rf.elements.find(e => e.id === rb.id);
    assert.ok(!rf.kept && !rf.fresh && rb2 && rb2.x === rb.x && rb2.y === rb.y && rf.elements.filter(e => e.cut === rb.id).length >= 2, 're-fitted: there, joined'); assert.deepEqual(overRing(rb2, rf.elements), []);
    assert.deepEqual(bad(rf.elements).map(i => i.text), []); assert.ok(homes(rf.elements) >= homes(r.elements) - 2, homes(rf.elements) + ' homes'); const s2 = streets(rf.elements); assert.ok(s0.filter(x => s2.includes(x)).length >= s0.length * 0.95, 'the streets kept');
    const rm = E.applyEdits({ ...base, elements: r.elements }, E.guessEdits('remove the roundabout', { ...base, elements: r.elements })); assert.match(rm.done[0] || '', /^Removed Roundabout/); assert.deepEqual(streets(rm.elements), s0, 'removed: the streets back');
    const me = base.elements.find(e => e.name === 'Main entry'), ge = E.guessEdits('add a roundabout at the entry', base); assert.deepEqual(ge, [{ action: 'add', kind: 'roundabout', with: me.id }]);
    const q = E.applyEdits(base, ge), me2 = q.elements.find(e => e.name === 'Main entry'), es = me2 && S.shapeOf(me2), st = els => els.filter(e => e.kind === 'parking').reduce((t, e) => t + S.stalls(e).count, 0), gave = +(q.done.join(' ').match(/(\d+) spaces gave way/)?.[1] || 0);
    assert.equal(st(q.elements), st(base.elements) - gave, 'only the spaces under it give way (' + gave + '), not the rows along the aisle it cut'); assert.ok(q.elements.some(S.isRing) && me2?.id === me.id && q.elements.filter(e => e.name === 'Main entry').length === 1, q.done.concat(q.skipped).join(' '));
    assert.ok(S.segDist(S.routeOf(me2, base.ring).path[0], base.ring[base.front], base.ring[(base.front + 1) % base.ring.length]) < 0.05, 'the main entry\'s mouth on the street'); assert.deepEqual(bad(q.elements).map(i => i.text), []);
    const md = S.entryParts({ ...base, elements: q.elements }, me2).find(S.isMedian); assert.ok(md ? md.poly.every(p => S.inRing(p, es) || Math.min(...es.map((a, i) => S.segDist(p, a, es[(i + 1) % es.length]))) <= 2) : q.done.some(x => /median|corners/.test(x)), 'its median in it, or it says where the signs went');
    { const rq = q.elements.find(S.isRing), back = E.applyEdits({ ...base, elements: q.elements }, [{ action: 'remove', target: rq.id }]); assert.equal(st(back.elements), st(base.elements), 'taken away: the spaces back'); assert.deepEqual(streets(back.elements), s0); assert.deepEqual(bad(back.elements).map(i => i.text), []); }
    const gl = E.guessEdits('add a circle drive in front of the community center', base); assert.deepEqual(gl, [{ action: 'add', kind: 'loop', with: cc.id }]);
    const ql = E.applyEdits(base, gl); assert.match(ql.skipped.join(' '), /its front is 2\d ft from the street .*Move it back about \d+ ft/); assert.ok(!ql.done.length && ql.elements.length === base.elements.length && !ql.elements.some(S.isLoop), 'nothing changed'); }
}
// ---- beside a piece that runs across the sheet (Oct 19): on an irregular 144-acre tract turned 17° the lake is a long
// strip along the skewed back lot line, and "a park beside the lake" was measured from the lake's box on the sheet: it
// landed 640 ft from the water and still said "Added Park." Beside is measured from the piece's own outline now; where
// the default size doesn't fit a smaller park goes, else it says there's no room ----
{
  const E = await import('../lib/siteedit.mjs'), a = 17 * Math.PI / 180, I = S.unionParcels([mk([-96.01, 30.02], [[0, 0], [2900, 0], [3100, 900], [2600, 2100], [1300, 2300], [200, 1900], [-150, 900]].map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]))]);
  const site = { ...I, front: I.ring.reduce((b, p, i) => S.outwardOf(I.ring, i)[1] < S.outwardOf(I.ring, b)[1] ? i : b, 0), setbacks: { ...S.SETBACKS } };
  const o = L.layoutOptions(site, { use: 'mixed', zones: [{ use: 'retail', gfa: 40000, pads: 2 }, { use: 'sfr', units: 450 }, { use: 'amenity', items: ['lake', 'center', 'pool', 'playground'] }] }, { count: 1 })[0], base = { ...site, program: o.program, elements: o.elements, recipe: o.recipe };
  const homes = els => els.filter(e => e.kind === 'building' && e.use === 'sfr').length, n0 = homes(o.elements), named = o.elements.filter(e => e.name && ['building', 'pond', 'pool', 'play', 'green'].includes(e.kind) && e.use !== 'sfr');
  assert.ok(named.some(e => e.name === 'Amenity lake') && named.some(e => e.name === 'Open space'), named.map(e => e.name).join(', '));
  for (const x of named) { const q = E.applyEdits(base, [{ action: 'add', kind: 'green', with: x.id, name: 'Park' }]), pk = q.elements.find(e => e.name === 'Park');
    if (!pk) { assert.ok(q.skipped.some(t => t.startsWith('No room beside ' + x.name)), q.skipped.join(' ')); continue; }
    assert.ok(S.gapBetween(S.shapeOf(pk), S.shapeOf(x)) <= 150, 'a park beside ' + x.name + ' is beside it: ' + S.gapBetween(S.shapeOf(pk), S.shapeOf(x)).toFixed(0) + ' ft');
    assert.deepEqual(q.elements.filter(e => e.id !== pk.id && ['drive', 'truck', 'building', 'garage', 'pond', 'pool'].includes(e.kind) && S.rectsOverlap(pk, e)).map(e => e.name || e.kind), [], 'clear');
    assert.ok(homes(q.elements) >= n0 - 12, q.done.join(' ')); if (pk.w < 120) assert.ok(q.done.some(t => /didn’t fit beside/.test(t)), 'a smaller one says so: ' + q.done.join(' ')); }
}
// ---- how many ways in, when the request doesn't say: a corner lot gets one on each street, a big apartment community a
// second for fire access, an inside lot one ----
{
  const box = (w, h, extra = {}) => ({ origin: [-95.5, 29.8], ring: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], front: 0, setbacks: { ...S.SETBACKS }, ...extra });
  const onEdge = (site, e) => { const c = S.centroid(S.shapeOf(e)); let best = null; site.ring.forEach((a, k) => { const d = S.segDist(c, a, site.ring[(k + 1) % site.ring.length]); if (!best || d < best.d) best = { k, d }; }); return best.k; };
  const inside = box(640, 400), oi = L.layoutOptions(inside, S.guessProgram('25,000 sf retail strip'))[0];
  assert.equal(S.entrancesOf(oi.elements).length, 1, 'an inside lot: one way in');
  const corner = box(500, 380, { streets: [1] }), oc = L.layoutOptions(corner, S.guessProgram('30,000 sf retail strip'))[0], ec = S.entrancesOf(oc.elements);
  assert.equal(ec.length, 2, 'a corner lot: two'); assert.deepEqual(ec.map(e => onEdge(corner, e)).sort(), [0, 1], 'one on each street');
  assert.ok(oc.notes.some(t => /corner lot/.test(t)), 'and it says why'); assert.ok(!S.check({ ...corner, elements: oc.elements }).some(i => i.level === 'bad'));
  const pad = box(180, 200, { streets: [1] }), op = L.layoutOptions(pad, S.guessProgram('4,000 sf coffee shop with a drive-thru'))[0]; assert.equal(S.entrancesOf(op.elements).length, 1, 'a small corner pad: one');
  const apts = box(900, 625), oa = L.layoutOptions(apts, S.guessProgram('240 apartments, 3 stories'))[0];
  assert.equal(L.entranceNeed(apts, oa.elements).why, 'apts'); assert.ok(S.entrancesOf(oa.elements).length >= 2, 'more than 200 apartments: the first layout has a second way in');
  const one = L.layoutOptions(corner, { ...S.guessProgram('30,000 sf retail strip'), entrances: 1 })[0]; assert.equal(S.entrancesOf(one.elements).length, 1, 'one when they ask for one');
}
console.log('site layouts ok');
