// How a plan is drawn on the map (lib/planmap.mjs), on real engine output: every label knows its piece, label priority
// (selected, problems, buildings by size, parking counts last), Phase 2 labels keep their use, the feature shapes the
// PDF and DXF read are untouched, one palette, the Plan key lists only what the plan uses, and
// Change With AI's checklist.
import assert from 'node:assert/strict';
import * as M from '../lib/planmap.mjs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs');

// ---- real engine output: 200 apartments on a big site (the rest filled as Phase 2) ----
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const big = S.unionParcels([mk([-95.98, 30.06], [[0, 0], [1400, 0], [1400, 1350], [0, 1350]])]), site = { ...big, front: 0, setbacks: { ...S.SETBACKS } };
const o = L.layoutOptions(site, S.guessProgram('200 apartments, 3 stories'))[0], plan = { ...site, program: o.program, elements: o.elements };
const bldgs = plan.elements.filter(e => e.kind === 'building'), sel = bldgs[3].id;
const raw = S.planFeatures(plan, sel), before = JSON.stringify(S.planFeatures(plan, sel));
const fc = M.decorate(S.planFeatures(plan, sel), plan);
const labels = fc.features.filter(f => f.properties.k === 'label');
assert.equal(labels.length, raw.features.filter(f => f.properties.k === 'label').length, 'no label added or lost');
assert.ok(labels.every(f => plan.elements.some(e => e.id === f.properties.id)), 'every label knows its piece');
assert.equal(fc.features.length, raw.features.length); assert.deepEqual(fc.features.map(f => f.geometry), raw.features.map(f => f.geometry)); // same shapes
assert.equal(JSON.stringify(S.planFeatures(plan, sel)), before, 'the lib output itself is unchanged');
// priorities: the selected piece first, buildings before amenities, drives and parking counts
const pri = k => labels.filter(f => f.properties.kind === k).map(f => f.properties.pri);
const selLab = labels.find(f => f.properties.id === sel); assert.equal(selLab.properties.pri, 0); assert.equal(selLab.properties.sel, 1);
assert.ok(pri('building').filter(p => p > 0).every(p => p >= 2 && p < 3));
assert.ok(pri('parking').length > 5 && pri('parking').every(p => p === 8), 'parking counts are placed last');
assert.ok(labels.filter(f => f.properties.kind === 'parking').every(f => f.properties.lp === 1)); assert.ok(labels.filter(f => f.properties.kind !== 'parking').every(f => f.properties.lp === 0));
assert.ok(Math.max(...pri('building')) < Math.min(...pri('parking')));
// bigger buildings first
assert.ok(M.labelPri('building', 30000) < M.labelPri('building', 2000)); assert.equal(M.labelPri('building', 30000, false, true), 1); assert.equal(M.labelPri('parking', 0, true), 0);
assert.ok(M.labelPri('pond') < M.labelPri('pool')); assert.ok(M.labelPri('pool') < M.labelPri('drive')); assert.ok(M.labelPri('drive') < M.labelPri('parking'));
// 3D parts know their building (the selected one's are drawn on their own layer)
assert.ok(fc.features.filter(f => f.properties.k === 'b3' && f.properties.bid === sel).every(f => f.properties.sel === 1));
assert.ok(fc.features.some(f => f.properties.k === 'b3' && f.properties.bid === sel));
// Phase 2: the use stays, "PH 2" on the first line; hyphens don't break
const p2 = labels.filter(f => f.properties.kind === 'building' && f.properties.ph === 2);
assert.ok(p2.length > 0, 'the filled site has Phase 2 buildings');
for (const f of p2) { const L0 = f.properties.t.split('\n'); assert.match(L0[0], / · PH 2$/); assert.ok(!L0.includes('Phase 2'), f.properties.t); assert.ok(L0.includes('Multifamily'), f.properties.t); }
const bl = labels.find(f => f.properties.kind === 'building' && f.properties.t.split('\n').length === 3); assert.equal(bl.properties.t1, bl.properties.t.split('\n')[0]); assert.equal(bl.properties.t2, bl.properties.t.split('\n')[0] + '\n' + bl.properties.t.split('\n')[2]);
assert.equal(M.phase2Label('APT BLDG 12\nPhase 2\n32 units', 'Multifamily'), 'APT BLDG 12 · PH 2\nMultifamily\n32 units');
assert.equal(M.phase2Label('Phase 2\n32 units', 'Multifamily'), 'Multifamily · PH 2\n32 units');
assert.equal(M.decorate({ features: [{ properties: { k: 'building', id: 'a', sel: 0, bad: 0, ph: 1, use: 'retail' } }, { properties: { k: 'label', t: 'PAD A-1\nRetail', kind: 'building' } }] }, { elements: [{ id: 'a', kind: 'building', w: 40, d: 50 }] }).features[1].properties.t, 'PAD A‑1\nRetail');
// flash: the pieces Change With AI touched
const fl = M.decorate(S.planFeatures(plan, null), plan, { flash: new Set([bldgs[0].id]) }).features.filter(f => f.properties.fl === 1);
assert.equal(fl.length, 1); assert.equal(fl[0].properties.id, bldgs[0].id);

