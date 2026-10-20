// Offline tests for mixed sites laid out in pods (lib/sitepods.mjs, NEIGHBORHOOD-PLAN.md phase 3) on realistic sites:
// the 246-acre Waller tract (FM 362 along the south front, Bauer Road along the west side) with retail at the corner of
// the two roads, apartments along FM 362, homes round a lake and a commons; a 101-acre rectangle with retail at the
// corner and a commons in the middle; and the 20-acre tract that must stay as it was (bands only). Every pods plan must
// honour its placement hints, reach every drive, parking row and building from a way in, keep its program, hold or
// report its detention, break no rule, and stay within its time budget; re-fit, re-lay, swap and Change With AI keep
// working on it.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), P = await import('../lib/sitepods.mjs'), E = await import('../lib/siteedit.mjs'), G = await import('../lib/sitesheet.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const edge = (b, f) => b.ring.findIndex((p, i) => f(S.outwardOf(b.ring, i)));
const W = S.unionParcels([mk([-95.93, 30.06], [[0, 0], [3400, 0], [3400, 2400], [2300, 3300], [0, 3300]])]), front = edge(W, n => n[1] < -0.9), west = edge(W, n => n[0] < -0.9);
const site = { ...W, front, streets: [west], setbacks: { ...S.SETBACKS }, streetNames: { [front]: 'FM 362', [west]: 'Bauer Road' } };
const ASK = '60,000 sf retail with 2 pads at the corner of FM 362 and Bauer Road, 300 apartments along FM 362, about 600 homes around a lake, and a commons with a community center, pool and playground';
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), toPoly = (p, r) => r.reduce((m, a, i) => Math.min(m, S.segDist(p, a, r[(i + 1) % r.length])), Infinity);
const box = s => { const xs = s.map(p => p[0]), ys = s.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }, meet = (a, b, g = 2) => a[0] <= b[2] + g && b[0] <= a[2] + g && a[1] <= b[3] + g && b[1] <= a[3] + g;
// the network from every way in: drives that touch (1.5 ft each side), and the parking rows on them
function reachedAll(els) {
  const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), G0 = D.map(e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 }), B = G0.map(g => box(S.shapeOf(g)));
  const seen = new Set(S.entrancesOf(els).map(e => e.id)), st = D.filter(e => seen.has(e.id));
  while (st.length) { const e = st.pop(), i = D.indexOf(e); D.forEach((f, j) => { if (!seen.has(f.id) && meet(B[i], B[j]) && S.rectsOverlap(G0[i], G0[j], 0)) { seen.add(f.id); st.push(f); } }); }
  return { seen, D, G0, B };
}
// homes more than 60 ft from a reached street
const offStreet = (els, R) => { const near = R.D.filter(d => R.seen.has(d.id)).map(d => ({ q: S.shapeOf(d), b: box(S.shapeOf(d)) })); return els.filter(e => e.kind === 'building' && e.use === 'sfr').filter(h => !near.some(r => h.x > r.b[0] - 120 && h.x < r.b[2] + 120 && h.y > r.b[1] - 120 && h.y < r.b[3] + 120 && S.gapBetween(S.shapeOf(h), r.q) <= 60)).map(h => h.name); };
function reach(plan, els, what) {
  const R = reachedAll(els);
  for (const d of R.D) if (d.note !== 'Drive-thru lane') assert.ok(R.seen.has(d.id), what + ': drive ' + (d.name || d.note) + ' at ' + Math.round(d.x) + ',' + Math.round(d.y) + ' is cut off');
  for (const e of els.filter(e => e.kind === 'parking')) { const g = { ...e, w: e.w + 3, d: e.d + 3 }, b = box(S.shapeOf(g)); assert.ok(R.D.some((d, i) => R.seen.has(d.id) && meet(b, R.B[i]) && S.rectsOverlap(g, R.G0[i], 0)), what + ': a parking row at ' + Math.round(e.x) + ',' + Math.round(e.y) + ' is off the network'); }
  assert.deepEqual(offStreet(els, R), [], what + ': homes off the street');
  const live = R.D.filter(d => R.seen.has(d.id)).map(d => ({ o: S.outline(d), b: box(S.outline(d)) }));
  for (const b of els.filter(e => e.kind === 'building' && !['sfr', 'townhomes', 'duplex'].includes(e.use))) { const r = Math.max(b.w, b.d) / 2 + 160, c = [b.x, b.y]; assert.ok(live.some(q => meet(q.b, [c[0] - r, c[1] - r, c[0] + r, c[1] + r], 0) && toPoly(c, q.o) < r), what + ': ' + b.name + ' is far from a reached drive'); }
}
const check = (plan, els) => S.check({ ...plan, elements: els }).filter(i => i.level === 'bad').map(i => i.text);
const podsOf = o => o.zones.filter(z => z.pod);

