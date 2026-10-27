// Offline tests for the site plan editor's tools (lib/sitetools.mjs) on real generated layouts: a 240-unit apartment
// plan on a 20-acre tract (parking in merged groups, curved connector drives, the clubhouse with its pool deck and
// pool), a restaurant pad placed as the editor places one (its patio and drive-thru lane attached), a lot turned 30°,
// and a retail plan with an easement drawn through it (the checks, Build Layouts and Re-fit Plan keep off it).
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), T = await import('../lib/sitetools.mjs');
const M = await import('../lib/planmap.mjs'), G = await import('../lib/sitesheet.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const siteOf = g => { const b = S.unionParcels([g]), dn = b.ring.map((p, i) => S.outwardOf(b.ring, i)[1]); return { ...b, front: dn.indexOf(Math.min(...dn)), setbacks: { ...S.SETBACKS } }; }; // the street along the south
const finite = e => [e.x, e.y, ...(e.path || []).flat(), ...(e.poly || []).flat()].every(Number.isFinite);
let n = 0; const newId = () => 'n' + (++n);

// ---- a real apartment plan: moving and copying sets, with what's attached ----
const tract = siteOf(mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]]));
const o = L.layoutOptions({ ...tract, params: { fill: 'phase' } }, { use: 'multifamily', units: 240, floors: 3 }, { count: 1 })[0], plan = { ...tract, elements: o.elements, program: o.program, recipe: o.recipe }; // (the rest of the site filled and marked Phase 2, as Settings › Leftover land asks: the Phase 2 counts below)
{
  const club = plan.elements.find(e => e.name === 'Clubhouse'), deck = plan.elements.find(e => /pool deck/i.test(e.note || '')), pool = plan.elements.find(e => e.kind === 'pool');
  assert.ok(club && deck && pool, 'the clubhouse, its deck and pool');
  assert.deepEqual(T.withAttached(plan, [club.id]).map(e => e.id).sort(), [club.id, deck.id, pool.id].sort(), 'the clubhouse takes its deck and pool');
  // a set: the clubhouse and an apartment building, moved 30 ft east and 12 north; nothing else moves
  const apt = plan.elements.find(e => e.name === 'Apt Bldg 3'), r = T.moveSet(plan, [club.id, apt.id], 30, 12);
  assert.deepEqual(r.moved.sort(), [club.id, deck.id, pool.id, apt.id].sort());
  for (const id of r.moved) { const a = plan.elements.find(e => e.id === id), b = r.elements.find(e => e.id === id); assert.ok(Math.abs(b.x - a.x - 30) < 0.02 && Math.abs(b.y - a.y - 12) < 0.02 && b.pinned, 'moved with the set: ' + (a.name || a.kind)); }
  assert.equal(r.elements.filter(e => !r.moved.includes(e.id)).filter((e, i) => e !== plan.elements.filter(x => !r.moved.includes(x.id))[i]).length, 0, 'the rest are untouched');
  assert.ok(S.gapBetween(S.shapeOf(r.elements.find(e => e.id === pool.id)), S.shapeOf(r.elements.find(e => e.id === club.id))) <= 30, 'the pool is still at the clubhouse');
  assert.ok(plan.elements.find(e => e.id === club.id).x === club.x, 'the plan given is not changed');
  // the set's box and the ground it covers
  const bb = T.bboxOf([club, apt]); assert.ok(bb[0] <= Math.min(club.x, apt.x) && bb[2] >= Math.max(club.x, apt.x));
  assert.equal(Math.round(T.footprintOf([club, apt])), Math.round(S.footArea(club) + S.footArea(apt)));

  // copying: a curved connector drive (a path) comes out whole, with new ids and finite points
  const curve = plan.elements.find(e => e.kind === 'drive' && e.path), d = T.dupPieces(plan, [curve.id], { newId });
  assert.equal(d.elements.length, plan.elements.length + 1); const c = d.elements.find(e => e.id === d.ids[0]);
  assert.ok(c && c.id !== curve.id && finite(c) && c.path.length === curve.path.length && c.pinned, 'a copied path drive has finite points');
  assert.ok(Math.hypot(c.x - curve.x, c.y - curve.y) > 20, 'beside the original, not on it');
  // the main entry: a copy is a plain drive, so the plan still has one main entry
  const entry = plan.elements.find(e => e.name === 'Main entry'), de = T.dupPieces(plan, [entry.id], { newId });
  assert.equal(de.elements.filter(e => e.name === 'Main entry').length, 1); assert.ok(finite(de.elements.find(e => e.id === de.ids[0])) && !de.elements.find(e => e.id === de.ids[0]).entry);
  // the clubhouse: its deck and pool are copied with it, settled clear of the other buildings
  const dc = T.dupPieces(plan, [club.id], { newId }), cc = dc.elements.filter(e => dc.all.includes(e.id));
  assert.deepEqual(cc.map(e => e.kind).sort(), ['building', 'plaza', 'pool']); assert.equal(dc.ids.length, 1); assert.equal(cc.find(e => e.kind === 'building').name, 'Clubhouse copy');
  if (!dc.blocked) { const p2 = { ...plan, elements: dc.elements }; assert.ok(!S.check(p2).some(i => i.id === dc.ids[0] && /overlaps|setback|outside/.test(i.text)), 'the copy sits in a clear spot'); }
  // a set copied together keeps its spacing
  const ds = T.dupPieces(plan, [club.id, apt.id], { newId }), [c1, c2] = ds.ids.map(id => ds.elements.find(e => e.id === id));
  assert.ok(Math.abs((c2.x - c1.x) - (apt.x - club.x)) < 0.05 && Math.abs((c2.y - c1.y) - (apt.y - club.y)) < 0.05, 'the copies keep their places in the set');

  // a restaurant pad, as Draw adds one: its patio and drive-thru lane go with it when it moves or is copied
  const at = S.centroid(tract.ring), L1 = (u, v) => [at[0] + u, at[1] + v];
  const pad = { id: 'pad', kind: 'building', x: at[0], y: at[1], w: 44, d: 50, rot: 0, use: 'restaurant', floors: 1, name: 'Pad' }, patio = { id: 'pat', kind: 'patio', ...(q => ({ x: q[0], y: q[1] }))(L1(30.5, 8)), w: 15, d: 34, rot: 0 };
  const lane = { id: 'lane', kind: 'drive', path: [L1(-34, 60), L1(-34, -37), L1(50, -37), L1(50, 60)], width: 12, r: 14, x: at[0], y: at[1] - 37, note: 'Drive-thru lane' };
  const pp = { ...plan, elements: [pad, patio, lane] };
  assert.deepEqual(T.moveSet(pp, ['pad'], 5, 0).moved.sort(), ['lane', 'pad', 'pat']);
  const dp = T.dupPieces(pp, ['pad'], { newId }); assert.equal(dp.all.length, 3); assert.ok(dp.elements.filter(e => dp.all.includes(e.id)).every(finite));
}

// ---- box select on a lot turned 30° (the map's box comes in as four corners in plan feet) ----
{
  const a = 30 * Math.PI / 180, turn = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const lot = siteOf(mk([-95.75, 29.80], [[0, 0], [700, 0], [700, 500], [0, 500]].map(turn))), op = L.layoutOptions(lot, S.guessProgram('40,000 sf retail strip'), { count: 1 })[0], p = { ...lot, elements: op.elements };
  assert.ok(Math.abs(S.mainAngle(lot.ring) - 30) < 1, 'the lot runs at 30°');
  const B = p.elements.find(e => e.kind === 'building'), o2 = S.outline(B), r = (B.rot || 0) * Math.PI / 180;
  // a box square to the building (turned with the lot), 6 ft round it
  const box = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const u = sx * (B.w / 2 + 6), v = sy * (B.d / 2 + 6); return [B.x + u * Math.cos(r) - v * Math.sin(r), B.y + u * Math.sin(r) + v * Math.cos(r)]; });
  const got = T.boxSelect(p, box); assert.ok(got.includes(B.id), 'the building inside the box'); assert.ok(o2.every(q => S.inRing(q, box)));
  assert.ok(!got.some(id => p.elements.find(e => e.id === id).kind === 'parking' && !S.outline(p.elements.find(e => e.id === id)).every(q => S.inRing(q, box))), 'only pieces wholly inside');
  assert.ok(!got.some(id => { const e = p.elements.find(x => x.id === id); return e.kind === 'green' && !e.name; }), 'not the lawn under everything');
  // the same box square to the screen (not the lot) misses the building's corners
  const xs = box.map(q => q[0]), ys = box.map(q => q[1]), mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], h = (B.d / 2 + 6);
  assert.ok(!T.boxSelect(p, { x0: mid[0] - h, y0: mid[1] - h, x1: mid[0] + h, y1: mid[1] + h }).includes(B.id), 'a box too small for it leaves it out');
  // hidden and locked layers are left out
  assert.ok(!T.boxSelect(p, box, T.viewOf({ view: { hidden: ['buildings'] } })).includes(B.id)); assert.ok(!T.boxSelect(p, box, T.viewOf({ view: { locked: ['buildings'] } })).includes(B.id));
}

// ---- layers: the view only ----
{
  const V = T.viewOf({ view: { grid: 5, hidden: ['buildings', 'labels', 'trees'], locked: ['paving'], snap: false } });
  assert.deepEqual([V.grid, V.snap, V.hidden.length, V.locked[0]], [5, false, 3, 'paving']); assert.deepEqual(T.viewOf({}), { grid: 0, snap: true, hidden: [], locked: [], autoRefit: true }, 'defaults: no grid, snapping on, re-fit after edits');
  assert.equal(T.viewOf({ view: { autoRefit: false } }).autoRefit, false, 'auto re-fit can be turned off');
  { const v = T.viewOf({ view: { autoRefit: false } }); v.grid = 10; assert.equal(T.viewOf({ view: v }).autoRefit, false, 'and stays off when another view setting changes (setView writes the whole view back)'); }
  assert.equal(T.viewOf({ view: { grid: 7 } }).grid, 0, 'only 5 or 10 ft');
  assert.ok(!T.editable(V, { kind: 'parking' }) && !T.editable(V, { kind: 'garage' }) && T.editable(V, { kind: 'pond' }));
  const fc = S.planFeatures(plan, null); M.decorate(fc, plan); const vis = T.visibleFeatures(fc, V);
  assert.ok(!vis.features.some(f => ['building', 'b3', 'fac', 'tree', 'label'].includes(f.properties.k)), 'buildings, their 3D parts, trees and labels hidden');
  assert.ok(vis.features.some(f => f.properties.k === 'parking') && vis.features.some(f => f.properties.k === 'setback'), 'the rest stays');
  assert.ok(vis.keep && vis.keep === fc.keep, 'the planting kept for a drag survives');
  const V2 = T.viewOf({ view: { hidden: ['paving'] } }), v2 = T.visibleFeatures(fc, V2);
  assert.ok(!v2.features.some(f => f.properties.k === 'label' && f.properties.kind === 'parking') && v2.features.some(f => f.properties.k === 'label' && f.properties.kind === 'building'), 'a hidden piece takes its label with it');
  assert.equal(T.visibleFeatures(fc, T.viewOf({})), fc, 'nothing hidden: the same features');
  // the numbers and checks count everything whatever is hidden (they never see the view)
  assert.deepEqual(S.metrics({ ...plan, view: { hidden: ['buildings'] } }), S.metrics(plan));
  assert.equal(T.layerOf('keepout'), 'easements'); assert.equal(T.layerOf('patio'), 'land'); assert.equal(T.layerOf('trash'), 'trash');
}

// ---- measuring, the grid, dimensions ----
{
  assert.equal(T.pathLen([[0, 0], [30, 40], [30, 100]]), 110); assert.equal(T.polyArea([[0, 0], [100, 0], [100, 50], [0, 50]]), 5000); assert.equal(T.polyArea([[0, 0], [1, 1]]), 0);
  assert.equal(T.fmtArea(43560), '43,560 sq ft · 1.00 ac'); assert.deepEqual(T.measureLabels([[0, 0], [30, 40]]), [{ at: [15, 20], text: '50 ft' }]);
  assert.equal(T.measureLabels([[0, 0], [100, 0], [100, 50]], true).length, 3, 'a closed area labels its closing side too');
  assert.deepEqual(T.snapPt([13.2, 26.9], 10), [10, 30]);
  const s = T.snapPt([13.2, 26.9], 10, 30), q = S.rotPt(s, -30); assert.ok(Math.abs(q[0] / 10 - Math.round(q[0] / 10)) < 1e-3 && Math.abs(q[1] / 10 - Math.round(q[1] / 10)) < 1e-3, 'on the turned grid');
  const g = T.gridLines(tract.ring, 10, S.mainAngle(tract.ring), 1e4); assert.ok(g.length > 150 && g.every(l => l.flat().every(Number.isFinite)), g.length + ' grid lines');
  assert.deepEqual(T.gridLines(tract.ring, 10, 0, 50), [], 'too many to draw: none');
  const B = plan.elements.find(e => e.name === 'Apt Bldg 3'), dl = T.dimLabels(B);
  assert.deepEqual(dl.map(d => d.text), [T.fmtFt(B.w), T.fmtFt(B.d)]); assert.ok(dl.every(d => d.rot > -90 && d.rot <= 90), 'upright');
  assert.ok(Math.abs(Math.hypot(dl[0].at[0] - B.x, dl[0].at[1] - B.y) - (B.d / 2 + 10)) < 0.05, 'along its edge');
  assert.deepEqual(T.dimLabels(plan.elements.find(e => e.path)), [], 'curved pieces: none');
  assert.equal(T.ago(5000), 'just now'); assert.equal(T.ago(3 * 60000), '3 min ago'); assert.equal(T.ago(2 * 3600000), '2 h ago');
}