// ---- one palette (the app is light only) ----
const Lt = M.palette();
assert.equal(Lt.use.multifamily, M.USE_COL.multifamily);
const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
assert.ok(lum(Lt.p2(Lt.use.multifamily)) > lum(Lt.use.multifamily), 'Phase 2 is lighter');
assert.ok(lum(M.brighten('#d8b16a')) > lum('#d8b16a'));
assert.equal(M.buildingColor(Lt, 'retail'), M.USE_COL.retail); assert.equal(M.buildingColor(Lt, 'retail', { ph: 2 }), M.lighten(M.USE_COL.retail)); assert.equal(M.buildingColor(Lt, 'retail', { garage: true }), M.COL.garage);

// ---- the Plan key: only what's used ----
const k = M.keyItems(plan); assert.deepEqual(k.uses, ['multifamily', 'amenity']); // the clubhouse
assert.match(M.keyHtml(plan), />Amenity</); // short names in the key assert.ok(k.kinds.includes('parking')); assert.ok(!k.kinds.includes('truck')); assert.equal(k.phase2, true);
const html = M.keyHtml(plan); assert.match(html, /Plan key/); assert.match(html, /Multifamily/); assert.match(html, /Phase 2/); assert.match(html, /Site boundary/); assert.match(html, /Setback/); assert.match(html, /Street side/); assert.match(html, /Problem/);
assert.doesNotMatch(html, /Truck court|Retail/);
const shop = { program: { use: 'retail' }, elements: [{ id: 'b', kind: 'building', use: 'retail' }, { id: 't', kind: 'truck' }] };
assert.doesNotMatch(M.keyHtml(shop), /Phase 2|Multifamily/); assert.match(M.keyHtml(shop), /Truck court/);
assert.equal(M.keySig(plan), M.keySig({ ...plan, elements: plan.elements.slice() }));

// a monument sign in the key; the parts' names over their zones keep no label priority (they never push a piece's label off)
{ const signed = { program: { use: 'multifamily', community: 'Beacon Hill' }, elements: [{ id: 's', kind: 'sign', x: 0, y: 0, w: 10, d: 5, rot: 0, name: 'Monument sign' }] };
  assert.ok(M.keyItems(signed).kinds.includes('sign') && /Monument sign/.test(M.keyHtml(signed)), 'the sign in the key'); assert.equal(M.labelPri('sign'), 4);
  const fc = { features: [{ type: 'Feature', properties: { k: 'sign', id: 's', sel: 0, bad: 0 } }, { type: 'Feature', properties: { k: 'label', t: 'BEACON HILL' } }, { type: 'Feature', properties: { k: 'zlabel', t: 'Beacon Hill Market' } }] };
  M.decorate(fc, signed); const z = fc.features[2].properties; assert.ok(z.pri == null && z.lp == null && z.id == null && z.t === 'Beacon Hill Market', 'a zone name is left as it is'); assert.equal(fc.features[1].properties.pri, 4, 'the sign’s label'); }

// ---- Change With AI's checklist ----
assert.deepEqual(M.checklist(['Building A: 3 stories.', 'Removed Building F.', 'Added Pool.', 'Moved Pad A.', 'Swapped Bldg 2 and Bldg 5.', 'Nothing to change on Bldg 9.', 'Added Main Entry from the street. It meets the drive.', 'Removed Clubhouse and its pool, plaza.']),
  ['Building A → 3 stories', 'Building F removed', 'Pool added', 'Pad A moved', 'Bldg 2 ⇄ Bldg 5', 'Main Entry added', 'Clubhouse removed (with its pool, plaza)']);
// a note that starts with a number is a sentence of its own too ("14 spaces gave way"), not part of what was added
assert.deepEqual(M.checklist(['Added Roundabout (120 ft across) where Main entry and a 24 ft drive aisle meet. 14 spaces gave way.', 'Removed Roundabout. The streets run through the junction again.', 'Added a drop-off loop on the back of Community center. On the back facing the 24 ft drive: its front is 28 ft from the street.']),
  ['Roundabout (120 ft across) where Main entry and a 24 ft drive aisle meet added', 'Roundabout removed', 'a drop-off loop on the back of Community center added']);
console.log('planmap ok');