// ---- the words: the placement read without the AI ----
const prog = S.guessProgram(ASK), Z = prog.zones;
assert.deepEqual(Z.map(z => z.use + ':' + (z.place?.where || '')), ['retail:corner', 'amenity:middle', 'multifamily:along', 'sfr:around'], 'the placement read from the words');
assert.equal(L.wantPods(site, S.normalizeProgram(prog)), true, 'a big mixed site tries pods');

// ---- 1. the whole search, timed: bands and pods ranked together ----
const t0 = Date.now(), out = L.layoutOptions(site, prog, { count: 3 }), ms = Date.now() - t0, stats = L.podStats;
console.log('246 ac mixed: ' + ms + ' ms (pods ' + stats.ms + ' ms, ' + stats.options + ' options): ' + out.map(o => (o.style || 'bands') + ' · ' + o.name + ' · ' + Math.round(o.score)).join(' | '));
assert.ok(out.some(o => o.recipe?.pods), 'a pods option'); assert.ok(out.some(o => !o.recipe?.pods), 'and a band option still');
const budget = stats.budget;
assert.ok(stats.ms <= budget * 1.3 + 4000, 'the pods within their time: ' + stats.ms + ' ms of ' + budget); assert.ok(ms < 90000, 'the whole call: ' + ms + ' ms'); // (bands alone take about 33 s for this program, longer on a busy machine; the pods get what's left of 50 s, 8 s at least)
const o = out.find(x => x.recipe?.pods), plan = { ...site, program: o.program, elements: o.elements, zones: o.zones, recipe: o.recipe }, els = o.elements;

{ const hm = x => P.hintsMet(site, S.normalizeProgram(prog), x.elements, x.zones).filter(h => !h.ok).length, Z0 = S.normalizeProgram(prog).zones, got = x => Z0.map(z => Math.min(z.units || z.gfa || 1e12, x.elements.filter(e => e.kind === 'building' && e.use === z.use).reduce((t, e) => t + (z.units || ['multifamily', 'sfr'].includes(z.use) ? e.units || 0 : S.gfaOf(e)), 0)));
  const pd = out.find(x => x.recipe?.pods), bs = out.filter(x => !x.recipe?.pods); // (each use counted up to what was asked: homes past the 600 asked are a later phase, not a better plan)
  if (!hm(pd) && bs.every(b => hm(b) > 0) && bs.every(b => got(pd).every((v, i) => Z0[i].use === 'amenity' || v >= got(b)[i] * 0.97))) assert.ok(out[0] === pd, 'the pods plan keeps every placement and what was asked: first'); }