// ---- drawing areas and lines ----
{
  const p = { ring: [[0, 0], [600, 0], [600, 420], [0, 420]], elements: [] };
  assert.match(T.areaError(p, [[10, 10], [50, 10]], 'green'), /three points/);
  assert.match(T.areaError(p, [[10, 10], [100, 100], [100, 10], [10, 100]], 'green'), /crosses itself/);
  assert.match(T.areaError(p, [[500, 300], [700, 300], [700, 400], [500, 400]], 'pond'), /inside the lot/);
  assert.equal(T.areaError(p, [[0, 0], [30, 0], [30, 420], [0, 420]], 'keepout'), '', 'an easement can run along the lot line');
  assert.equal(T.areaError(p, [[20, 20], [80, 20], [80, 80], [20, 80]], 'plaza'), '');
  assert.match(T.lineError(p, [[10, 10]]), /two points/); assert.equal(T.lineError(p, [[0, 100], [200, 100], [300, 200]]), ''); assert.match(T.lineError(p, [[100, 100], [900, 100]]), /inside the lot/);
  const k = T.areaPiece(p, 'keepout', [[0, 0], [0, 420], [30, 420], [30, 0]], 'k1'); // drawn clockwise: stored counter-clockwise
  assert.ok(S.signedArea(k.poly) > 0 && k.pinned && k.name === 'Easement 1' && Math.abs(S.elArea(k) - 30 * 420) < 1);
  assert.equal(T.areaPiece({ elements: [k] }, 'keepout', [[100, 100], [140, 100], [140, 140]], 'k2').name, 'Easement 2');
  { // a building drawn corner by corner (an L): its own outline, the program's floors, measured like any building
    const L0 = [[20, 20], [20, 120], [60, 120], [60, 60], [140, 60], [140, 20]], b = T.areaPiece({ ...p, program: { floors: 3 } }, 'building', L0, 'b1');
    assert.equal(T.areaError(p, L0, 'building'), ''); assert.ok(b.kind === 'building' && b.floors === 3 && b.pinned && b.poly.length === 6 && S.isFree(b));
    assert.ok(Math.abs(S.elArea(b) - (40 * 100 + 80 * 40)) < 1, 'the L outline’s area, not its box’s');
    assert.ok(T.AREA_KINDS.some(([k]) => k === 'building'), 'offered in Draw an area'); }
  const d = T.linePiece(p, 'drive', [[0, 100], [200, 100], [300, 200]], 'd1'); assert.ok(d.path && d.width === 26 && d.pinned && finite(d) && Math.abs(d.x - T.pathLen(d.path) / 2) < 0.02 && d.y === 100, 'a drive: a 26 ft path, its point halfway along');
  assert.equal(T.linePiece(p, 'trail', [[10, 10], [80, 10]], 't1').width, 6);
}

// ---- easements: the checks, the numbers, the exports, Build Layouts and Re-fit Plan ----
{
  const lot = siteOf(mk([-95.8245, 29.7855], [[0, 0], [600, 0], [600, 420], [0, 420]])), xs = lot.ring.map(q => q[0]), ys = lot.ring.map(q => q[1]);
  const X0 = Math.min(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
  const ko = T.areaPiece(lot, 'keepout', [[X0 + 280, Y0 + 60], [X0 + 310, Y0 + 60], [X0 + 310, Y1], [X0 + 280, Y1]], 'ko1'); // a 30 ft utility easement running back through the middle
  const prog = S.guessProgram('25,000 sf retail strip'), plain = L.layoutOptions(lot, prog, { count: 1 })[0];
  const p0 = { ...lot, elements: plain.elements.concat(ko), program: plain.program, recipe: plain.recipe };
  const on = S.check(p0).filter(i => / is on Easement 1$/.test(i.text)); assert.ok(on.length, 'the checks flag what sits on it: ' + on.map(i => i.text).join(' / '));
  assert.ok(on.every(i => i.level === 'bad' && S.KEEP_OFF.includes(p0.elements.find(e => e.id === i.id).kind)));
  assert.ok(!S.check({ ...p0, elements: [ko] }).length, 'on its own (touching the lot line) it is no problem');
  const m0 = S.metrics({ ...lot, elements: [] }), m1 = S.metrics({ ...lot, elements: [ko] });
  assert.ok(Math.abs(m1.keepout - 30 * (Y1 - Y0 - 60)) < 2 && m1.gfa === 0 && m1.paved === 0 && m1.green < m0.green, 'not built or paved, and not open space');
  assert.ok(S.toDXF(p0).includes('EASEMENT'), 'its own CAD layer');
  const sheet = G.planSVG(p0).svg; assert.ok(/<pattern id="ko/.test(sheet) && /url\(#ko/.test(sheet), 'hatched on the sheet');
  assert.ok(G.sheetHTML({ plan: p0, project: { name: 'T' } }).includes('Easement / no-build (drawn, not surveyed)'), 'and in its legend');
  assert.ok(!G.sheetHTML({ plan: { ...lot, elements: plain.elements, program: plain.program }, project: { name: 'T' } }).includes('Easement / no-build'), 'no easement, no legend line');
  assert.match(M.keyHtml(p0), /Easement \/ no-build \(drawn, not surveyed\)/); assert.match(M.keyHtml(p0), /Site boundary \(planning\)/); assert.doesNotMatch(M.keyHtml(p0), /Parcel line/);
  assert.match(M.keyHtml({ ...p0, parcels: ['a', 'b'] }), /Parcel line \(county data\)/); assert.notEqual(M.keySig(p0), M.keySig({ ...p0, parcels: ['a', 'b'] }));
  // Re-fit Plan: the easement is pinned, so everything laid out again goes round it
  const rf = L.refit(p0), pr = { ...p0, elements: rf.elements };
  assert.ok(rf.elements.some(e => e.id === 'ko1'), 'the easement stays');
  assert.deepEqual(S.check(pr).filter(i => / is on Easement/.test(i.text)).map(i => i.text), [], 'a re-fit leaves it clear');
  for (const e of rf.elements.filter(e => S.KEEP_OFF.includes(e.kind))) assert.ok(!S.rectsOverlap(e, ko), (e.name || e.kind) + ' off the easement');
  const mr = S.metrics(pr); assert.ok(mr.gfa >= 20000 && mr.spaces >= mr.required, 'and still about the same plan: ' + Math.round(mr.gfa) + ' sf, ' + mr.spaces + '/' + mr.required);
  // Build Layouts: opts.keepout keeps every option off it, and each option carries it back
  const outs = L.layoutOptions(lot, prog, { keepout: [ko] });
  assert.equal(outs.length, 3);
  for (const op of outs) { const pp = { ...lot, elements: op.elements, program: op.program };
    assert.equal(op.elements.filter(e => e.kind === 'keepout').length, 1, op.name + ': the easement is kept');
    assert.deepEqual(S.check(pp).filter(i => i.level === 'bad').map(i => i.text), [], op.name + ': nothing on it, nothing else wrong'); }
  // ...without changing a plain build (no easement: no difference)
  assert.deepEqual(L.layoutOptions(lot, prog, { count: 1, keepout: [] })[0].elements.map(e => [e.kind, e.x, e.y]), plain.elements.map(e => [e.kind, e.x, e.y]));
  // dragging a building: an easement is an obstacle, so it settles off it
  const B = plain.elements.find(e => e.kind === 'building'), obs = S.spotObstacles(p0, B); assert.ok(obs.some(q => q.g === 2), 'the easement is among the obstacles');
}
// ---- one side at a time: a building's wall on a lot turned 30°, an L-shaped building's edge, a point added ----
{
  const a = 30 * Math.PI / 180, turn = ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const lot = siteOf(mk([-95.75, 29.80], [[0, 0], [700, 0], [700, 500], [0, 500]].map(turn))), op = L.layoutOptions(lot, S.guessProgram('40,000 sf retail strip'), { count: 1 })[0], p = { ...lot, elements: op.elements };
  const B = p.elements.find(e => e.kind === 'building' && !S.isFree(e)); const rel = (((B?.rot || 0) - 30) % 90 + 90) % 90; assert.ok(B && Math.min(rel, 90 - rel) < 1, 'a building square to the turned lot: ' + B?.rot);
  const near = (q, r, tol = 0.02) => Math.hypot(q[0] - r[0], q[1] - r[1]) < tol;
  for (let side = 0; side < 4; side++) {
    const opp = (side + 2) % 4, r = { ...B, ...T.dragSide(B, side, 20) }, n = T.sideNormal(B, side);
    assert.ok(near(T.sideMid(r, opp), T.sideMid(B, opp)), 'side ' + side + ' dragged 20 ft out: the opposite wall stays put');
    const moved = T.sideMid(r, side), was = T.sideMid(B, side); assert.ok(Math.abs((moved[0] - was[0]) * n[0] + (moved[1] - was[1]) * n[1] - 20) < 0.02 && near([moved[0] - n[0] * 20, moved[1] - n[1] * 20], was), 'and it moved 20 ft straight out');
    assert.equal(side % 2 ? r.w : r.d, +((side % 2 ? B.w : B.d) + 20).toFixed(2)); assert.equal(side % 2 ? r.d : r.w, side % 2 ? B.d : B.w, 'the other size is the same');
    assert.equal(S.footArea(r) > S.footArea(B), true);
  }
  const tiny = T.dragSide(B, 1, -B.w); assert.equal(tiny.w, 8, 'never under 8 ft across'); assert.ok(near(T.sideMid({ ...B, ...tiny }, 3), T.sideMid(B, 3)), 'still pinned at the opposite wall');
  // lining a dragged wall up with a neighbour's: a second building beside it, its front 2 ft past
  const ux = T.sideNormal(B, 1), nb = { ...B, id: 'nb', x: B.x + ux[0] * (B.w + 30), y: B.y + ux[1] * (B.w + 30) }, n0 = T.sideNormal(B, 0), off = { ...nb, x: nb.x + n0[0] * 2, y: nb.y + n0[1] * 2 };
  const s = T.sideSnap({ elements: [B, off] }, B, 0, 3); assert.ok(Math.abs(s - 2) < 0.02, 'the wall snaps 2 ft out to line up: ' + s);
  assert.equal(T.sideSnap({ elements: [B, { ...off, x: off.x + n0[0] * 5, y: off.y + n0[1] * 5 }] }, B, 0, 3), 0, 'nothing within 3 ft: no snap');
  assert.equal(T.sideSnap({ elements: [B, { ...off, rot: (B.rot || 0) + 17 }] }, B, 0, 3), 0, 'a neighbour turned another way is ignored');
  // an L-shaped building as points: its edges move one at a time, out along their normals, parallel
  const Lb = { ...B, form: 'L', d: 120 }, P = S.outline(Lb).map(q => q.map(v => +v.toFixed(2))); assert.equal(P.length, 6, 'an L has six points'); assert.equal(T.addPoint(Lb, P[2]), null, 'no new point on a corner already there');
  const area0 = S.ringArea(P);
  for (let i = 0; i < P.length; i++) {
    const n = T.edgeNormal(P, i), Q = T.dragEdge(P, i, 10), j = (i + 1) % P.length;
    assert.ok(near([Q[i][0] - P[i][0], Q[i][1] - P[i][1]], [n[0] * 10, n[1] * 10]) && near([Q[j][0] - P[j][0], Q[j][1] - P[j][1]], [n[0] * 10, n[1] * 10]), 'edge ' + i + ': both its points move 10 ft along its normal');
    assert.ok(Q.every((q, k) => k === i || k === j || near(q, P[k], 1e-9)), 'the other points stay');
    const L0 = Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]); assert.ok(S.ringArea(Q) > area0 + 10 * L0 * 0.9, 'out is outward: the area grows by about the edge × 10 ft');
  }
  assert.ok(near(T.dragEdge(P.slice().reverse(), 0, 10)[0], [P.slice().reverse()[0][0] + T.edgeNormal(P.slice().reverse(), 0)[0] * 10, P.slice().reverse()[0][1] + T.edgeNormal(P.slice().reverse(), 0)[1] * 10]) && S.ringArea(T.dragEdge(P.slice().reverse(), 0, 10)) > area0, 'drawn the other way round, out is still out');
  // a point added on a plain rectangle (as double-click does): it becomes points, the new one on the wall nearest the click
  const wallMid = T.sideMid(B, 2), click = [wallMid[0] + T.sideNormal(B, 2)[0] * 3 + ux[0] * 11, wallMid[1] + T.sideNormal(B, 2)[1] * 3 + ux[1] * 11], ap = T.addPoint(B, click);
  assert.ok(ap && ap.poly.length === 5, 'a rectangle with a fifth point'); assert.ok(S.segDist(ap.poly[ap.k], S.corners(B)[2], S.corners(B)[3]) < 0.02 && Math.hypot(ap.poly[ap.k][0] - click[0], ap.poly[ap.k][1] - click[1]) < 3.05, 'on the wall, nearest the click');
  assert.ok(Math.abs(S.ringArea(ap.poly) - S.ringArea(S.outline(B))) < 10, 'the same outline (to the hundredth of a foot), one point more');
  assert.equal(T.addPoint({ ...B, poly: ap.poly }, ap.poly[ap.k]), null, 'not twice on the same spot');
  // pasting: copies centred where asked, new ids, pinned
  const cs = T.copiesAt([B], [100, 200], newId); assert.ok(cs.length === 1 && cs[0].id !== B.id && cs[0].pinned && Math.abs(cs[0].x - 100) < 0.02 && Math.abs(cs[0].y - 200) < 0.02);
}

