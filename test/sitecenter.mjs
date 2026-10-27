// Grocery-anchored centers (lib/sitecenter.mjs), measured against a built one traced from a satellite image
// (test/fixtures/real/retail-corner.json): on the same parcel with the same program the first option is the anchored
// center, with the anchor's back on the back build line toward the side street and its storefront facing the parking
// and the street, inline shops down the far side, the pads along the frontage, the parking field between the
// storefronts and the street, loading beside the anchor; it holds what was asked; the words read the anchor; an
// inside lot gets one too; a re-fit keeps the buildings; a program with no anchor gets no center.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs');

const R = JSON.parse(fs.readFileSync(new URL('./fixtures/real/retail-corner.json', import.meta.url)));
const [lon0, lat0] = R.origin, a = R.angle * Math.PI / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)], kx = 364567 * Math.cos(lat0 * Math.PI / 180);
const geo = ([fx, fy]) => [lon0 + (fx * ux[0] + fy * uy[0]) / kx, lat0 + (fx * ux[1] + fy * uy[1]) / 364567];
const B = S.unionParcels([{ type: 'Polygon', coordinates: [R.parcel.concat([R.parcel[0]]).map(geo)] }]);
const dirOf = c => { const d = ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] })[c]; return [d[0] * ux[0] + d[1] * uy[0], d[0] * ux[1] + d[1] * uy[1]]; };
const edgeTo = c => { const d = dirOf(c); return B.ring.map((p, i) => ({ i, k: S.outwardOf(B.ring, i)[0] * d[0] + S.outwardOf(B.ring, i)[1] * d[1] })).filter(e => e.k > 0.6).sort((p, q) => q.k - p.k)[0].i; };
const site = { ...B, front: edgeTo(R.front), streets: R.streets.map(edgeTo), setbacks: { ...S.SETBACKS } };
const bad = (plan, o) => S.check({ ...plan, program: o.program, elements: o.elements }).filter(i => i.level === 'bad').map(i => i.text);
const frontOf = plan => { const r = plan.ring, i = plan.front; return [r[i], r[(i + 1) % r.length]]; }, toLine = (p, [q0, q1]) => S.segDist(p, q0, q1);

// ---- the traced parcel, the traced program ----
{ const prog = S.guessProgram(R.ask); assert.equal(prog.anchor, 52000, 'the grocery read as the anchor'); assert.equal(prog.gfa, 106000, 'the parts add up'); assert.equal(prog.pads, 4);
  const out = L.layoutOptions(site, prog, { count: 3 }), o = out[0]; assert.ok(o?.elements?.length, 'a layout');
  assert.ok(/^Anchored center/.test(o.name), 'the anchored center first: ' + out.map(x => x.name).join(' | '));
  const B0 = o.elements.filter(e => e.kind === 'building'), anchor = B0.find(e => /Grocery anchor/.test(e.note || '')), wing = B0.find(e => /Inline shops/.test(e.note || '')), pads = B0.filter(e => /drive-thru/.test(e.note || ''));
  assert.ok(anchor && S.gfaOf(anchor) >= 52000 * 0.97, 'the anchor at its size'); assert.ok(wing, 'inline shops down the side'); assert.equal(pads.length, 4, 'four pads: ' + pads.length);
  const F = frontOf(site), rear = site.ring.map((p, i) => i).filter(i => i !== site.front).sort((i, j) => S.edgeLen(site.ring, j) - S.edgeLen(site.ring, i))[0], RL = [site.ring[rear], site.ring[(rear + 1) % site.ring.length]];
  const ac = S.corners(anchor), dRear = Math.min(...ac.map(p => toLine(p, RL))), dFront = Math.min(...ac.map(p => toLine(p, F)));
  assert.ok(dRear <= 25, 'the anchor\'s back on the back build line: ' + Math.round(dRear) + ' ft off'); assert.ok(dFront >= 200, 'the parking field between the anchor and the street: ' + Math.round(dFront) + ' ft');
  for (const p of pads) assert.ok(Math.min(...S.corners(p).map(q => toLine(q, F))) <= 60, 'a pad along the frontage');
  const rows = o.elements.filter(e => e.kind === 'parking'), between = rows.filter(r => toLine([r.x, r.y], F) < dFront).length; assert.ok(between >= rows.length * 0.6, 'most of the parking between the storefronts and the street');
  assert.ok(o.elements.some(e => e.kind === 'truck' && /Loading/.test(e.note || '')), 'loading beside the anchor');
  const m = S.metrics({ ...site, program: o.program, elements: o.elements }); assert.ok(m.gfa >= 106000 * 0.95, 'holds what was asked: ' + Math.round(m.gfa)); assert.ok(m.spaces >= 300, 'parked near what was built: ' + m.spaces);
  assert.deepEqual(bad(site, o), []);
  // a re-fit keeps the anchor, the shops and the pads where they are
  const plan = { ...site, program: o.program, elements: o.elements, recipe: o.recipe }, r = L.refit(structuredClone(plan), { amount: 'current' }); assert.ok(r?.elements?.length, 'a re-fit: ' + (r?.why || ''));
  const key = els => els.filter(e => e.kind === 'building').map(e => (e.note || '').split(' · ')[0] + '@' + Math.round(e.x / 5) + ',' + Math.round(e.y / 5)).sort().join('|'); assert.equal(key(r.elements), key(o.elements), 'the buildings as they were'); const m2 = S.metrics({ ...site, program: o.program, elements: r.elements }); assert.ok(m2.spaces >= m.spaces * 0.9, 'and the parking: ' + m2.spaces + ' of ' + m.spaces); }

// ---- the words: an anchor named within a whole, and none ----
{ assert.equal(S.guessProgram('100,000 sf retail center with a 60,000 sf grocery anchor and 4 pads').anchor, 60000); assert.equal(S.guessProgram('100,000 sf retail center with a 60,000 sf grocery anchor and 4 pads').gfa, 100000);
  assert.equal(S.guessProgram('40,000 sf retail strip with 2 pads').anchor, undefined); }

// ---- an inside lot (no side street), the anchor named: a center too; a strip with no anchor: none ----
{ const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
  const b = S.unionParcels([mk([-95.7, 29.9], [[0, 0], [1000, 0], [1000, 520], [0, 520]])]), lot = { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[1] < -0.9), setbacks: { ...S.SETBACKS } };
  const o = L.layoutOptions(lot, S.guessProgram('a 55,000 sf grocery with 30,000 sf of shops and 3 pads'), { count: 2 })[0]; assert.ok(/^Anchored center/.test(o.name), 'an inside lot: ' + o.name); assert.deepEqual(bad(lot, o), []);
  const s = L.layoutOptions(lot, S.guessProgram('40,000 sf retail strip with 2 pads'), { count: 1 })[0]; assert.ok(!/Anchored/.test(s.name), 'no anchor asked: ' + s.name); }
console.log('sitecenter: ok');