// ---- 2. the best pods plan ----
{ const hm = P.hintsMet(plan, S.normalizeProgram(o.program), els, o.zones); assert.ok(hm.length === 4 && hm.every(h => h.ok), JSON.stringify(hm));
  const ring = site.ring, N = ring.length, sw = ring.reduce((b, p) => p[0] + p[1] < b[0] + b[1] ? p : b), zr = u => o.zones.filter(z => z.use === u);
  // retail at the corner of the two roads
  assert.ok(zr('retail').some(z => toPoly(sw, z.ring) < 60), 'the retail pod at the SW corner');
  const shops = els.filter(e => e.kind === 'building' && S.COMMERCIAL.includes(e.use)), sf = shops.reduce((t, e) => t + S.gfaOf(e), 0), nearSf = shops.filter(e => dist([e.x, e.y], sw) < 900).reduce((t, e) => t + S.gfaOf(e), 0);
  assert.ok(nearSf >= sf * 0.9, 'the shops near the corner: ' + Math.round(nearSf) + ' of ' + Math.round(sf));
  // apartments along FM 362
  const fl = [ring[front], ring[(front + 1) % N]], onFront = r => r.reduce((t, p, k) => { const q = r[(k + 1) % r.length]; return t + (S.segDist([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], fl[0], fl[1]) < 3 ? dist(p, q) : 0); }, 0);
  const apZ = zr('multifamily'), apB = els.filter(e => e.kind === 'building' && e.use === 'multifamily');
  assert.ok(apZ.some(z => onFront(z.ring) >= 300), 'the apartments’ pod along the front');
  for (const b of apB) { assert.ok(apZ.some(z => onFront(z.ring) >= 300 && S.inRing([b.x, b.y], z.ring)), b.name + ' in a pod on the front'); assert.ok(S.segDist([b.x, b.y], fl[0], fl[1]) <= 700, b.name + ' near the front'); }
  // the commons and its lake in the middle, homes round it
  const lake = els.find(e => e.kind === 'pond' && e.name === 'Amenity lake'), cz = zr('amenity')[0]; assert.ok(lake && cz, 'the amenity lake in the commons');
  const per = cz.ring.reduce((t, p, k) => t + dist(p, cz.ring[(k + 1) % cz.ring.length]), 0), onLine = cz.ring.reduce((t, p, k) => { const q = cz.ring[(k + 1) % cz.ring.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return t + (toPoly(m, ring) < 3 ? dist(p, q) : 0); }, 0);
  assert.ok(onLine <= per * 0.1, 'the commons is inside, not on the lot line');
  const homesR = zr('sfr').map(z => z.ring); let pts = 0, by = 0; for (let k = 0; k < cz.ring.length; k++) { const p = cz.ring[k], q = cz.ring[(k + 1) % cz.ring.length], L0 = dist(p, q); for (let t = 0; t < L0; t += 20) { const m = [p[0] + (q[0] - p[0]) * t / L0, p[1] + (q[1] - p[1]) * t / L0]; pts++; if (homesR.some(r => toPoly(m, r) < 70)) by++; } }
  assert.ok(by >= pts * 0.7, 'homes round the commons: ' + by + ' of ' + pts);
  for (const n of ['Community center', 'Pool']) { const b = els.find(e => e.name === n); assert.ok(b && S.inRing([b.x, b.y], cz.ring), n + ' in the commons'); }
  // every way in reaches everything
  reach(plan, els, 'pods');
  const ins = els.filter(e => e.skel && e.kind === 'drive');
  for (const z of podsOf(o)) { const mine = els.filter(e => e.pod === z.pod && e.kind === 'drive'); assert.ok(mine.some(d => d.entry || d.podIn || ins.some(c => S.rectsOverlap({ poly: S.grow(S.outline(d), 1.5) }, { poly: S.outline(c) }, 0))), z.name + ': a drive off a collector or a way in'); }
  // the program
  const m = S.metrics({ ...plan }), units = u => els.filter(e => e.kind === 'building' && e.use === u).reduce((t, e) => t + (e.units || 0), 0);
  assert.ok(sf >= 60000 * 0.97, 'retail ' + Math.round(sf)); const ap = units('multifamily'); assert.ok(Math.abs(ap - 300) <= 15 || o.notes.some(t => /fits about/.test(t)), 'apartments ' + ap);
  const nh = units('sfr'); assert.ok(nh >= 600 * 0.97 || nh >= 600 * 0.8 && o.notes.includes('Single-family: fits about ' + nh.toLocaleString('en-US') + ' of 600 units.'), 'homes ' + nh); // (the fill zone: as many as fit round the lake, the shortfall said; the score weighs the walk and the ways in against the last few)
  assert.ok(m.spaces >= m.required, 'parked: ' + m.spaces + ' of ' + m.required);
  const ids = els.map(e => e.id); assert.equal(new Set(ids).size, ids.length, 'every piece its own id (each pod is laid out on its own)');
  // detention
  const need = S.stormNeed(S.ringArea(site.ring) / 43560, {}, S.normalizeProgram(o.program)).area; assert.ok(m.pond >= need * 0.9 || o.notes.some(t => /Ponds hold about/.test(t)), 'detention ' + Math.round(m.pond) + ' of ' + Math.round(need));
  // the checks, the ways in, the boulevard, the greenbelts, the names
  assert.deepEqual(check(plan, els), [], 'no problems');
  assert.ok(S.entrancesOf(els).length >= 3 || o.notes.some(t => /fire access/.test(t)), 'three ways in');
  const main = els.find(e => e.name === 'Main entry'); assert.ok(main?.blvd, 'the main entry a boulevard'); assert.ok(S.entryParts(plan, main).some(e => e.median) && els.some(e => e.kind === 'sign'), 'its median and a sign');
  for (const g of els.filter(e => e.belt)) assert.ok(S.shapeOf(g).every(p => S.inRing(p, ring) || toPoly(p, ring) < 1), 'greenbelts inside the lot');
  const lots = els.filter(e => e.kind === 'building' && e.use === 'sfr').map(e => e.name); assert.equal(new Set(lots).size, lots.length, 'Lot names unique across the plan');
  const B0 = els.filter(e => e.kind === 'building'); for (const d of els.filter(e => e.kind === 'plaza' && e.note === 'Driveway')) assert.ok(B0.some(b => S.gapBetween(S.shapeOf(b), S.shapeOf(d)) <= 4), 'a driveway with its home: ' + Math.round(d.x) + ',' + Math.round(d.y));
  for (const q of els.filter(e => e.kind === 'pond' && e.pod)) { const sh = S.shapeOf(q); assert.ok(!B0.some(b => S.gapBetween(S.shapeOf(b), sh) < 15), 'a pond in open space clear of the buildings'); } // (never wrapped round one)
  // the zones: one a pod, named; the parts
  assert.equal(podsOf(o).length, o.recipe.pods.list.length); const names = o.zones.map(z => z.name); assert.equal(new Set(names).size, names.length, 'zone names unique: ' + names);
  assert.ok(names.some(n => /Section 2/.test(n))); const parts = S.partsOf(plan); assert.equal(parts.length, 4); assert.ok(parts.every(p => p.ring?.length >= 3));
  const svg = G.planSVG(plan, { px: 900 }).svg; assert.ok(!/NaN/.test(svg) && /SECTION/.test(svg), 'the sheet draws it, sections labelled'); assert.ok(!/NaN/.test(S.toDXF(plan)), 'DXF');
  // the band layouts stay the same as before: a pinned bands run gives the same first band option
  const bands = L.layoutOptions({ ...site, params: { mixStyle: 'bands' } }, prog, { count: 3 }), b0 = out.find(x => !x.recipe?.pods);
  assert.ok(bands.every(x => !x.recipe?.pods), 'bands only when asked'); assert.ok(bands.some(x => x.name === b0.name && Math.abs(x.sizes.units - b0.sizes.units) < 1 && Math.abs(x.sizes.gfa - b0.sizes.gfa) < 1), 'the band option is the bands’ own'); }

// ---- 3. re-fit round a moved apartment building: only its pod is laid out again ----
{ const apz = plan.zones.find(z => z.use === 'multifamily'), c = S.centroid(apz.ring), moved = structuredClone(plan.elements), b = moved.filter(e => e.kind === 'building' && e.use === 'multifamily').sort((p, q) => dist([p.x, p.y], c) - dist([q.x, q.y], c))[0];
  const d = [c[0] - b.x, c[1] - b.y], l = Math.hypot(...d) || 1; S.moveBy(b, d[0] / l * 40, d[1] / l * 40); b.pinned = true;
  const r = L.refit({ ...plan, elements: moved }, { amount: 'current', keep: true }); assert.ok(r?.elements?.length, 'a re-fit');
  const sig = (es, id) => JSON.stringify(es.filter(e => e.pod === id && !e.pinned).map(e => [e.id, e.x, e.y, e.w, e.d]).sort());
  for (const z of podsOf(o)) if (z.pod !== apz.pod) assert.equal(sig(r.elements, z.pod), sig(plan.elements, z.pod), z.name + ' kept as it was');
  assert.notEqual(sig(r.elements, apz.pod), sig(plan.elements, apz.pod), 'the apartments laid out again'); const kept = r.elements.find(e => e.id === b.id); assert.ok(kept && Math.abs(kept.x - b.x) < 0.01, 'the moved building stays');
  assert.deepEqual(check(plan, r.elements).filter(t => !/Apt Bldg/.test(t) || !t.includes(b.name)), [], 'no new problems'); reach(plan, r.elements, 're-fit');
  assert.ok(!r.notes.some(t => /outside the lot/.test(t)), 'a pod’s outline isn’t a lot line: ' + r.notes.join(' | '));
  // nothing moved: nothing laid out again (the ways in added after the pods are part of the skeleton, not pieces placed by hand)
  const r0 = L.refit(structuredClone(plan), { amount: 'current', keep: true }), all = es => JSON.stringify(es.map(e => e.id).sort());
  assert.ok(!plan.elements.some(e => e.pinned), 'no piece of a new layout is pinned'); assert.equal(all(r0.elements), all(plan.elements), 'the same pieces'); }

// ---- 3b. a shop dragged into a pod of homes: it's theirs now (that pod is laid out round it, the retail's fills its gap) ----
{ const hz = plan.zones.filter(z => z.use === 'sfr').sort((a, b) => b.acres - a.acres)[0], rtz = plan.zones.find(z => z.use === 'retail'), m = structuredClone(plan.elements), b = m.find(e => e.kind === 'building' && e.use === 'retail'), c = S.labelPoint(hz.ring);
  S.moveBy(b, c[0] - b.x, c[1] - b.y); b.pinned = true;
  const r = L.refit({ ...plan, elements: m }, { amount: 'current', keep: true }), kb = r.elements.find(e => e.id === b.id); assert.equal(kb?.pod, hz.pod, 'the shop is in the homes’ pod now');
  assert.ok(r.elements.some(e => e.pod === rtz.pod && e.kind === 'building' && e.use === 'retail'), 'the retail laid out again'); reach(plan, r.elements, 'shop moved');
  const s = L.relayPods({ ...plan, elements: r.elements, zones: r.zones || plan.zones, recipe: r.recipe || plan.recipe }, [{ op: 'swap', a: rtz.pod, b: plan.zones.find(z => z.use === 'multifamily').pod }]); assert.ok(s.elements.some(e => e.id === b.id), 'a swap of the retail leaves the shop that moved out of it');
  assert.ok(!s.notes.some(t => /moved by hand/.test(t)), s.notes.join(' | ')); }

// ---- 4. re-lay a pod of homes; swap the apartments and the retail ----
{ const hz = plan.zones.filter(z => z.use === 'sfr').sort((a, b) => b.acres - a.acres)[0], n = (es, id) => es.filter(e => e.pod === id && e.kind === 'building').reduce((t, e) => t + (e.units || 1), 0);
  const r = L.relayPods(plan, [{ op: 'relay', pod: hz.pod }]); assert.ok(!r.error && r.elements.length, r.error);
  for (const z of podsOf(o)) if (z.pod !== hz.pod) assert.deepEqual(r.elements.filter(e => e.pod === z.pod && e.kind === 'building').map(e => e.id).sort(), plan.elements.filter(e => e.pod === z.pod && e.kind === 'building').map(e => e.id).sort(), z.name + ' untouched');
  assert.ok(Math.abs(n(r.elements, hz.pod) - n(plan.elements, hz.pod)) <= n(plan.elements, hz.pod) * 0.05, 'the homes again'); assert.deepEqual(check(plan, r.elements), []);
  const apz = plan.zones.find(z => z.use === 'multifamily'), rtz = plan.zones.find(z => z.use === 'retail'), s = L.relayPods(plan, [{ op: 'swap', a: apz.pod, b: rtz.pod }]);
  assert.ok(!s.error && s.elements.length, s.error); const shops = s.elements.filter(e => e.kind === 'building' && e.use === 'retail');
  assert.ok(shops.length && shops.every(e => S.inRing([e.x, e.y], apz.ring)), 'the retail in the apartments’ old pod'); assert.ok(s.zones.find(z => z.pod === apz.pod).use === 'retail');
  assert.ok(s.notes.some(t => /Retail isn’t at the corner any more/.test(t)), s.notes.join(' | ')); assert.deepEqual(check(plan, s.elements), []); reach(plan, s.elements, 'swap');
  assert.match(L.relayPods({ ...plan, recipe: { deep: false } }, [{ op: 'relay', pod: 'p1' }]).error, /Only a plan laid out in pods/);
  // a piece moved by hand (pinned): a re-lay of its pod goes round it; a swap lays that pod out clean and says so
  const m1 = structuredClone(plan.elements), h = m1.find(e => e.pod === hz.pod && e.kind === 'building' && e.use === 'sfr'); S.moveBy(h, 6, 0); h.pinned = true;
  const r1 = L.relayPods({ ...plan, elements: m1 }, [{ op: 'relay', pod: hz.pod }]); assert.ok(r1.elements.some(e => e.id === h.id && Math.abs(e.x - h.x) < 0.01), 'the moved home stays'); assert.deepEqual(check(plan, r1.elements), [], 'laid out round it');
  const m2 = structuredClone(plan.elements), ab = m2.find(e => e.pod === apz.pod && e.kind === 'building' && e.use === 'multifamily'); S.moveBy(ab, 6, 0); ab.pinned = true;
  const s2 = L.relayPods({ ...plan, elements: m2 }, [{ op: 'swap', a: apz.pod, b: rtz.pod }]); assert.ok(!s2.elements.some(e => e.id === ab.id), 'the apartment building goes with its pod'); assert.ok(s2.notes.some(t => /moved by hand/.test(t)), s2.notes.join(' | ')); assert.deepEqual(check(plan, s2.elements), []);
  // a pod given another use: the zone nobody holds any more leaves the program
  const u = L.relayPods(plan, [{ op: 'relay', pod: apz.pod, use: 'townhomes' }]); assert.ok(!u.error); assert.deepEqual(u.program.zones.map(z => z.use).sort(), ['amenity', 'retail', 'sfr', 'townhomes']); assert.ok(u.recipe.pods.list.every(p => u.program.zones[p.zone]?.use === p.use || p.use === 'pond'), 'pods by their zones'); }

// ---- 4b. a collector deleted, then a re-fit: the pods it served are joined to what's left, or left out with a note ----
{ const els1 = plan.elements.filter(e => !(e.coll && e.name === 'Loop road')), r = L.refit({ ...plan, elements: els1 }, { amount: 'current', keep: true }), n = es => es.filter(e => e.kind === 'building' && e.use === 'sfr').length;
  assert.ok(r?.elements?.length); reach(plan, r.elements, 'no loop road');
  for (const z of podsOf(o).filter(z => z.use === 'sfr')) { const a = plan.elements.filter(e => e.pod === z.pod && e.use === 'sfr').length, b = r.elements.filter(e => e.pod === z.pod && e.use === 'sfr').length; assert.ok(b >= a * 0.9 || r.notes.some(t => t.includes(z.name) || /homes? (?:was|were) left with no street/.test(t)), z.name + ': ' + a + ' → ' + b + ' homes, unsaid: ' + r.notes.join(' | ')); }
  assert.ok(n(r.elements) >= n(plan.elements) * 0.8 || r.notes.length, 'homes kept or said'); }

// ---- 4c. a collector moved by hand, then a re-fit: it's joined back, and nothing hung on it is lost ----
{ const m = structuredClone(plan.elements), lp = m.filter(e => e.coll && e.name === 'Loop road' && e.path).sort((a, b) => b.path.length - a.path.length || S.elArea(b) - S.elArea(a))[0], n = es => es.filter(e => e.kind === 'building' && e.use === 'sfr').length, pond = es => es.filter(e => e.kind === 'pond').reduce((t, e) => t + S.elArea(e), 0);
  S.moveBy(lp, 50, 0); lp.pinned = true; const r = L.refit({ ...plan, elements: m }, { amount: 'current' });
  assert.ok(n(r.elements) >= n(plan.elements) * 0.95, 'homes ' + n(plan.elements) + ' → ' + n(r.elements) + ': ' + r.notes.join(' | ')); assert.ok(pond(r.elements) >= pond(plan.elements) * 0.9, 'the lake kept: ' + Math.round(pond(r.elements)) + ' of ' + Math.round(pond(plan.elements)));
  assert.ok(r.elements.some(e => e.id === lp.id && Math.abs(e.x - lp.x) < 0.01), 'the road stays where it was put'); reach(plan, r.elements, 'loop road moved'); }

// ---- 5. Change With AI, read without the AI ----
{ const g = E.guessEdits('swap the apartments and the retail', plan), apz = plan.zones.find(z => z.use === 'multifamily'), rtz = plan.zones.find(z => z.use === 'retail');
  assert.deepEqual(g, [{ action: 'swap', target: 'pod:' + apz.pod, with: 'pod:' + rtz.pod }]);
  const a = E.applyEdits(plan, g); assert.deepEqual(a.pods, [{ op: 'swap', a: apz.pod, b: rtz.pod }]); assert.equal(a.elements.length, plan.elements.length, 'no piece moves by itself');
  assert.deepEqual(E.guessEdits('re-lay the apartments', plan), [{ action: 'relay', target: 'pod:' + apz.pod }]);
  const anyHome = plan.elements.find(e => e.use === 'sfr' && e.pod); assert.deepEqual(E.guessEdits('redo this pod', plan, anyHome.id), [{ action: 'relay', target: 'pod:' + anyHome.pod }]);
  const d = E.describePlan(plan); assert.equal(d.pods.length, podsOf(o).length); assert.ok(d.pods.every(p => /^pod:/.test(p.id) && p.faces.length), 'every pod with the streets it faces');
  assert.ok(d.pods.find(p => p.use === 'multifamily').faces.includes('FM 362'));
  assert.deepEqual(E.applyEdits({ ...plan, recipe: { deep: false } }, g).skipped.length, 1, 'no pods: said so');
  const nm = E.applyEdits(plan, [{ action: 'change', target: 'pod:' + apz.pod, name: 'The Flats' }]); assert.deepEqual(nm.pods, [], 'a pod renamed: nothing laid out again'); assert.equal(nm.zones.find(z => z.pod === apz.pod).name, 'The Flats');
  const rm = E.applyEdits(plan, [{ action: 'remove', target: 'pod:' + apz.pod }]); assert.deepEqual(rm.pods, []); assert.equal(rm.skipped.length, 1, 'a whole pod isn’t removed by a re-lay');
  const fl = E.applyEdits(plan, [{ action: 'change', target: 'pod:' + apz.pod, floors: 4 }]); assert.deepEqual(fl.pods, [{ op: 'relay', pod: apz.pod, floors: 4 }], 'a pod’s stories: laid out again at that height');
  const mv = E.applyEdits(plan, [{ action: 'move', target: 'pod:' + apz.pod, x: 100, y: 0 }]); assert.deepEqual(mv.pods, []); assert.equal(mv.skipped.length, 1, 'a pod isn’t laid out again for a move it doesn’t make');
  const f4 = L.relayPods(plan, fl.pods), ab = f4.elements.filter(e => e.pod === apz.pod && e.kind === 'building' && e.use === 'multifamily'); assert.ok(ab.length && ab.every(e => e.floors === 4), 'the apartments at 4 stories: ' + ab.map(e => e.floors)); }

// ---- 6. a new home mix: every pod of homes carries it; the re-fit lays them out again ----
{ const hm = E.withHomeMix(plan, [{ stories: 1, pct: 50 }, { stories: 2, pct: 50 }]), sfr = hm.recipe.pods.list.filter(p => p.use === 'sfr');
  assert.ok(sfr.length && sfr.every(p => JSON.stringify(p.prog.homeMix) === JSON.stringify(hm.mix)), 'each pod’s program carries it (a pod of homes lays out by its own program)'); assert.ok(hm.program.zones.find(z => z.use === 'sfr').homeMix, 'and the plan’s');
  const r = L.refit({ ...plan, program: hm.program, recipe: hm.recipe }, { keep: true }), n0 = plan.elements.filter(e => e.use === 'sfr').length, n1 = r.elements.filter(e => e.use === 'sfr').length;
  assert.ok(!r.elements.some(e => e.use === 'sfr' && e.floors === 3), 'no 3-story homes'); assert.ok(n1 >= n0 * 0.85, 'homes ' + n0 + ' → ' + n1); assert.deepEqual(check(plan, r.elements), []); }

// ---- 7. a second site: 101 acres, the east side a street ----
{ const N0 = S.unionParcels([mk([-95.96, 30.07], [[0, 0], [2600, 0], [2600, 1700], [0, 1700]])]), s1 = { ...N0, front: edge(N0, n => n[1] < -0.9), streets: [edge(N0, n => n[0] > 0.9)], setbacks: { ...S.SETBACKS } };
  const p1 = S.guessProgram('retail at the corner, 250 homes, a commons with a lake in the middle'), t1 = Date.now(), r1 = L.podsOnly(s1, p1), ms1 = Date.now() - t1;
  assert.ok(r1.length && ms1 < 25000, '101 ac pods: ' + ms1 + ' ms'); const q = r1[0], pq = { ...s1, program: q.program, elements: q.elements, zones: q.zones };
  assert.ok(P.hintsMet(pq, S.normalizeProgram(q.program), q.elements, q.zones).every(h => h.ok)); assert.deepEqual(check(s1, q.elements), []); reach(pq, q.elements, '101 ac'); }

// ---- 8. small sites stay as they were: bands only ----
{ const T0 = S.unionParcels([mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]])]), tr = { ...T0, front: edge(T0, n => n[0] < -0.9), setbacks: { ...S.SETBACKS } };
  const tp = S.guessProgram('37,700 sf retail with 2 pads, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units');
  assert.equal(L.wantPods(tr, S.normalizeProgram(tp)), false, '20 acres: no pods');
  const a = L.layoutOptions(tr, tp, { count: 3 }), b = L.layoutOptions({ ...tr, params: { mixStyle: 'bands' } }, tp, { count: 3 }), k = x => x.map(o => [o.name, o.sizes?.units, Math.round(o.sizes?.gfa || 0)]);
  assert.deepEqual(k(a), k(b), 'the same options as bands'); assert.ok(a.every(x => !x.recipe?.pods)); }