// ---- re-fit after an edit: a building dragged on a real retail plan; kept unless it loses space or adds problems ----
{
  const lot = siteOf(mk([-95.8245, 29.7855], [[0, 0], [600, 0], [600, 420], [0, 420]])), op = L.layoutOptions(lot, S.guessProgram('25,000 sf retail strip'), { count: 1 })[0];
  const p = { ...lot, elements: structuredClone(op.elements), program: op.program, recipe: op.recipe }, B = p.elements.find(e => e.kind === 'building');
  B.x += 25; B.pinned = true; // dragged 25 ft east, as the editor leaves it
  const before = JSON.stringify(p.elements), r = L.refit(p, { amount: 'current' }); assert.ok(r?.elements?.length, 're-fits');
  assert.equal(JSON.stringify(p.elements), before, 'the plan given is not changed (one undo step brings it back)');
  const kept = r.elements.find(e => e.id === B.id); assert.ok(kept && kept.x === B.x && kept.y === B.y, 'the dragged building stays where it was put');
  const at = x => ({ m: S.metrics(x), issues: S.check(x) }), local = at(p), fitted = at({ ...p, elements: r.elements });
  assert.ok(Math.abs(fitted.m.gfa - local.m.gfa) / local.m.gfa < 0.05, 'the same program: ' + Math.round(local.m.gfa) + ' → ' + Math.round(fitted.m.gfa));
  const v = T.refitVerdict(local, fitted); assert.ok(v.ok, 'kept: ' + v.why + ' / ' + fitted.issues.map(i => i.text).join('; '));
  // the guard: a re-fit that drops a building, or adds a problem, or parks fewer, is turned down
  const lessB = { m: { ...fitted.m, gfa: local.m.gfa * 0.9 }, issues: fitted.issues };
  assert.deepEqual(T.refitVerdict(local, lessB), { ok: false, why: 'space' });
  assert.deepEqual(T.refitVerdict({ m: { gfa: 1000, units: 100 }, issues: [] }, { m: { gfa: 1000, units: 90 }, issues: [] }), { ok: false, why: 'units' });
  assert.deepEqual(T.refitVerdict(local, { m: fitted.m, issues: fitted.issues.concat({ level: 'bad', text: 'Building B overlaps Building C' }) }), { ok: false, why: 'problems' });
  assert.deepEqual(T.refitVerdict({ m: { gfa: 1000, spaces: 50, required: 50 }, issues: [] }, { m: { gfa: 1000, spaces: 45, required: 50 }, issues: [] }), { ok: false, why: 'problems' }, 'parking short where it was not');
  assert.ok(T.refitVerdict({ m: { gfa: 1000 }, issues: [] }, { m: { gfa: 960 }, issues: [] }).ok, 'within 5%: fine');
}
// ---- the development mix: each use's building footprint, its share of the site, and the zones, on real layouts ----
{
  const sq = (o, w, d) => siteOf(mk(o, [[0, 0], [w, 0], [w, d], [0, d]]));
  const planOf = (site, prog) => { const op = L.layoutOptions(site, prog, { count: 1 })[0]; return { ...site, elements: op.elements, program: op.program, zones: op.zones || [] }; };
  const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
  // the sums agree with the plan's own numbers: footprint (buildings, not garages), floor area, the site
  const agrees = (p, what) => {
    const x = T.mixOf(p), m = S.metrics(p), B = p.elements.filter(e => e.kind === 'building');
    assert.ok(near(x.siteSf, m.siteSf) && near(x.siteAcres, m.acres, 1e-9), what + ': the site is the boundary');
    assert.ok(near(x.total.footprintSf, m.footprint), what + ': footprints add up to the plan’s (' + Math.round(x.total.footprintSf) + ' vs ' + Math.round(m.footprint) + ')');
    assert.ok(near(x.total.gfa, m.gfa), what + ': floor area adds up'); assert.equal(x.total.buildings, B.length);
    assert.ok(near(x.total.pctSite, m.coverage, 1e-9) && near(x.rows.reduce((s, r) => s + r.pctSite, 0), m.coverage, 1e-9), what + ': the shares add up to the coverage');
    for (const r of x.rows) {
      const mine = B.filter(e => T.mixKey(p, e) === r.use), sf = mine.reduce((s, e) => s + S.footArea(e), 0);
      assert.ok(near(r.footprintSf, sf) && r.buildings === mine.length, what + ': ' + r.label + ' is its buildings’ footprints');
      assert.ok(near(r.acres, sf / 43560, 1e-9) && near(r.pctSite, sf / m.siteSf, 1e-9) && near(r.gfa, mine.reduce((s, e) => s + S.gfaOf(e), 0)));
      assert.match(r.color, /^#[0-9a-f]{6}$/);
    }
    assert.equal(new Set(x.rows.map(r => r.color)).size, x.rows.length, what + ': a colour each');
    assert.ok(x.total.footprintSf + m.paved + m.pond < x.siteSf, what + ': parking, drives and ponds aren’t in it');
    assert.deepEqual(x.rows.map(r => r.footprintSf), x.rows.map(r => r.footprintSf).sort((a, b) => b - a), 'biggest first');
    return x;
  };
  // shops, restaurants and offices in zones from the street back
  const shops = planOf(sq([-95.70, 29.70], 900, 700), S.guessProgram('15,000 sf retail, 5,000 sf restaurant and 20,000 sf office')), xs = agrees(shops, 'retail/restaurant/office');
  assert.deepEqual(xs.rows.map(r => r.use).sort(), ['office', 'restaurant', 'retail'], 'three uses');
  assert.deepEqual(xs.rows.map(r => r.label).sort(), ['Office', 'Restaurant', 'Retail']);
  assert.equal(xs.rows.find(r => r.use === 'retail').color, M.USE_COL.retail, 'retail keeps the Plan key’s colour');
  assert.notEqual(xs.rows.find(r => r.use === 'restaurant').color, M.USE_COL.retail, 'restaurants (the same colour in the key) get one of their own');
  assert.ok(xs.rows.find(r => r.use === 'retail').footprintSf >= 15000 * 0.95 && xs.rows.find(r => r.use === 'office').gfa >= 20000 * 0.95, 'about what was asked');
  assert.equal(xs.zones.length, 3, 'its zones'); assert.ok(xs.zones.every(z => z.acres > 0 && near(z.pctSite, z.landSf / xs.siteSf, 1e-9) && z.landSf <= S.ringArea(shops.zones.find(q => q.name === z.name).ring) + 0.5));
  const zsum = xs.zones.reduce((s, z) => s + z.landSf, 0); assert.ok(zsum <= xs.siteSf * 1.001 && zsum > xs.siteSf * 0.6, 'the zones share the site, a zone inside another counted once: ' + T.fmtPct(zsum / xs.siteSf));
  for (const z of xs.zones) { const r = xs.rows.find(q => q.use === z.use); assert.ok(r && z.color === r.color, z.name + ': the colour of its use'); assert.ok(z.landSf > r.footprintSf, z.name + ': its land (with its parking) is more than its buildings'); }
  // apartments behind retail on the front: the clubhouse is an amenity, not an apartment building
  const mf = planOf(sq([-95.71, 29.71], 900, 1100), S.guessProgram('200 apartments with 20,000 sf of retail on the front')), xm = agrees(mf, 'multifamily + retail');
  assert.deepEqual(xm.rows.map(r => r.use).sort(), ['amenity', 'multifamily', 'retail']); assert.equal(xm.rows[0].use, 'multifamily', 'the apartments cover the most');
  assert.equal(xm.rows.find(r => r.use === 'amenity').buildings, mf.elements.filter(e => e.name === 'Clubhouse').length);
  assert.equal(xm.rows.find(r => r.use === 'multifamily').color, M.USE_COL.multifamily); assert.equal(xm.rows.find(r => r.use === 'amenity').color, M.USE_COL.amenity, 'distinct already: the Plan key’s colours');
  assert.deepEqual(xm.zones.map(z => z.use), ['retail', 'multifamily']);
  // homes and a commons with a community center: homes counted as homes, the center as an amenity
  const nb = planOf(sq([-95.72, 29.72], 1200, 1100), { use: 'mixed', zones: [{ use: 'sfr', units: 80 }, { use: 'amenity', items: ['center', 'pool', 'playground'] }] }), xn = agrees(nb, 'single-family + amenity center');
  const homes = xn.rows.find(r => r.use === 'sfr'), am = xn.rows.find(r => r.use === 'amenity');
  assert.ok(homes && homes.label === 'Single-family homes' && homes.noun === 'home' && homes.buildings >= 80, 'the homes: ' + homes?.buildings);
  assert.ok(am && am.buildings === nb.elements.filter(e => e.name === 'Community center').length && am.buildings >= 1, 'the community center');
  assert.ok(xn.zones.some(z => z.use === 'amenity') && xn.zones.some(z => z.use === 'sfr'));
  // Phase 2: counted in, its share said; one use on its own: no zones list (its one zone is the whole site)
  const xp = agrees(plan, '240 apartments'), apts = xp.rows.find(r => r.use === 'multifamily'), p2 = plan.elements.filter(e => e.kind === 'building' && e.phase === 2);
  assert.ok(p2.length && apts.phase2 && apts.phase2.buildings === p2.length && near(apts.phase2.footprintSf, p2.reduce((s, e) => s + S.footArea(e), 0)), 'Phase 2’s share of the apartments');
  assert.equal(T.mixOf({ ...plan, zones: [{ name: 'Multifamily', use: 'multifamily', ring: plan.ring }] }).zones.length, 0);
  // a parking garage is parking: counted apart, not in a use
  const gar = { id: 'g1', kind: 'garage', x: 100, y: 100, w: 180, d: 120, rot: 0, levels: 4 }, xg = T.mixOf({ ...shops, elements: shops.elements.concat(gar) });
  assert.ok(near(xg.total.footprintSf, xs.total.footprintSf) && xg.garages.count === 1 && near(xg.garages.footprintSf, 180 * 120));
  // the colours: told apart, the Plan key's where they can be; the fill picks one use out
  const cs = T.mixColors(['retail', 'restaurant', 'office', 'medical', 'hotel', 'multifamily', 'townhomes', 'sfr', 'amenity']), vals = Object.values(cs);
  assert.equal(new Set(vals).size, vals.length); assert.equal(cs.retail, M.USE_COL.retail);
  assert.equal(T.mixFill('office', cs, { focus: 'retail' }), '#cdd1d3'); assert.equal(T.mixFill('retail', cs, { focus: 'retail' }), cs.retail); assert.equal(T.mixFill('retail', cs, { ph: 2 }), M.lighten(cs.retail, 0.4));
  assert.equal(T.fmtPct(0.046), '4.6%'); assert.equal(T.fmtPct(0.123), '12%'); assert.equal(T.fmtPct(0.0004), '<0.1%'); assert.equal(T.fmtAc(0.344), '0.34 ac'); assert.equal(T.fmtAc(12.47), '12.5 ac');
  assert.deepEqual(T.mixOf({ ring: [], elements: [] }).rows, []);
}
// ---- Items (the Layers pop-over's second tab): every piece once, under its layer, with a short line on what it is ----
{
  const ED = await import('../lib/siteedit.mjs'), P = M.palette();
  // the real 240-unit apartment plan: 17 buildings, merged parking groups, curved drives, ponds, lawns, the pool deck
  const g = T.itemGroups(plan), all = g.flatMap(x => x.items), pieces = plan.elements.filter(e => e.kind !== 'lot');
  assert.equal(g[0].id, 'buildings', 'buildings first');
  assert.deepEqual(g.map(x => x.id), T.LAYERS.filter(L => L.kinds && pieces.some(e => L.kinds.includes(e.kind))).map(L => L.id), 'the layers that hold pieces, in the Layers order');
  assert.equal(all.length, pieces.length, 'every piece listed'); assert.equal(new Set(all.map(i => i.id)).size, all.length, 'each once');
  for (const x of g) for (const it of x.items) assert.equal(T.layerOf(it.kind), x.id, it.name + ' under its own layer');
  for (const it of all) assert.ok(it.sub && !/NaN|undefined|null/.test(it.sub), it.name + ': ' + it.sub);
  const names = g[0].items.map(i => i.name); assert.ok(names.indexOf('Apt Bldg 2') < names.indexOf('Apt Bldg 10'), 'Bldg 2 before Bldg 10');
  const apt = plan.elements.find(e => e.name === 'Apt Bldg 3'), ai = all.find(i => i.id === apt.id);
  assert.match(ai.sub, /^Multifamily · 3 floors · \d+ units · [\d,]+ sf$/); assert.equal(ai.color, M.buildingColor(P, 'multifamily'), 'the map colour');
  const row = plan.elements.find(e => e.kind === 'parking'), ri = all.find(i => i.id === row.id);
  assert.equal(ri.sub, S.spacesWord(S.stalls(row).count), 'a parking row: its spaces'); assert.equal(ri.color, M.COL.parking);
  const pond = plan.elements.find(e => e.kind === 'pond'); assert.match(all.find(i => i.id === pond.id).sub, /\d\.\d\d ac$/, 'a pond: its acres');
  const drive = plan.elements.find(e => e.kind === 'drive' && e.path); assert.match(all.find(i => i.id === drive.id).sub, /ft long$/, 'a drive: how long');
  // a building as the editor makes one: use, floors and floor area; Phase 2 says so (and is lighter, as on the map)
  const shop = { id: 's1', kind: 'building', use: 'retail', x: 0, y: 0, w: 120, d: 55.75, floors: 2, rot: 0 };
  assert.equal(T.itemSub(shop), 'Retail · 2 floors · 13,380 sf');
  assert.equal(T.itemSub({ ...shop, floors: 1, phase: 2 }), 'Retail · Phase 2 · 1 floor · 6,690 sf');
  assert.equal(T.itemColor({ ...shop, phase: 2 }), M.buildingColor(P, 'retail', { ph: 2 }));
  assert.equal(T.itemSub({ ...shop, use: undefined }, { program: { use: 'office' } }), 'Office · 2 floors · 13,380 sf', 'no use of its own: the plan’s');
  const ease = T.areaPiece({ elements: [] }, 'keepout', [[0, 0], [100, 0], [100, 60], [0, 60]], 'k1');
  assert.equal(T.itemSub(ease), 'Drawn, not surveyed · 6,000 sf'); assert.equal(T.itemColor(ease), P.lines.keepout);
  assert.equal(T.itemSub({ id: 'p', kind: 'pond', x: 0, y: 0, w: 220, d: 118.8, note: 'Dry basin' }), 'Dry basin · 0.60 ac');
  assert.equal(T.itemSub({ id: 't', kind: 'trash', x: 0, y: 0, w: 12, d: 12, note: 'Single · 8 yd dumpster' }), 'Single · 8 yd dumpster');
  assert.equal(T.itemSub({ id: 'g', kind: 'green', x: 0, y: 0, w: 40, d: 30, name: 'Dog park' }), 'Landscape · 1,200 sf', 'a named lawn says what it is');
  // a neighbourhood: the homes are listed, their lot lines aren't (they're never picked)
  const hood = L.layoutOptions(tract, { use: 'sfr' }, { count: 1 })[0], hp = { ...tract, elements: hood.elements, program: hood.program }, hg = T.itemGroups(hp);
  assert.ok(hood.elements.some(e => e.kind === 'lot') && !hg.flatMap(x => x.items).some(i => i.kind === 'lot'), 'no lot lines');
  assert.equal(hg[0].items.length, hood.elements.filter(e => e.kind === 'building').length); assert.match(hg[0].items[0].sub, /^House · \d floors? · [\d,]+ sf$/);
  // renaming: what's typed, trimmed and at most 40 characters; an empty name gives the label back; the list re-sorts
  assert.equal(T.cleanName('  The Oaks  '), 'The Oaks'); assert.equal(T.cleanName('x'.repeat(60)).length, 40); assert.equal(T.cleanName(null), '');
  assert.equal(ED.labelOf({ ...shop, name: T.cleanName('   ') }), 'Building'); assert.equal(ED.labelOf({ kind: 'keepout' }), 'Easement');
  const renamed = { ...plan, elements: plan.elements.map(e => e.id === apt.id ? { ...e, name: 'AAA Leasing' } : e) }, rg = T.itemGroups(renamed);
  assert.equal(rg[0].items[0].id, apt.id, 'the renamed building sorts to its new place'); assert.equal(rg[0].items[0].name, 'AAA Leasing');
  assert.equal(plan.elements.find(e => e.id === apt.id).name, 'Apt Bldg 3', 'the plan given is not changed');
  assert.deepEqual(T.itemGroups({}), [], 'an empty plan: nothing');
}
// ---- a drive as a route: Edit Shape on aisles, drawn drives and entrances ----
{
  const aisle = { id: 'a', kind: 'drive', x: 100, y: 50, w: 200, d: 24, rot: 30, note: '24 ft drive aisle' }, r = T.routeOf(aisle);
  assert.ok(r.path.length === 2 && r.width === 24 && !r.w && !r.rot && Math.abs(Math.hypot(r.path[1][0] - r.path[0][0], r.path[1][1] - r.path[0][1]) - 200) < 0.1, 'an aisle runs end to end, as wide as it was');
  assert.ok(Math.abs(S.ringArea(S.outline(r)) - 200 * 24) < 200 * 24 * 0.02, 'and covers the same ground');
  const ring = [[0, 0], [400, 0], [400, 300], [0, 300]], ent = { id: 'm', kind: 'drive', name: 'Main entry', note: '30 ft driveway', poly: [[-25, 0], [85, 0], [75, 3], [65, 10], [60, 20], [60, 70], [30, 70], [30, 20], [25, 10], [15, 3]].map(([x, y]) => [x + 120 - 45 + 15, y]) };
  const re = T.routeOf(ent, ring); assert.ok(re && T.isEntrance(re) && re.flare > 0 && re.width === 30, 'an entrance keeps its width and gets a flared mouth: ' + JSON.stringify(re));
  assert.ok(Math.abs(re.path[0][1]) < 0.01 && re.path[1][1] > 60, 'from the street (the lot line) into the site: ' + JSON.stringify(re.path));
  const o = S.outline(re), mouth = o.filter(p => p[1] < 1).map(p => p[0]); assert.ok(Math.max(...mouth) - Math.min(...mouth) > 70, 'the mouth flares out to meet the street');
  const ad = T.addRoutePoint([[0, 0], [100, 0], [100, 100]], [60, 8]); assert.deepEqual(ad, { path: [[0, 0], [60, 0], [100, 0], [100, 100]], k: 1 }, 'a point on the nearest stretch');
  assert.equal(T.addRoutePoint([[0, 0], [100, 0]], [1, 1]), null, 'not on top of a point already there');
  assert.deepEqual(T.onLotLine(ring, [150, 12]), [150, 0], 'a dragged mouth stays on the lot line');
  assert.deepEqual(T.lotLineAt(ring, [398, 120]), { at: [400, 120], mouth: [-1, 0] }, 'and comes in square to the stretch of lot line it lands on');
  { // bent hard (a short zigzag, a tight Curve): one clean outline, no fold, the throat square to the street, flares along it
    const z = { ...re, path: [re.path[0], [re.path[0][0] - 40, 30], [re.path[0][0] + 10, 70]], r: 80 }, o = S.outline(z);
    const crossings = o.reduce((t, a, i) => t + o.filter((b, j) => j > i + 1 && !(i === 0 && j === o.length - 1) && S.segSeg(a, o[(i + 1) % o.length], b, o[(j + 1) % o.length]) < 1e-6).length, 0);
    assert.equal(crossings, 0, 'a tight zigzag still makes one clean outline'); assert.ok(S.signedArea(o) !== 0 && o.every(p => p[1] > -0.6), 'nothing pokes out across the street: ' + Math.min(...o.map(p => p[1])).toFixed(2));
    const mouth = o.filter(p => p[1] < 0.5).map(p => p[0]); assert.ok(Math.max(...mouth) - Math.min(...mouth) > 60, 'the flares still meet the street side by side'); }
  const bent = { kind: 'drive', path: [[0, 0], [0, 100], [100, 100]], width: 26, r: 60 }, tight = { ...bent, r: 5 };
  assert.ok(S.ringArea(S.outline(bent)) < S.ringArea(S.outline(tight)), 'a bigger Curve rounds the bend off more');
}
// ---- turning any piece (curved ponds, lawns, drawn outlines, routes, medians, fences): the real 240-unit plan ----
{
  const ED = await import('../lib/siteedit.mjs');
  const fresh = () => structuredClone(plan), lens = (r, closed) => r.slice(0, closed ? r.length : -1).map((p, i) => Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1])).sort((a, b) => a - b);
  const pond = plan.elements.find(e => e.kind === 'pond'), med = plan.elements.find(S.isMedian), aisle = plan.elements.find(e => e.kind === 'drive' && !S.isFree(e) && !T.isEntrance(e));
  assert.ok(pond && med && aisle, 'the plan has a pond, the entry’s median and a straight aisle');
  const drawn = [T.areaPiece(plan, 'green', [[100, 0], [180, 10], [170, 90], [90, 70]], 'lawn1'), T.areaPiece(plan, 'building', [[-200, 100], [-120, 100], [-120, 160], [-160, 160], [-160, 200], [-200, 200]], 'cb1'), T.areaPiece(plan, 'keepout', [[-300, 300], [-100, 300], [-100, 330], [-300, 330]], 'k1'),
    T.linePiece(plan, 'trail', [[0, 300], [80, 340], [160, 300]], 'tr1'), T.linePiece(plan, 'drive', [[0, 400], [100, 450], [200, 420]], 'dr1'), { ...T.routeOf(aisle), id: 'cn1' }, { id: 'fe1', kind: 'fence', path: [[-250, -200], [-150, -200], [-150, -120], [-250, -120]], x: -200, y: -160, name: '' }];
  const cases = [['an organic pond', p => S.reshape(p.elements.find(e => e.id === pond.id), 'organic')], ['the entry’s median', p => p.elements.find(e => e.id === med.id)], ...drawn.map(d => [d.kind + (d.path ? ' route' : ' outline'), p => { p.elements.push(structuredClone(d)); return p.elements[p.elements.length - 1]; }])];
  for (const [what, pick] of cases) {
    const p = fresh(), e = pick(p), e0 = structuredClone(e), a0 = S.elArea(e), c0 = S.centroid(S.shapeOf(e)), r0 = e.rot || 0, pts0 = e.poly || e.path;
    const r = S.turnPiece(p, e, 20); assert.equal(r.deg, 20, what); const pts = e.poly || e.path;
    assert.ok(Math.abs(S.elArea(e) - a0) <= a0 * 0.001, what + ': the same area');
    const l0 = lens(pts0, !!e.poly), l1 = lens(pts, !!e.poly); assert.ok(l0.every((v, i) => Math.abs(v - l1[i]) <= 0.05), what + ': the same shape');
    const c1 = S.centroid(S.shapeOf(e)); assert.ok(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) <= 0.05, what + ': about its middle');
    assert.ok(Math.abs(((e.rot - r0 - 20) % 360 + 360) % 360) < 0.01, what + ': its heading up 20°'); assert.ok(finite(e), what + ': finite');
    assert.ok(pts.some((q, i) => Math.hypot(q[0] - pts0[i][0], q[1] - pts0[i][1]) > 1), what + ': it moved');
    S.turnPiece(p, e, -20); assert.ok((e.poly || e.path).every((q, i) => Math.hypot(q[0] - e0[e.poly ? 'poly' : 'path'][i][0], q[1] - e0[e.poly ? 'poly' : 'path'][i][1]) <= 0.02), what + ': turned back, every point where it was');
  }
  // the main entry (an outline from the layout): a route now, swung about its middle, its mouth slid along the street
  // and back on the lot line, square to it; the median drawn again inside it
  const p = fresh(), e = p.elements.find(x => x.name === 'Main entry'), was = T.routeOf(e, p.ring), a0 = S.elArea(e), fr = [p.ring[p.front], p.ring[(p.front + 1) % p.ring.length]];
  const ang = v => Math.atan2(v[1], v[0]) * 180 / Math.PI, way = P => ang([P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]]);
  let r = S.turnPiece(p, e, 15); p.elements = r.elements;
  assert.ok(e.path && !e.poly && r.deg === 15 && !r.why, 'a route now, turned 15°'); assert.ok(S.segDist(e.path[0], ...fr) < 0.05, 'its mouth on the street lot line');
  assert.deepEqual(e.mouth, T.lotLineAt(p.ring, e.path[0]).mouth, 'coming in square to the street');
  const slid = Math.hypot(e.path[0][0] - was.path[0][0], e.path[0][1] - was.path[0][1]); assert.ok(slid >= 5 && slid <= 80, 'the mouth slid along the street: ' + slid.toFixed(1) + ' ft');
  assert.ok(Math.abs(way(e.path) - way(was.path) - 15) <= 1, 'the way in turned 15°'); assert.ok(Math.abs(S.elArea(e) - a0) <= a0 * 0.06, 'about the same paving');
  // the sheet turns the plan to put its street at the bottom: the way in turns with it (its throat, curb returns and stop bar are drawn from it)
  { const te = G.turned(p, 30).elements.find(x => x.id === e.id), want = S.outline(e).map(q => S.rotPt(q, -30)), got = S.outline(te), off = (A, B) => Math.max(...A.map(q => Math.min(...B.map((b, i) => S.segDist(q, b, B[(i + 1) % B.length])))));
    assert.ok(Math.max(off(want, got), off(got, want)) < 0.1, 'the turned entrance turned for the sheet: ' + Math.max(off(want, got), off(got, want)).toFixed(2) + ' ft off'); }
  const es = S.shapeOf(e), md = S.entryParts(p, e).filter(S.isMedian); assert.equal(md.length, 1, 'its median went with it');
  assert.ok(S.shapeOf(md[0]).every(q => S.inRing(q, es) || Math.min(...es.map((a, i) => S.segDist(q, a, es[(i + 1) % es.length]))) <= 2), 'the median inside the turned drive');
  r = S.turnPiece(p, e, 75); assert.ok(Math.abs(Math.abs(way(e.path) - ang(e.mouth)) - 60) < 1 && /60°/.test(r.why), 'held to 60° off square: ' + r.why);
  // an entrance on the side street (a route), turned the other way: its mouth stays on the side street
  const side = tract.ring.findIndex((q, i) => S.outwardOf(tract.ring, i)[0] > 0.9), sa = tract.ring[side], sb = tract.ring[(side + 1) % tract.ring.length];
  const q2 = { ...fresh(), streets: [side] }, add = S.addEntrance(q2, [sa[0] + (sb[0] - sa[0]) * 0.45, sa[1] + (sb[1] - sa[1]) * 0.45], { id: 'e2' }); assert.ok(!add.error, add.error);
  q2.elements = add.elements; const e2 = q2.elements.find(x => x.id === 'e2'); Object.assign(e2, T.routeOf(e2, q2.ring)); delete e2.poly;
  r = S.turnPiece(q2, e2, -20); assert.ok(S.segDist(e2.path[0], sa, sb) < 0.05 && r.deg === -20, 'its mouth on the side street');
  // what goes with it: the main entry carries its median and sign; moved, they move; removed, they go
  const m0 = plan.elements.find(x => x.name === 'Main entry'), parts = S.entryParts(plan, m0); assert.ok(parts.some(S.isMedian) && parts.some(x => x.kind === 'sign'), 'its median and monument sign');
  assert.deepEqual(S.attachedTo(plan, m0).map(x => x.id).sort(), parts.map(x => x.id).sort(), 'they go with it');
  const mv = T.moveSet(plan, [m0.id], 12, 0); for (const x of parts) assert.ok(Math.abs(mv.elements.find(y => y.id === x.id).x - x.x - 12) < 0.02, 'moved with it');
  const gone = ED.applyEdits(plan, [{ action: 'remove', target: m0.id }]); assert.ok(!gone.elements.some(x => parts.some(y => y.id === x.id)), 'removed with it: ' + gone.done.join(' '));
}
// ---- ways in: a real boulevard (two lanes, a planted median, the monument sign), and where entrances may go ----
{
  const side = tract.ring.findIndex((q, i) => S.outwardOf(tract.ring, i)[0] > 0.9), T2 = { ...tract, streets: [side] }, sa = T2.ring[side], sb = T2.ring[(side + 1) % T2.ring.length];
  const ob = L.layoutOptions(T2, { use: 'multifamily', units: 240, floors: 3, entrances: 1 }, { count: 1 })[0], base = { ...T2, elements: ob.elements, program: ob.program }, at = f => [sa[0] + (sb[0] - sa[0]) * f, sa[1] + (sb[1] - sa[1]) * f];
  const bad = els => S.check({ ...base, elements: els }).filter(i => i.level === 'bad');
  let r = S.addEntrance(base, at(0.2), { boulevard: true, id: 'bv' }); assert.ok(!r.error, r.error);
  const ent = r.entrance, md = r.added.find(S.isMedian), sg = r.added.filter(x => x.kind === 'sign'), rt = T.routeOf(ent, base.ring), n = rt.mouth, u = [n[1], -n[0]];
  assert.ok(ent.blvd && /^Boulevard · 50 ft/.test(ent.note) && md && sg.length === 1, 'a boulevard with its median and a sign: ' + ent.note + ' / ' + r.why);
  const across = (poly, c) => { const ws = []; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], va = (a[0] - c[0]) * n[0] + (a[1] - c[1]) * n[1], vb = (b[0] - c[0]) * n[0] + (b[1] - c[1]) * n[1]; if (va * vb <= 0 && va !== vb) { const t = va / (va - vb); ws.push((a[0] + (b[0] - a[0]) * t - c[0]) * u[0] + (a[1] + (b[1] - a[1]) * t - c[1]) * u[1]); } }); return Math.max(...ws) - Math.min(...ws); };
  const mc = S.centroid(md.poly), W = across(S.shapeOf(ent), mc), M = across(md.poly, mc);
  assert.ok(Math.abs(W - 50) <= 0.5 && Math.abs(M - 14) <= 0.5 && Math.abs((W - M) / 2 - 18) <= 0.5, 'two 18 ft lanes either side of a 14 ft median: ' + W.toFixed(1) + ' / ' + M.toFixed(1));
  const es = S.shapeOf(ent); assert.ok(md.poly.every(q => S.inRing(q, es)), 'the median inside the drive');
  const v = q => (q[0] - rt.path[0][0]) * n[0] + (q[1] - rt.path[0][1]) * n[1], sc = S.corners(sg[0]);
  assert.ok(sc.every(q => S.inRing(q, md.poly)) && Math.min(...sc.map(v)) - Math.min(...md.poly.map(v)) >= 6 - 0.01, 'the sign in the median, 6 ft or more behind its nose');
  assert.deepEqual(bad(r.elements).filter(i => [ent.id, ...r.added.map(x => x.id)].includes(i.id)).map(i => i.text), [], 'nothing wrong with the new pieces');
  assert.equal(bad(r.elements).length, bad(base.elements).length, 'and nothing else made wrong');
  // signs at both corners: outside the drive, inside the lot, clear of every drive, row and building, one either side
  r = S.addEntrance(base, at(0.2), { boulevard: true, sign: 'both', id: 'bv2' }); const two = r.added.filter(x => x.kind === 'sign');
  assert.equal(two.length, 2, r.why); const near = r.elements.filter(x => ['drive', 'truck', 'parking', 'building', 'garage', 'pond'].includes(x.kind));
  for (const g of two) { const gs = S.corners(g); assert.ok(gs.every(q => S.inRing(q, base.ring)), 'inside the lot'); for (const x of near) assert.ok(S.gapBetween(gs, S.shapeOf(x)) >= 2 - 0.01, g.note + ' clear of ' + (x.name || x.kind)); }
  const sideOf = g => Math.sign((g.x - rt.path[0][0]) * u[0] + (g.y - rt.path[0][1]) * u[1]); assert.deepEqual(two.map(sideOf).sort(), [-1, 1], 'one either side of the way in');
  assert.deepEqual(bad(r.elements).filter(i => two.some(g => g.id === i.id)).map(i => i.text), []);
  // a 10 ft median: too narrow for the sign, so it goes to the corners and says why
  r = S.addEntrance({ ...base, params: { entry: { median: 10 } } }, at(0.2), { boulevard: true }); assert.ok(r.added.filter(x => x.kind === 'sign').every(g => g.sign === 'corner') && /10 ft wide/.test(r.why), r.why);
  // where entrances may go: near the corner of two streets, close to another, the spacing a setting
  const lot = { ring: [[0, 0], [800, 0], [800, 400], [0, 400]], front: 0, streets: [1], setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [{ id: 'dr', kind: 'drive', x: 400, y: 214, w: 760, d: 28, rot: 0 }, { id: 'dv', kind: 'drive', x: 700, y: 120, w: 26, d: 200, rot: 0 }] };
  const c1 = S.addEntrance(lot, [800, 60], { slide: 0 }); assert.match(c1.note, /60 ft from the corner of the two streets/); assert.ok(S.entryIssues({ ...lot, elements: c1.elements }).some(i => i.level === 'warn' && /60 ft from the corner/.test(i.text)), 'and the checks say so');
  const c2 = S.addEntrance(lot, [740, 0], { slide: 0 }); assert.ok(S.entryIssues({ ...lot, elements: c2.elements }).some(i => /from the corner/.test(i.text)), 'on the front street too');
  const e2 = S.addEntrance(base, at(0.45), { id: 'x2' }), e3 = S.addEntrance({ ...base, elements: e2.elements }, [e2.at[0] + (sb[0] - sa[0]) / Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) * 90, e2.at[1] + (sb[1] - sa[1]) / Math.hypot(sb[0] - sa[0], sb[1] - sa[1]) * 90], { id: 'x3' });
  const sp = pl => S.entryIssues({ ...pl, elements: e3.elements }).filter(i => /driveways usually need/.test(i.text)).map(i => i.text);
  assert.ok(sp(base).some(t => /90 ft from Entrance 2.*about 150 ft/.test(t)), sp(base).join(' / ')); assert.ok(sp({ ...base, params: { entry: { spacing: 300 } } }).some(t => /about 300 ft/.test(t)), 'the spacing is a setting');
  assert.ok(S.check({ ...base, elements: e3.elements }).some(i => i.level === 'warn' && /driveways usually need/.test(i.text)) && !S.check({ ...base, elements: e3.elements }).some(i => i.level === 'bad' && /driveways/.test(i.text)), 'a warning, never a failure');
  const cn = S.streetCorners(base); assert.equal(cn.length, 1, 'the south and east streets meet at one corner');
  for (const [pl, gap] of [[base, 150], [{ ...base, params: { entry: { spacing: 300 } } }, 300]]) { const m = S.moreEntrances(pl, 1), c = S.centroid(S.shapeOf(m.added[0])), hv = S.entrancesOf(pl.elements).map(e => S.centroid(S.shapeOf(e)));
    assert.ok(Math.hypot(c[0] - cn[0][0], c[1] - cn[0][1]) >= 100, 'clear of the corner'); assert.ok(hv.every(h => Math.hypot(h[0] - c[0], h[1] - c[1]) >= gap - 1), gap + ' ft from the others'); }
}
// ---- Change With AI in plain words: turning, boulevards, names ----
{
  const ED = await import('../lib/siteedit.mjs'), p = structuredClone(plan), pond = p.elements.find(e => e.kind === 'pond'); S.reshape(pond, 'organic');
  const a0 = S.elArea(pond); let ops = ED.guessEdits('turn the ' + pond.name.toLowerCase() + ' 20 degrees', p);
  assert.deepEqual(ops.map(o => [o.target, o.turnBy]), [[pond.id, 20]], 'a curved pond turns: ' + JSON.stringify(ops));
  assert.equal(ED.guessEdits('rotate the ' + pond.name.toLowerCase() + ' 20 degrees clockwise', p)[0]?.turnBy, -20);
  // the layout's pond runs across the site, lot line to lot line: turned 20° it fits nowhere, so it stays and says why
  let r = ED.applyEdits(p, ops); assert.deepEqual(r.elements.find(e => e.id === pond.id).poly, pond.poly, 'it stays where it was'); assert.ok(/can’t turn that far where it is/.test(r.skipped.join(' ')) && !r.done.length, r.done.join(' ') + r.skipped.join(' '));
  // a smaller one turns, the same size, inside the lot and off the buildings (moved to the nearest clear spot)
  { S.scaleBy(pond, 0.55, S.centroid(S.shapeOf(pond))); const a1 = S.elArea(pond); r = ED.applyEdits(p, ops); const pd = r.elements.find(e => e.id === pond.id), sh = S.shapeOf(pd);
    assert.ok(Math.abs(S.elArea(pd) - a1) < a1 * 0.001 && Math.abs(pd.rot - ((pond.rot || 0) + 20) % 360) < 0.01, 'turned, the same size: ' + r.done.join(' ') + r.skipped.join(' '));
    assert.ok(sh.every(q => S.inRing(q, p.ring)) && !r.elements.some(e => e.kind === 'building' && S.rectsOverlap(e, pd)), 'inside the lot, off the buildings');
    // never onto a drive (the re-fit is off by default, and laying the drives round it lost homes): turned, or left and it says why
    const b0 = S.check(p).filter(i => i.level === 'bad').map(i => i.text);
    for (const d of [20, 45]) { const r2 = ED.applyEdits(p, [{ action: 'change', target: pond.id, turnBy: d }]); assert.deepEqual(S.check({ ...p, elements: r2.elements }).filter(i => i.level === 'bad' && !b0.includes(i.text)).map(i => i.text), [], d + '°: ' + r2.done.join(' ') + r2.skipped.join(' ')); }
    const un = structuredClone(p); un.elements = un.elements.filter(e => e.kind !== 'pond' || e.id === pond.id); delete un.elements.find(e => e.id === pond.id).name; assert.deepEqual(ED.guessEdits('turn the pond 20 degrees', un).map(o => o.target), [pond.id], 'the one pond, unnamed, by what it is'); }
  // a plan laid out with the narrow entry (a 40 ft drive, a 10 ft median): made a boulevard by name
  const nw = L.layoutOptions({ ...tract, params: { entry: { style: 'narrow' } } }, { use: 'multifamily', units: 240, floors: 3 }, { count: 1 })[0], np = { ...tract, params: { entry: { style: 'narrow' } }, elements: nw.elements, program: nw.program, recipe: nw.recipe };
  const nm = np.elements.find(e => e.name === 'Main entry'); assert.ok(!nm.blvd && /Boulevard · 40 ft/.test(nm.note), 'narrow: ' + nm.note);
  { const r3 = ED.applyEdits(np, [{ action: 'change', target: nm.id, turnBy: 10 }]); assert.ok(!r3.skipped.length && /turned 10°/.test(r3.done.join(' ')), 'where its signs went is said with the turn, not as something left undone: ' + r3.skipped.join(' ')); }
  ops = ED.guessEdits('make the main entry a boulevard', np); assert.deepEqual(ops, [{ action: 'change', target: nm.id, boulevard: true, signs: null }]);
  r = ED.applyEdits({ ...np, params: {} }, ops); const nb = r.elements.find(e => e.id === nm.id), nparts = S.entryParts({ ...np, elements: r.elements }, nb);
  assert.ok(nb.blvd && T.routeOf(nb, np.ring).width === 50 && nparts.some(S.isMedian) && nparts.some(x => x.kind === 'sign'), 'the main entry 50 ft, its median and sign: ' + r.done.join(' ') + r.skipped.join(' '));
  // a boulevard entrance off the side street with signs on both sides
  const side = tract.ring.findIndex((q, i) => S.outwardOf(tract.ring, i)[0] > 0.9), sp = { ...p, streets: [side] };
  ops = ED.guessEdits('add a boulevard entrance off the side street with monument signs on both sides', sp); assert.equal(ops.length, 1); const f = ED.sheetFrame(sp), st = f.from([ops[0].x, ops[0].y]);
  assert.ok(ops[0].action === 'add' && ops[0].kind === 'entrance' && ops[0].boulevard && ops[0].signs === 'both' && S.segDist(st, tract.ring[side], tract.ring[(side + 1) % tract.ring.length]) < 1, 'on the east lot line: ' + JSON.stringify(ops));
  r = ED.applyEdits(sp, ops); const ne = S.entrancesOf(r.elements).find(e => e.name !== 'Main entry'), np2 = { ...sp, elements: r.elements }; assert.ok(ne, r.skipped.join(' ')); assert.equal(S.entryParts(np2, ne).filter(x => x.kind === 'sign').length, 2, r.done.join(' '));
  // (the drives sit 40 ft in from that street: no room for a median, so a plain driveway with its signs at the corners,
  // and it says why; never a 50 ft throat with nothing down its middle, nor a median claimed that isn't there)
  assert.ok(!ne.blvd && /26 ft driveway/.test(ne.note) && !S.entryParts(np2, ne).some(S.isMedian) && /signs at both corners\. Not a boulevard: it meets the first drive \d+ ft in/.test(r.done.join(' ')), ne.note + ' / ' + r.done.join(' '));
  { const n0 = structuredClone(ne), mb = S.makeBoulevard(np2, ne); assert.ok(/^No room for a boulevard there: it meets the first drive/.test(mb.error) && JSON.stringify(ne) === JSON.stringify(n0), 'Make It a Boulevard: no room, it stays as it is: ' + mb.error);
    const r4 = ED.applyEdits(np2, [{ action: 'change', target: ne.id, boulevard: true }]); assert.ok(!r4.elements.find(e => e.id === ne.id).blvd && !/median\)/.test(r4.done.join(' ')) && /No room for a boulevard/.test(r4.skipped.join(' ')), r4.done.join(' ') + ' / ' + r4.skipped.join(' ')); }
  // words that aren't a street ("from the street", "on the east side", "on both sides") leave the spot to the spacing
  // rule; a street named by the plan (FM 529, the front: where the main entry is) is never given a way in on top of
  // another, only the nearest spot along it that keeps the spacing, or none
  for (const t of ['add an entrance from the street', 'add an entrance on the east side', 'add a boulevard entrance with monument signs on both sides']) { const o = ED.guessEdits(t, sp); assert.ok(o.length === 1 && o[0].x == null, t + ': ' + JSON.stringify(o)); }
  const fp = { ...sp, streetNames: { [sp.front ?? S.longestEdge(sp.ring)]: 'FM 529' } }, fo = ED.guessEdits('add a boulevard entrance off FM 529 with monument signs on both sides', fp); assert.ok(fo[0].x != null && fo[0].boulevard && fo[0].signs === 'both', JSON.stringify(fo));
  const fr = ED.applyEdits(fp, fo), fq = { ...fp, elements: fr.elements, streets: fr.streets }, mo = S.entrancesOf(fr.elements).map(e => S.mouthOf(e, fp.ring));
  assert.ok(mo.every((a, i) => mo.every((b, j) => i === j || Math.hypot(a[0] - b[0], a[1] - b[1]) >= 150)), 'no two ways in nearer than the spacing: ' + fr.done.join(' ') + fr.skipped.join(' '));
  assert.deepEqual(S.check(fq).filter(i => i.level === 'bad' && !S.check(fp).some(j => j.text === i.text)).map(i => i.text), [], 'nothing new overlaps');
  // two ways in side by side keep their own signs: a driveway put in 100 ft from the main entry and turned 30° takes
  // nothing of the main entry's, and removing it leaves the main entry's sign
  { const me = sp.elements.find(e => e.name === 'Main entry'), m0 = S.mouthOf(me, sp.ring), u = (q => [q[1], -q[0]])(S.lotLineAt(sp.ring, m0).mouth), mine = S.entryParts(sp, me).map(x => x.id).sort(); let tried = 0; assert.ok(mine.some(id => sp.elements.find(e => e.id === id).kind === 'sign'), 'the main entry has its sign');
    for (const sg of [1, -1]) { const a = S.addEntrance(sp, [m0[0] + u[0] * 100 * sg, m0[1] + u[1] * 100 * sg]); if (a.error) continue; tried++; const q = { ...sp, elements: a.elements }, e2 = q.elements.find(e => e.id === a.entrance.id);
      assert.deepEqual(S.entryParts(q, q.elements.find(e => e.id === me.id)).map(x => x.id).sort(), mine, 'the main entry keeps its own'); q.elements = S.turnPiece(q, e2, 30).elements;
      assert.deepEqual(S.entryParts(q, q.elements.find(e => e.id === me.id)).map(x => x.id).sort(), mine, 'turning the other takes nothing of it');
      const rm = ED.applyEdits({ ...sp, elements: a.elements }, [{ action: 'remove', target: a.entrance.id }]); assert.ok(mine.every(id => rm.elements.some(e => e.id === id)), rm.done.join(' ')); } assert.ok(tried, 'a driveway beside the main entry'); }
  // a boulevard made by hand (its median an outline only): the stop bar and the sheet and the CAD file have no NaN in them
  { const mb = ED.applyEdits({ ...np, params: {} }, ED.guessEdits('make the main entry a boulevard', np)), mq = { ...np, params: {}, elements: mb.elements }, mk = S.entryMarks(mq);
    assert.ok(mk.length && mk.every(x => x.line.flat().every(Number.isFinite)), JSON.stringify(mk)); assert.ok(!/NaN/.test(G.planSVG(mq).svg) && !/NaN/.test(S.toDXF(mq)), 'no NaN on the sheet or in the DXF');
    // turned, its stop bar runs across its own outbound lane at the mouth (12 ft in, inside the drive)
    const mt = structuredClone(mq), me = mt.elements.find(e => e.name === 'Main entry'); mt.elements = S.turnPiece(mt, me, -30).elements; const bar = S.entryMarks(mt).find(x => x.w > 1 && S.inRing(x.line[0], S.shapeOf(me)));
    const into = q => (q[0] - me.path[0][0]) * me.mouth[0] + (q[1] - me.path[0][1]) * me.mouth[1]; assert.ok(bar && bar.line.every(q => S.inRing(q, S.shapeOf(me)) && Math.abs(into(q) - 12) < 0.1), 'the stop bar inside the turned drive, 12 ft in: ' + JSON.stringify(bar)); }
  // the Monument signs choice is the entrance's: a re-fit that lays the main entry out again keeps it (both, none), and a
  // sign deleted by hand stays gone; a pinned main entry's own median and sign aren't kept off as pieces of their own
  for (const mode of ['both', 'none']) { const q = structuredClone(plan), me = q.elements.find(e => e.name === 'Main entry'); q.elements = S.refreshEntry(q, me, mode).elements; const rf = L.refit(q, { amount: 'current', keep: true });
    assert.equal(rf.elements.filter(e => e.kind === 'sign').length, mode === 'both' ? 2 : 0, mode + ': ' + rf.elements.filter(e => e.kind === 'sign').map(e => e.note)); }
  { const q = structuredClone(plan), g0 = q.elements.find(e => e.kind === 'sign'); assert.ok(g0, 'the layout has its sign'); const dr = ED.applyEdits(q, [{ action: 'remove', target: g0.id }]); assert.equal(L.refit({ ...q, elements: dr.elements }, { amount: 'current', keep: true }).elements.filter(e => e.kind === 'sign').length, 0, 'deleted, it stays gone'); }
  { const q0 = L.refit(structuredClone(plan), { amount: 'current', keep: true }), q = structuredClone(plan); q.elements.find(e => e.name === 'Main entry').pinned = true; const q1 = L.refit(q, { amount: 'current', keep: true }), un = els => S.metrics({ ...plan, elements: els }).units;
    assert.ok(un(q1.elements) >= un(q0.elements) * 0.97, 'the main entry pinned: ' + un(q1.elements) + ' units, ' + un(q0.elements) + ' with it laid out again'); }
}
// ---- names: the community and its parts, kept with the program (saves, New Layouts, a new program) ----
{
  const ED = await import('../lib/siteedit.mjs');
  const raw = { ...S.guessProgram('37,700 sf retail with 2 pads, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units'), community: '  Beacon   Hill ', partName: 'x'.repeat(80) };
  raw.zones = raw.zones.map(z => z.use === 'retail' ? { ...z, partName: ' Beacon Hill Market ' } : z.use === 'multifamily' ? { ...z, partName: 'The Residences at Beacon Hill' } : z);
  const q = S.normalizeProgram(raw), rz = q.zones.find(z => z.use === 'retail');
  assert.equal(q.community, 'Beacon Hill', 'trimmed, one space'); assert.equal(rz.partName, 'Beacon Hill Market'); assert.equal(q.partName.length, 60, 'at most 60 characters');
  assert.deepEqual(S.normalizeProgram(JSON.parse(JSON.stringify(q))), q, 'a save and a load give the same names');
  assert.equal(S.normalizeProgram({ use: 'retail', gfa: 20000, garage: true, partName: 'Market Square' }).zones.find(z => z.use === 'garage').partName, null, 'a garage zone has no name');
  assert.equal(S.normalizeProgram({ use: 'retail', gfa: 20000, garage: true, partName: 'Market Square' }).zones[0].partName, 'Market Square', 'a shop with a garage: the name is the shops’');
  const tm = siteOf(mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]])), mo = L.layoutOptions(tm, q, { count: 1 })[0], mp = { ...tm, elements: mo.elements, program: mo.program, zones: mo.zones };
  assert.ok(mo.zones.length > 1 && mo.zones.every(z => Number.isInteger(z.zone) && mo.program.zones[z.zone].use === z.use), 'each drawn zone knows its part');
  assert.equal(mo.program.community, 'Beacon Hill', 'the names ride through the layout');
  const parts = S.partsOf(mp), m = S.metrics(mp);
  assert.equal(parts.reduce((t, x) => t + x.units, 0), m.units || 0, 'the parts’ units add up to the plan’s'); assert.equal(parts.reduce((t, x) => t + x.gfa, 0), Math.round(m.gfa), 'and their floor area');
  assert.equal(parts.find(x => x.use === 'retail').show, 'Beacon Hill Market'); assert.equal(parts.find(x => x.use === 'townhomes').show, 'Townhomes', 'no name: what it is');
  const fz = S.planFeatures(mp).features.filter(f => f.properties.k === 'zlabel'), F = S.frame(mp.origin);
  const mk2 = fz.find(f => f.properties.t === 'Beacon Hill Market'); assert.ok(mk2, 'a big label over the retail center'); assert.ok(S.inRing(F.toFt(mk2.geometry.coordinates), parts.find(x => x.use === 'retail').ring), 'inside its zone');
  // the PDF sheet: the community in the title block, the parts by name in the land use and program tables and over their zones
  const sd = G.sheetData(mp); assert.ok(sd.land.some(r => r[0] === 'Beacon Hill Market — Retail center'), JSON.stringify(sd.land.map(r => r[0]))); assert.ok(sd.program.some(r => /^Beacon Hill Market — Retail/.test(r[0])), JSON.stringify(sd.program.map(r => r[0])));
  const sh = G.sheetHTML({ plan: mp, project: { name: 'Stokes tract' } }); assert.match(sh, /<div class="cm">Beacon Hill<\/div>/); assert.match(sh, /<title>Beacon Hill · Stokes tract/); assert.match(G.planSVG(mp).svg, />BEACON HILL MARKET</);
  // a new program keeps them by use; names from Change With AI or plain words
  const nq = S.keepNames({ use: 'mixed', zones: [{ use: 'retail', gfa: 50000 }, { use: 'multifamily', units: 200 }, { use: 'amenity' }] }, raw), nn = S.normalizeProgram(nq);
  assert.equal(nn.community, 'Beacon Hill'); assert.equal(nn.zones[0].partName, 'Beacon Hill Market'); assert.equal(nn.zones[1].partName, 'The Residences at Beacon Hill'); assert.equal(nn.zones[2].partName, null);
  const w = S.normalizeProgram(S.withNames(mp.program, { community: 'Cypress Landing', parts: [{ part: parts.find(x => x.use === 'townhomes').i, name: 'Cypress Row' }] }));
  assert.equal(w.community, 'Cypress Landing'); assert.equal(w.zones.find(z => z.use === 'townhomes').partName, 'Cypress Row');
  let g = ED.guessNames('call the neighbourhood Beacon Hill Estates', mp); assert.deepEqual(g.parts.map(x => [mp.program.zones[x.part].use, x.name]), [['townhomes', 'Beacon Hill Estates']], JSON.stringify(g));
  g = ED.guessNames('name the retail center beacon hill market', mp); assert.deepEqual(g.parts.map(x => x.name), ['Beacon Hill Market'], 'all lower case: title case');
  g = ED.guessNames('call it Beacon Hill', mp); assert.equal(g.community, 'Beacon Hill'); assert.equal(ED.guessNames('rename bldg 1 to The Oaks', mp), null, 'a piece’s name isn’t one of these');
  const an = ED.applyNames(mp, ED.guessNames('call it Beacon Hill. name the apartments The Residences', mp)); assert.equal(S.normalizeProgram(an.program).community, 'Beacon Hill');
  assert.equal(S.normalizeProgram(an.program).zones.find(z => z.use === 'multifamily').partName, 'The Residences'); assert.deepEqual(an.done, ['Named the community Beacon Hill.', 'Named the apartments The Residences.']);
  const ln = ED.localNames(mp, { address: '23110 Stokes Rd, Hockley', city: 'Hockley' }); assert.equal(ln.choices.length, 3); assert.ok(ln.choices.every(c => /Stokes/.test(c.community) && c.parts.length === parts.length && c.why), JSON.stringify(ln.choices[0]));
  assert.ok(/Hockley/.test(ED.localNames(mp, { address: 'FM 362', city: 'Hockley' }).choices[0].community), 'a numbered road is passed over');
  const d = ED.describePlan(mp); assert.equal(d.community, 'Beacon Hill'); assert.ok(d.parts.length === parts.length && d.parts.every(x => Number.isInteger(x.part) && x.label), 'the AI sees the parts');
  assert.ok(d.site.streets.length >= 1 && d.site.streets[0].side === 'front' && d.site.entryRules.spacing === 150, 'and the streets and the entry rules');
  // a program normalizeProgram puts a garage zone into (Build with AI's "with a parking garage"): the names still land on
  // their own parts (it threw on the raw program, or named the wrong zone)
  { const gp = S.guessProgram('60,000 sf retail and 200 apartments with a parking garage'), was = { use: 'mixed', zones: [{ use: 'retail', gfa: 50000, partName: 'Beacon Market' }, { use: 'multifamily', units: 180, partName: 'The Residences' }] };
    assert.deepEqual(S.normalizeProgram(S.keepNames(gp, was)).zones.map(z => [z.use, z.partName]), [['retail', 'Beacon Market'], ['garage', null], ['multifamily', 'The Residences']]);
    const gi = S.normalizeProgram(gp).zones.findIndex(z => z.use === 'multifamily'); assert.equal(S.normalizeProgram(S.withNames(gp, { parts: [{ part: gi, name: 'Apts' }] })).zones[gi].partName, 'Apts', 'a part named by its index past the garage');
    const r3 = { use: 'mixed', garage: true, zones: [{ use: 'retail', gfa: 80000 }, { use: 'multifamily', units: 200 }, { use: 'townhomes', units: 40 }] };
    assert.deepEqual(S.normalizeProgram(S.keepNames(r3, { use: 'mixed', zones: [{ use: 'retail', gfa: 1, partName: 'M' }, { use: 'multifamily', units: 1, partName: 'Apts' }, { use: 'townhomes', units: 1, partName: 'Row' }] })).zones.map(z => z.partName), ['M', null, 'Apts', 'Row']);
    // a layout's copy of the program (Use This Layout) takes the plan's names as they are now, a cleared one too
    const lay = S.keepNames({ use: 'sfr', community: 'Old Name', partName: 'Old Part' }, { use: 'sfr', community: 'New Name', partName: null }, true), ln2 = S.normalizeProgram(lay); assert.deepEqual([ln2.community, ln2.partName], ['New Name', null]); }
}
// a site drawn on the map (Redraw Site): a bow-tie is refused (it measured 0.00 acres and laid out a 1,000 sf box), and a
// flat outline (corners in a line) has no boundary at all; both now get a toast instead of nothing
{ assert.ok(T.selfIntersects([[0, 0], [500, 350], [500, 0], [0, 350]]), 'the corners clicked out of order cross');
  assert.ok(!T.selfIntersects([[0, 0], [500, 0], [500, 350], [0, 350]]) && !T.selfIntersects([[0, 0], [400, 0], [200, 300]]), 'a plain outline or a triangle is fine');
  assert.equal(S.ringArea([[0, 0], [400, 300], [400, 0], [0, 300]]), 0, 'a bow-tie\'s halves cancel out: 0 acres');
  const F = S.frame([-95.8245, 29.7855]), bf = pts => { const ll = pts.map(F.toLL); return S.boundaryFrom({ type: 'Polygon', coordinates: [ll.concat([ll[0]])] }); };
  assert.equal(bf([[0, 0], [200, 0], [400, 0]]), null, 'three corners in a line: no site');
  assert.ok(S.ringArea(bf([[0, 0], [200, 1], [400, 0]]).ring) < 1000, 'all but in a line: a sliver under the 1,000 sf the editor asks for'); }
