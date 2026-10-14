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
const o = L.layoutOptions(tract, { use: 'multifamily', units: 240, floors: 3 }, { count: 1 })[0], plan = { ...tract, elements: o.elements, program: o.program, recipe: o.recipe };
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
  assert.deepEqual([V.grid, V.snap, V.hidden.length, V.locked[0]], [5, false, 3, 'paving']); assert.deepEqual(T.viewOf({}), { grid: 0, snap: true, hidden: [], locked: [] }, 'defaults: no grid, snapping on');
  assert.equal(T.viewOf({ view: { grid: 7 } }).grid, 0, 'only 5 or 10 ft');
  assert.ok(!T.editable(V, { kind: 'parking' }) && !T.editable(V, { kind: 'garage' }) && T.editable(V, { kind: 'pond' }));
  const fc = S.planFeatures(plan, null); M.decorate(fc, plan); const vis = T.visibleFeatures(fc, V);
  assert.ok(!vis.features.some(f => ['building', 'b3', 'tree', 'label'].includes(f.properties.k)), 'buildings, their 3D parts, trees and labels hidden');
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
console.log('site tools ok');
