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
    // curved: drives that turn on arcs, an entry with curb returns, an organic pond, rounded parking ends, staggered buildings
    assert.ok(o.elements.some(e => e.kind === 'drive' && e.path && e.r > 0), o.name + ': curved drives');
    assert.ok(o.elements.some(e => e.name === 'Main entry' && e.poly?.length > 12), 'curb returns');
    assert.ok(o.elements.some(e => e.kind === 'pond' && e.poly?.length > 12), 'organic pond');
    assert.ok(o.elements.some(e => e.kind === 'parking' && e.caps) && o.elements.some(e => e.kind === 'building' && e.jog), 'rounded islands and staggered buildings');
  }
  assert.ok(opts.some(o => o.elements.some(e => e.name === 'Clubhouse')), 'a clubhouse');
  // a curved piece moves as a whole and stays valid
  const o = opts[0], pd = o.elements.find(e => e.kind === 'pond'), before = S.ringArea(pd.poly);
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
  for (const o of t) { const { m } = usable(plan, o, 'FM 362 townhomes'); assert.ok(m.units >= 70 && m.garages === m.units * 2, o.name + ': ' + m.units + ' townhomes'); assert.ok(o.elements.some(e => /Private lane/.test(e.note || ''))); }
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
  assert.ok(o.elements.filter(e => e.kind === 'pond').every(e => !e.poly), 'square ponds'); assert.ok(o.elements.filter(e => e.kind === 'pool').every(e => !e.poly), 'square pool');
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
  const plan = siteOf(fm362, true), prog = { use: 'retail', gfa: 28000, buildings: 4 }, opts = L.layoutOptions(plan, prog);
  assert.equal(opts.length, 3);
  for (const o of opts) {
    const { m } = usable(plan, o, '28k retail in 4'), B = o.elements.filter(e => e.kind === 'building');
    assert.equal(B.length, 4, o.name + ': four buildings, not one 28,000 sf box');
    for (const b of B) assert.ok(Math.abs(b.w * b.d - 7000) < 350, 'each about 7,000 sf: ' + Math.round(b.w * b.d));
    assert.ok(Math.abs(m.gfa - 28000) < 500 && m.spaces <= m.required * 1.35, o.name + ': ' + m.spaces + ' spaces for ' + m.required + ' needed (no acres of spare parking)');
    assert.ok(m.pond > 0 && m.pond < 0.6 * 43560, 'detention for the ~2 acres developed, not the whole 7.7: ' + (m.pond / 43560).toFixed(2) + ' ac');
    assert.ok(o.elements.some(e => e.kind === 'green' && e.future), 'the land not used is kept as a future pad or phase');
    const T = o.elements.filter(e => e.kind === 'trash'); assert.ok(T.length >= 2, 'a trash enclosure per ~25,000 sf (two here)');
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
  const plan = siteOf(fm362, true), mf = L.layoutOptions(plan, { use: 'multifamily' })[0], m = S.metrics({ ...plan, elements: mf.elements, program: mf.program });
  assert.equal(mf.elements.filter(e => e.kind === 'trash').length, Math.ceil(m.units / 50), 'apartments: a double enclosure per ~50 units');
  const th = L.layoutOptions(plan, { use: 'townhomes' })[0]; assert.equal(th.elements.filter(e => e.kind === 'trash').length, 0, 'homes roll carts to the curb');
  const off = L.layoutOptions({ ...plan, params: { trash: { mode: 'none' } } }, { use: 'retail', gfa: 28000 })[0]; assert.equal(off.elements.filter(e => e.kind === 'trash').length, 0, 'turned off');
  assert.equal(S.trashNeeds({ ...plan, program: { use: 'multifamily' }, elements: [{ kind: 'building', use: 'multifamily', x: 0, y: 0, w: 200, d: 60, units: 240 }] }).map(t => t.type).join(), 'compactor,double', 'a compactor from 200 units, with recycling');
}
console.log('site layouts ok');