// ---- roundabouts and drop-off loops on a real neighbourhood (phase 2): the community-center neighbourhood as
// test/sitelayout.mjs lays it out (1200 × 900 ft, 75 homes on wave-free streets, a community park and a lake). A
// roundabout at a junction joins its streets into one paving with a planted island, every lot stays reached; it turns,
// moves, grows and comes off again leaving the streets exactly as they were; a drop-off loop goes where there's room ----
{
  const E = await import('../lib/siteedit.mjs'), site = { origin: [-95.93, 30.09], ring: [[-600, -450], [600, -450], [600, 450], [-600, 450]], front: 0, setbacks: { ...S.SETBACKS } }, home = { use: 'sfr', name: 'Single-story homes', floors: 1 };
  const prog = { use: 'sfr', max: true, storm: 'detention', unitSf: 2400, floors: 1, zones: [home, { use: 'amenity', name: 'Central community center and park', items: ['center', 'pool', 'playground', 'lawn'] }, home] };
  const o = L.layoutOptions(site, prog, { count: 1 })[0], base = { ...site, program: o.program, elements: o.elements, recipe: o.recipe }, cc = base.elements.find(e => e.kind === 'building' && e.use === 'amenity');
  const grownE = e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 };
  const reached = els => { const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), seen = new Set(D.filter(e => e.name === 'Main entry').map(e => e.id)), st = D.filter(e => seen.has(e.id)); while (st.length) { const e = st.pop(); for (const f of D) if (!seen.has(f.id) && S.rectsOverlap(grownE(e), grownE(f), 0)) { seen.add(f.id); st.push(f); } } return { seen, D }; };
  const allReached = els => { const { seen, D } = reached(els); return D.filter(d => !seen.has(d.id)).map(d => d.name || d.note || d.id); };
  const homesReached = els => { const { seen, D } = reached(els), R = D.filter(d => seen.has(d.id)).map(S.shapeOf); return els.filter(e => e.kind === 'building' && e.use === 'sfr').filter(h => !R.some(s => S.gapBetween(S.shapeOf(h), s) <= 60)).map(h => h.name); };
  const ov = (a, b) => S.rectsOverlap({ poly: a }, { poly: b }, 0.5), homes = els => els.filter(e => e.kind === 'building' && e.use === 'sfr').length, bad = els => S.check({ ...base, elements: els }).filter(i => i.level === 'bad').map(i => i.text);
  // what's over a roundabout's or a loop's lane or island: a drive across the island (the streets joined to it meet its lane), or anything else on either
  const over = (e, els) => { const lane = S.shapeOf(e), isl = S.islandOf(e), inner = S.grow(isl, -1);
    return els.filter(o => o !== e && (o.kind === 'drive' ? ov(S.shapeOf(o), inner) : ['truck', 'parking', 'building', 'garage', 'pond', 'pool', 'plaza'].includes(o.kind) ? ov(S.shapeOf(o), lane) || ov(S.shapeOf(o), inner) : o.kind === 'lot' ? (s => ov(s, lane) || ov(s, inner))(S.grow(S.shapeOf(o), -2)) : S.isPark(o) && (s => ov(s, lane) || ov(s, inner))(S.grow(S.shapeOf(o), -1)))).map(o => o.kind + ' ' + (o.name || '')); };
  const geo = e => JSON.stringify(S.shapeOf(e).map(p => p.map(v => Math.round(v * 10) / 10))), drives = els => els.filter(e => e.kind === 'drive').map(geo).sort();
  assert.ok(cc && homes(base.elements) >= 70 && !bad(base.elements).length, 'the neighbourhood: ' + homes(base.elements) + ' homes');
  // 1. where streets meet: the T's and crossings, one main (here the main entry's), the main entry's junction marked
  const J = S.junctionsOf(base), me = base.elements.find(e => e.name === 'Main entry');
  assert.ok(J.length >= 6 && J.every(j => j.legs >= 3), J.length + ' junctions'); assert.equal(J.filter(j => j.main).length, 1, 'one main junction');
  assert.ok(J.some(j => j.entry === me.id), 'the main entry ends at one'); assert.ok(J.every(j => Math.hypot(j.at[0] - cc.x, j.at[1] - cc.y) > 50), 'none in the community center');
  // 2. a roundabout at a T on the back street (the one farthest from the community center): joined, nothing on it
  const j = J.filter(j => j.at[1] > 250).sort((a, b) => Math.hypot(b.at[0] - cc.x, b.at[1] - cc.y) - Math.hypot(a.at[0] - cc.x, a.at[1] - cc.y))[0]; assert.ok(j, 'a junction on the back street');
  const r = S.addRoundabout(base, [j.at[0] + 30, j.at[1] - 20], { id: 'rb1' }), rb = r.roundabout; assert.ok(rb, r.error); const g = S.ringOf(rb), P1 = { ...base, elements: r.elements };
  assert.ok(Math.hypot(g.c[0] - j.at[0], g.c[1] - j.at[1]) <= 0.5 && (Math.abs(g.R - 50) < 0.5 || g.R >= 39.5 && g.R < 50 && /\d+ ft across: a 100 ft one would take \d+ homes/.test(r.note)) && rb.width === 20 && rb.pinned && rb.name === 'Roundabout', 'at the junction, 100 ft across (80 to 90 where that saves homes, and it says so), a 20 ft lane: ' + r.note);
  const stubs = r.elements.filter(e => e.cut === rb.id); assert.ok(stubs.length >= 2 && stubs.every(s => S.gapBetween(S.shapeOf(s), S.shapeOf(rb)) === 0), stubs.length + ' streets meet it');
  assert.deepEqual(over(rb, r.elements), [], 'nothing on its lane or island'); assert.deepEqual(bad(r.elements), []); assert.deepEqual(allReached(r.elements), [], 'every drive reached from the main entry'); assert.deepEqual(homesReached(r.elements), [], 'every home on a reached street');
  const lost = homes(base.elements) - homes(r.elements); assert.ok(lost <= 4 && (lost === 0 || r.note.includes(lost + (lost === 1 ? ' home' : ' homes') + ' made way')), lost + ' homes: ' + r.note);
  const holes = S.pavement(P1).flatMap(pv => pv.holes).filter(h => S.inRing(g.c, h)); assert.equal(holes.length, 1, 'one surface round one island'); assert.ok(Math.abs(S.ringArea(holes[0]) / (Math.PI * (g.R - 20) ** 2) - 1) < 0.05, 'the island ' + Math.round(S.ringArea(holes[0])) + ' sf');
  const dp = S.metrics(P1).paved - S.metrics(base).paved; assert.ok((dp > 0 || lost > 0) && dp < Math.PI * (g.R ** 2 - (g.R - 20) ** 2), 'paving +' + Math.round(dp) + ' sf'); // (homes that made way took their driveways with them: the paving can come out lower)
  const D1 = S.details(P1), isl = D1.islands.find(i => i.poly && S.inRing(g.c, i.poly)); assert.ok(isl && D1.trees.some(t => S.inRing(t, isl.poly)), 'its island planted, a tree in it');
  const fc = S.planFeatures(P1, rb.id).features; assert.ok(fc.some(f => f.properties.k === 'island') && fc.find(f => f.properties.id === rb.id).geometry.coordinates.length === 2, 'the map: the island, the ring with a hole');
  assert.ok(!/NaN/.test(G.planSVG(P1, { px: 900 }).svg) && !/NaN/.test(S.toDXF(P1)), 'the sheet and the DXF');
  assert.ok(T.itemSub(rb, P1).includes(Math.round(2 * g.R) + ' ft across'), T.itemSub(rb, P1) + ' / ' + rb.note); assert.ok(S.hitRect(rb, g.c) && !S.hitRect(rb, [g.c[0] + g.R + 10, g.c[1]]), 'clicking its island picks it');
  // a street that runs alongside, over its lane but too far out to be cut back to it: the check says so, and none is added there
  { const sv = { id: 'sv', kind: 'drive', name: 'Service drive', x: g.c[0], y: g.c[1] + 45, w: 300, d: 24, rot: 0 };
    assert.ok(S.check({ ...P1, elements: [...r.elements, sv] }).some(i => i.id === rb.id && i.level === 'bad' && i.text === 'Service drive runs across the lane of Roundabout'), 'a drive across its lane');
    assert.match(S.addRoundabout({ ...base, elements: [...base.elements, sv] }, j.at).error || '', /: Service drive is in the way/); }
  // 3. turned, nudged off the junction, made bigger, moved away (Alt-drag: where it's put): it joins the streets where it lands
  { const p = structuredClone(P1), e = p.elements.find(x => x.id === rb.id), t = S.turnPiece(p, e, 30); p.elements = t.elements;
    assert.equal(t.deg, 30); assert.ok(Math.hypot(e.x - g.c[0], e.y - g.c[1]) < 0.1 && p.elements.filter(x => x.cut === e.id).length === stubs.length, 'turned: in place, still joined'); assert.deepEqual(bad(p.elements), []);
    S.moveBy(e, 25, 10); let q = S.reseat(p, e); p.elements = q.elements; assert.ok(Math.hypot(e.x - j.at[0], e.y - j.at[1]) <= 1, 'nudged: back on the junction'); assert.equal(p.elements.filter(x => x.kind === 'drive').length, r.elements.filter(x => x.kind === 'drive').length);
    S.resizeRing(e, 60); q = S.reseat(p, e); p.elements = q.elements; assert.ok(Math.abs(S.ringOf(e).R - 60) < 0.5 && e.width === 20 && /120 ft across/.test(e.note), 'bigger: 120 ft across'); assert.ok(p.elements.filter(x => x.cut === e.id).length >= 2 && !over(e, p.elements).length, 'still joined, nothing on it: ' + over(e, p.elements).join(', '));
    assert.deepEqual(bad(p.elements), [], 'bigger: ' + q.why); assert.deepEqual(allReached(p.elements), []);
    const hard = base.elements.filter(x => ['drive', 'pond', 'pool', 'play', 'court', 'plaza'].includes(x.kind) && x.note !== 'Driveway' || x.kind === 'building' && x.use !== 'sfr' || S.isPark(x)).map(S.shapeOf), spots = []; // (a block of homes 300 ft or more away)
    for (let x = -480; x <= 480; x += 30) for (let y = -320; y <= 320; y += 30) spots.push([x, y]);
    const spot = spots.find(s => Math.hypot(s[0] - j.at[0], s[1] - j.at[1]) >= 300 && hard.every(h => S.gapBetween(h, S.ringDisc(s, 66)) > 0));
    assert.ok(spot, 'somewhere off the streets'); S.moveBy(e, spot[0] - e.x, spot[1] - e.y); q = S.reseat(p, e, { free: true }); p.elements = q.elements;
    const back = new Set(drives(p.elements.filter(x => x !== e))); assert.ok(drives(base.elements).every(k => back.has(k)), 'moved away: the junction\'s streets as they were');
    assert.ok(S.check(p).some(i => i.id === e.id && /isn’t on a street/.test(i.text)), 'and it says it isn\'t on a street'); }
  // 4. taken away: every street exactly as it was
  { const els = S.dropRing(P1, rb); assert.deepEqual(drives(els), drives(base.elements), 'the streets back'); assert.ok(!els.some(e => S.isRing(e) || e.cut)); }
  // 5. at the junction beside the community park: no room, and it says what's in the way
  { const jp = J.find(j => j.at[0] < -150 && Math.abs(j.at[1] - 23) < 30), q = S.addRoundabout(base, jp.at); assert.match(q.error || '', /No room for a roundabout at that junction: (Community park|Amenity lake) is in the way/); }
  assert.deepEqual(T.boxSelect(P1, S.ringDisc(g.c, 70, 8)).filter(id => id === rb.id), [rb.id], 'a box round it picks it');
  assert.deepEqual(T.dupPieces(P1, [rb.id]).ids, [], 'it isn\'t copied');
  // 6. a drop-off loop at the community center as laid out: its front is 28 ft from the street, so it goes on the back,
  // facing the drive past the community park (the park gives up the strip it needs)
  const homesAt = els => homes(els), lp = S.addLoop(base, cc, { id: 'lp1' }), loop = lp.loop; assert.ok(loop, lp.error);
  const ends = (e, els) => [e.path[0], e.path[e.path.length - 1]].every(p => els.some(x => x !== e && x.kind === 'drive' && S.inRing(p, S.shapeOf(x)))), Pl = { ...base, elements: lp.elements };
  assert.ok(ends(loop, lp.elements) && S.ringArea(S.islandOf(loop)) >= 600, 'both ends in a drive, an island ' + Math.round(S.ringArea(S.islandOf(loop))) + ' sf');
  assert.match(lp.note, /^On the back facing .*: its front is \d+ ft from the street, too close for a loop and its island/); assert.deepEqual(over(loop, lp.elements), []); assert.deepEqual(bad(lp.elements), []); assert.deepEqual(homesReached(lp.elements), []);
  assert.equal(S.loopMarks(Pl).length, 6, 'three one-way arrows'); assert.ok(!/NaN/.test(G.planSVG(Pl, { px: 900 }).svg));
  // then the community center moved into the middle of the homes (as test/sitelayout.mjs moves it): a loop in front of it, to the street
  { const f = E.sheetFrame(base), hs = base.elements.filter(e => e.kind === 'building' && e.use === 'sfr').map(e => f.to([e.x, e.y])), bk = hs.filter(h => h[1] > f.depth * 0.6), mid = [bk.reduce((t, h) => t + h[0], 0) / bk.length, bk.reduce((t, h) => t + h[1], 0) / bk.length];
    const mv = E.applyEdits(base, [{ action: 'move', target: cc.id, x: Math.round(mid[0]), y: Math.round(mid[1]) }]), P2 = { ...base, elements: mv.elements }, c2 = mv.elements.find(e => e.id === cc.id), q = S.addLoop(P2, c2, { id: 'lp2' }), l2 = q.loop;
    assert.ok(l2, q.error); assert.ok(!/^On the/.test(q.note), 'in front: ' + q.note); assert.ok(ends(l2, q.elements), 'both ends in the street'); assert.deepEqual(over(l2, q.elements), []); assert.deepEqual(bad(q.elements), []); assert.deepEqual(homesReached(q.elements), []);
    const p = { ...P2, elements: q.elements }, t = S.turnPiece(p, l2, 10); p.elements = t.elements; assert.ok(!t.why && ends(l2, p.elements), 'turned 10°: its ends still in the street');
    const u = S.rotPt([1, 0], c2.rot || 0); S.moveBy(l2, 15 * u[0], 15 * u[1]); const s = S.reseat(p, l2); assert.ok(!s.why && ends(l2, s.elements), 'slid 15 ft along: its ends still in the street'); }
  // a home isn't a building a loop goes in front of
  assert.match(S.addLoop(base, base.elements.find(e => e.use === 'sfr')).error, /goes in front of a clubhouse/);
}
// ---- a drop-off loop in front of the apartment plan's clubhouse as laid out: 30 ft from the drive, too close for a full
// loop and its island (44 ft), so a compact one (a 16 ft lane by the building's own walk, a narrow island) and the front
// parking row gives way; Change With AI adds it and makes it longer ----
{ const E = await import('../lib/siteedit.mjs'), cl = plan.elements.find(e => e.name === 'Clubhouse'), q = S.addLoop(plan, cl, { id: 'lc' }), l = q.loop, P = { ...plan, elements: q.elements }, bad = p => S.check(p).filter(i => i.level === 'bad').map(i => i.text), st = els => els.filter(e => e.kind === 'parking').reduce((t, e) => t + S.stalls(e).count, 0);
  assert.ok(l, q.error); assert.ok(q.side === 'front' && l.width === 16 && /^A compact loop: its front is \d+ ft from/.test(q.note), q.note);
  assert.ok([l.path[0], l.path[l.path.length - 1]].every(p => q.elements.some(x => x !== l && x.kind === 'drive' && S.inRing(p, S.shapeOf(x)))) && S.ringArea(S.islandOf(l)) >= 300, 'both ends in the drive, an island');
  assert.deepEqual(bad(P).filter(x => !bad(plan).includes(x)), []); assert.ok(!S.check(P).some(i => i.id === l.id), 'no warning on it'); const gave = st(plan.elements) - st(q.elements); assert.ok(gave > 0 && q.note.includes(gave + ' spaces gave way'), gave + ' spaces: ' + q.note);
  const a = E.applyEdits(plan, [{ action: 'add', kind: 'loop', with: cl.id }], { newId: () => 'lc2' }); assert.match(a.done[0] || '', /^Added a drop-off loop in front of Clubhouse\. A compact loop/); assert.equal(st(a.elements), st(q.elements), 'the same spaces give way');
  const w = E.applyEdits({ ...plan, elements: a.elements }, [{ action: 'change', target: 'lc2', w: 120 }]), l2 = w.elements.find(e => e.id === 'lc2'); assert.ok(l2 && Math.abs(l2.w - 120) < 0.5 && /120 ft long/.test(w.done[0]), w.done.concat(w.skipped).join(' '));
  const mv = structuredClone(P), c2 = mv.elements.find(e => e.id === cl.id); S.moveBy(c2, 0, 250); assert.ok(S.check(mv).some(i => i.id === l.id && /isn’t in front of Clubhouse any more/.test(i.text)), 'its building moved away: it says so');
  // taken away: every space it took back, as by Change With AI
  assert.equal(st(S.dropLoop(P, l)), st(plan.elements), 'taken away: its spaces back'); assert.equal(st(E.applyEdits({ ...plan, elements: a.elements }, [{ action: 'remove', target: 'lc2' }]).elements), st(plan.elements), 'removed by Change With AI: the same');
  // a drive laid across its lane (not the one it hangs off) is a problem
  { const d = { id: 'dx', kind: 'drive', name: 'Cut-through', x: (l.path[1][0] + l.path[2][0]) / 2, y: (l.path[1][1] + l.path[2][1]) / 2, w: 24, d: 200, rot: cl.rot || 0 }; assert.ok(S.check({ ...P, elements: [...q.elements, d] }).some(i => i.id === l.id && i.level === 'bad' && i.net && i.text === 'Cut-through runs across the lane of Drop-off loop'), 'a drive across its lane'); }
  // re-fitted with the loop pinned (the editor's re-fit after an edit, the Re-fit Plan button, Change With AI's): the
  // clubhouse and the drive the loop hangs off are where they were, the loop exactly as it was, nothing across it, and
  // the editor keeps the re-fit (it lost nothing the plan had)
  for (const opts of [{ amount: 'current' }, undefined, { amount: 'current', keep: true }]) { const rf = L.refit(P, opts), P2 = { ...plan, elements: rf.elements }, l2 = rf.elements.find(e => e.id === l.id), c3 = S.loopOf(P2, l2), w = JSON.stringify(opts);
    assert.ok(l2 && JSON.stringify(l2.path) === JSON.stringify(l.path), w + ': the loop as it was'); assert.ok(c3 && c3.name === 'Clubhouse' && Math.hypot(c3.x - cl.x, c3.y - cl.y) < 1 && l2.loop.of === c3.id, w + ': its clubhouse where it was (laid out again there, or held)');
    assert.ok([l2.path[0], l2.path[3]].every(p => rf.elements.some(x => x !== l2 && x.kind === 'drive' && S.inRing(p, S.shapeOf(x)))), w + ': both ends in a drive'); assert.deepEqual(S.check(P2).filter(i => i.id === l.id).map(i => i.text), [], w);
    assert.deepEqual(bad(P2).filter(x => !bad(plan).includes(x)), [], w); assert.ok(T.refitVerdict({ m: S.metrics(P), issues: S.check(P) }, { m: S.metrics(P2), issues: S.check(P2) }).ok, w + ': kept by the editor'); }
  // and the editor doesn't keep a re-fit that leaves a loop hanging off no drive (or away from its building)
  { const hung = P.elements.filter(e => !(e.kind === 'drive' && e !== l && [l.path[0], l.path[3]].some(p => S.inRing(p, S.shapeOf(e))))); assert.equal(T.refitVerdict({ m: S.metrics(P), issues: S.check(P) }, { m: S.metrics(P), issues: S.check({ ...P, elements: hung }) }).why, 'problems', 'its drive gone: not kept'); } }