// ---- 9. the roads the words name; a corner with no side street ----
{ const sn = { ...site, streetNames: { [front]: 'FM 362', [west]: 'Bauer Road' } };
  assert.equal(P.roadEdge(sn, 'the road'), front, 'a bare "the road" is the front'); assert.equal(P.roadEdge(sn, 'street'), front); assert.equal(P.roadEdge(sn, 'bauer road'), west); assert.equal(P.roadEdge(sn, 'the side street'), west); assert.equal(P.roadEdge(sn, 'FM 362'), front);
  const R0 = S.unionParcels([mk([-95.6, 29.8], [[0, 0], [2000, 0], [2000, 2200], [0, 2200]])]), f0 = edge(R0, n => n[1] < -0.9), s0 = { ...R0, front: f0, streets: [], setbacks: { ...S.SETBACKS } }, a = R0.ring[f0], b = R0.ring[(f0 + 1) % R0.ring.length];
  const pg = S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 30000, place: { where: 'corner', side: 'left' } }, { use: 'sfr', units: 200 }] }), sq = c => [[c[0] - 200, c[1]], [c[0] + 200, c[1]], [c[0] + 200, c[1] + 300], [c[0] - 200, c[1] + 300]];
  const zs = c => [{ zone: 0, use: 'retail', ring: sq(c) }]; assert.ok(P.hintsMet(s0, pg, [], zs(a))[0].ok, 'the left front corner, no side street'); assert.ok(!P.hintsMet(s0, pg, [], zs(b))[0].ok, 'not the right one');
  const pa = S.normalizeProgram({ use: 'retail', zones: [{ use: 'multifamily', units: 200, place: { where: 'along', road: 'FM 362' } }, { use: 'sfr', units: 200 }] }); assert.equal(P.hintsMet(sn, pa, [], [{ zone: 0, use: 'multifamily', ring: sq([1500, 1500]) }])[0].text, 'Apartments aren’t along FM 362.');
  const s6 = { ...sn, streetNames: { [front]: 'Westheimer Road', [west]: 'Highway 6' } }; assert.equal(P.roadEdge(s6, S.guessProgram('200 apartments along Highway 6 and 300 homes').zones.find(z => z.use === 'multifamily').place.road), west, '"along Highway 6": that road by its number'); }

// ---- 10. a small mixed site the zones-from-the-street layouts can't fit: pods, everything reached ----
{ const B1 = S.unionParcels([mk([-95.62, 29.82], [[0, 0], [1300, 0], [1300, 1000], [0, 1000]])]), s1 = { ...B1, front: edge(B1, n => n[1] < -0.9), setbacks: { ...S.SETBACKS } }, p1 = S.guessProgram('200 apartments along the highway and 80 homes');
  const t1 = Date.now(), r1 = L.layoutOptions(s1, p1, { count: 3 }), q = r1[0]; console.log('30 ac: ' + (Date.now() - t1) + ' ms: ' + r1.map(x => x.name + ' ' + x.sizes?.units).join(' | '));
  assert.ok(q.recipe?.pods, 'pods first'); const m = S.metrics({ ...s1, elements: q.elements, program: q.program }); assert.ok(m.units >= 200, 'units ' + m.units); reach({ ...s1 }, q.elements, '30 ac'); assert.deepEqual(check(s1, q.elements), []); }

// ---- 11. today's mixed sites, no placement asked: a pods layout goes first only when it keeps the program ----
{ const R6 = S.unionParcels([mk([-95.60, 29.80], [[0, 0], [1900, 0], [1900, 1375], [0, 1375]])]), s6 = { ...R6, front: edge(R6, n => n[1] < -0.9), streets: [], setbacks: { ...S.SETBACKS } }, p6 = S.normalizeProgram({ use: 'mixed', zones: [{ use: 'retail', gfa: 40000 }, { use: 'sfr', units: 180 }, { use: 'amenity', items: ['lake', 'center', 'pool', 'playground'] }] });
  const r6 = L.layoutOptions(s6, p6, { count: 3 }), got = x => p6.zones.map(z => x.elements.filter(e => e.kind === 'building' && e.use === z.use).reduce((t, e) => t + (z.units ? e.units || 0 : S.gfaOf(e)), 0)), b6 = r6.find(x => !x.recipe?.pods);
  assert.ok(b6, 'a band layout offered'); if (r6[0].recipe?.pods) { const g = got(r6[0]), h = got(b6), t = i => p6.zones[i].gfa || p6.zones[i].units || 1e9; assert.ok(g.every((v, i) => p6.zones[i].use === 'amenity' || Math.min(v, t(i)) >= Math.min(h[i], t(i)) * 0.97), 'pods first only keeping the program (up to what was asked): ' + g + ' vs ' + h); }
  // a use nothing of which lays out isn't offered
  const p7 = S.guessProgram('25,000 sf retail, 180 apartments and 150 homes'), r7 = L.podsOnly(s6, p7, { podKinds: ['spine'] }); for (const x of r7) assert.ok(x.elements.some(e => e.kind === 'building' && e.use === 'retail'), x.name + ': its retail'); }

console.log('pods ok');