// ---- two roundabouts on one street, and one at an entry whose median it took (240 homes asked on the 20-acre tract,
// its streets bent): taken away in either order, or moved off, the streets come back whole, every drive reached; the
// entry gets its median and sign back, the corner sign the roundabout put up goes ----
{
  const t2 = { ...S.unionParcels([mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]])]), front: null, setbacks: { ...S.SETBACKS } }, o2 = L.layoutOptions(t2, { use: 'sfr', units: 240 })[0], base = { ...t2, program: o2.program, elements: o2.elements, recipe: o2.recipe };
  const grownE = e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 };
  const lost = els => { const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), seen = new Set(D.filter(e => e.name === 'Main entry').map(e => e.id)), st = D.filter(e => seen.has(e.id)); while (st.length) { const e = st.pop(); for (const f of D) if (!seen.has(f.id) && S.rectsOverlap(grownE(e), grownE(f), 0)) { seen.add(f.id); st.push(f); } } return D.filter(d => !seen.has(d.id)).map(d => d.name || d.note || d.id); };
  const geo = e => JSON.stringify(S.shapeOf(e).map(p => p.map(v => Math.round(v * 10) / 10))), drives = els => els.filter(e => e.kind === 'drive').map(geo).sort(), bad = els => S.check({ ...base, elements: els }).filter(i => i.level === 'bad').map(i => i.text);
  const parts = els => S.entryParts({ ...base, elements: els }, els.find(e => e.name === 'Main entry')).map(x => (S.isMedian(x) ? 'median ' : x.kind + ' ') + x.id + ' ' + geo(x)).sort(), at = (els, c) => els.some(e => e.kind === 'drive' && !S.isRing(e) && S.inRing(c, S.shapeOf(e)));
  const J = S.junctionsOf(base), je = J.find(j => j.entry), p0 = parts(base.elements); assert.ok(je && p0.some(x => /^median/.test(x)), 'the main entry has a median');
  // at the entry: its median goes (too little room left), the signs stand at the corners; taken away or moved, they're as they were
  const r = S.addRoundabout(base, je.at, { id: 'E' }), P1 = { ...base, elements: r.elements }; assert.ok(r.roundabout && !parts(r.elements).some(x => /^median/.test(x)) && /corners/.test(r.note), r.error || r.note);
  { const d = S.dropRing(P1, r.roundabout); assert.deepEqual(parts(d), p0, 'taken away: the median and the sign back, the corner sign gone'); assert.deepEqual(drives(d), drives(base.elements)); assert.deepEqual(bad(d), []); }
  { const p = structuredClone(P1), e = p.elements.find(x => x.id === 'E'), jn = J.filter(j => j !== je && !S.addRoundabout(base, j.at).error).sort((a, b) => Math.hypot(a.at[0] - je.at[0], a.at[1] - je.at[1]) - Math.hypot(b.at[0] - je.at[0], b.at[1] - je.at[1]))[0];
    S.moveBy(e, jn.at[0] - e.x + 10, jn.at[1] - e.y + 5); p.elements = S.reseat(p, e).elements; assert.ok(Math.hypot(e.x - jn.at[0], e.y - jn.at[1]) < 0.5, 'moved: on the next junction'); assert.deepEqual(parts(p.elements), p0, 'moved off the entry: its median and sign back'); assert.deepEqual(lost(p.elements), []); assert.deepEqual(bad(p.elements), []); }
  // a second one down the street from it (it cuts a piece the first one cut): either taken away first, the other stays joined
  const jb = J.filter(j => j !== je).find(j => { const q = S.addRoundabout(P1, j.at, { id: 'B' }); return q.roundabout && q.roundabout.rb.cuts.some(k => k.was.cut === 'E'); }); assert.ok(jb, 'a junction on a street the first one cut');
  const r2 = S.addRoundabout(P1, jb.at, { id: 'B' }), P2 = { ...base, elements: r2.elements }; assert.deepEqual(lost(r2.elements), []); assert.deepEqual(bad(r2.elements), []);
  { const ids = r2.elements.map(e => e.id); assert.equal(new Set(ids).size, ids.length, 'every piece its own id (the second one\'s stubs too)'); }
  for (const [a, b] of [['E', 'B'], ['B', 'E']]) {
    const d1 = S.dropRing(P2, r2.elements.find(e => e.id === a)), rb = d1.find(e => e.id === b), c = S.ringOf(r2.elements.find(e => e.id === a)).c;
    assert.deepEqual(lost(d1), [], a + ' taken away first: every drive reached'); assert.deepEqual(bad(d1), [], a + ' first'); assert.ok(at(d1, c), a + ' first: the street runs through where it was');
    assert.ok(d1.filter(e => e.cut === b).length >= 2 && S.gapBetween(S.shapeOf(d1.find(e => e.cut === b)), S.shapeOf(rb)) === 0, 'the other still joined');
    const d2 = S.dropRing({ ...base, elements: d1 }, rb); assert.deepEqual(drives(d2), drives(base.elements), 'then ' + b + ': the streets exactly as they were'); assert.deepEqual(parts(d2), p0); }
  { const p = structuredClone(P2), e = p.elements.find(x => x.id === 'E'), c = S.ringOf(e).c; S.moveBy(e, 0, -2000); p.elements = S.reseat(p, e, { free: true }).elements; assert.deepEqual(lost(p.elements.filter(x => x !== e)), [], 'the first moved away (off the lot): every street reached'); assert.ok(at(p.elements, c), 'the street runs through where it was'); }
}
console.log('site tools ok');
