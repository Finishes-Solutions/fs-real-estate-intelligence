// Offline tests for subdivision streets (lib/streetnet.mjs, NEIGHBORHOOD-PLAN.md phase 4a) on realistic sites: the
// 246-acre Waller tract (a clipped corner at the back), an irregular 144-acre parcel turned 17°, a narrow deep 50-acre
// tract and the 110-acre pentagon (alone and with a commons). Every network layout must reach every drive and home from
// a way in (its own ways in: none added after across its lots), keep every lot clear of the streets and the other lots
// with its home on it, keep its streets clear of each other and its blocks and cul-de-sacs within the rules, curve, hold
// its detention (or say how much it's short), stay near today's homes and within its time; a count asked for (only the
// streets its homes need), re-fits (unchanged, a home moved, Re-fit Plan, a park added beside or on a street, streets
// and the main entry deleted, a street bent, a loop street broken and re-fitted twice), a new home mix, pods of a mixed
// plan and the rules on a hand-made plan keep working on it. Slow (several minutes): the big sites are laid out in full.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), N = await import('../lib/streetnet.mjs'), E = await import('../lib/siteedit.mjs'), G = await import('../lib/sitesheet.mjs'), P = await import('../lib/sitepods.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const edge = (b, f) => b.ring.findIndex((p, i) => f(S.outwardOf(b.ring, i)));
const a17 = 17 * Math.PI / 180, turn = ([x, y]) => [x * Math.cos(a17) - y * Math.sin(a17), x * Math.sin(a17) + y * Math.cos(a17)];
const W0 = S.unionParcels([mk([-95.93, 30.06], [[0, 0], [3400, 0], [3400, 2400], [2300, 3300], [0, 3300]])]), waller = { ...W0, front: edge(W0, n => n[1] < -0.9), setbacks: { ...S.SETBACKS } };
const I0 = S.unionParcels([mk([-96.01, 30.02], [[0, 0], [2900, 0], [3100, 900], [2600, 2100], [1300, 2300], [200, 1900], [-150, 900]].map(turn))]), irregular = { ...I0, front: edge(I0, n => S.rotPt(n, -17)[1] < -0.9), setbacks: { ...S.SETBACKS } };
const N0 = S.unionParcels([mk([-95.80, 29.95], [[0, 0], [660, 0], [700, 3200], [20, 3250]])]), narrow = { ...N0, front: edge(N0, n => n[1] < -0.9), setbacks: { ...S.SETBACKS } };
const P0 = S.unionParcels([mk([-95.97, 30.07], [[-610, 0], [1933, 0], [2594, 865], [2391, 1780], [0, 1780]])]), pentagon = { ...P0, front: edge(P0, n => n[1] < -0.9), setbacks: { ...S.SETBACKS } };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), ccw = r => S.signedArea(r) >= 0 ? r : r.slice().reverse();
const box = s => { const xs = s.map(p => p[0]), ys = s.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }, meet = (a, b, g = 2) => a[0] <= b[2] + g && b[0] <= a[2] + g && a[1] <= b[3] + g && b[1] <= a[3] + g;
const homes = els => els.filter(e => e.kind === 'building' && e.use === 'sfr');
// the network from every way in (or those `from` picks): drives that touch (1.5 ft each side)
function reachedAll(els, from = null) {
  const D = els.filter(e => e.kind === 'drive' || e.kind === 'truck'), G0 = D.map(e => e.poly ? { ...e, poly: S.grow(e.poly, 1.5) } : e.path ? { ...e, width: (e.width || 26) + 3 } : { ...e, w: e.w + 3, d: e.d + 3 }), B = G0.map(g => box(S.shapeOf(g)));
  const seen = new Set(S.entrancesOf(els).filter(e => !from || from(e)).map(e => e.id)), st = D.filter(e => seen.has(e.id));
  while (st.length) { const e = st.pop(), i = D.indexOf(e); D.forEach((f, j) => { if (!seen.has(f.id) && meet(B[i], B[j]) && S.rectsOverlap(G0[i], G0[j], 0)) { seen.add(f.id); st.push(f); } }); }
  return { seen, D };
}
// homes more than 60 ft from a reached street
const offStreet = (els, R) => { const near = R.D.filter(d => R.seen.has(d.id)).map(d => ({ q: S.shapeOf(d), b: box(S.shapeOf(d)) })); return homes(els).filter(h => !near.some(r => h.x > r.b[0] - 120 && h.x < r.b[2] + 120 && h.y > r.b[1] - 120 && h.y < r.b[3] + 120 && S.gapBetween(S.shapeOf(h), r.q) <= 60)).map(h => h.name); };
// lots over a street, lots over each other, homes off their lot (a grid of lots: a big neighbourhood has a thousand)
function lotIssues(els) {
  const D = els.filter(e => e.kind === 'drive').map(e => { const q = S.shapeOf(e); return { q, b: box(q) }; }), Lt = els.filter(e => e.kind === 'lot').map(l => { const q = ccw(S.shapeOf(l)), g = S.grow(q, -1); return { l, q, g, b: box(q) }; }), out = [];
  const GL = S.gridIndex(Lt, x => x.b, 200), GD = S.gridIndex(D, x => x.b, 200);
  for (const x of Lt) { for (const d of GD.near(...x.b)) if (meet(x.b, d.b, 0) && S.rectsOverlap({ poly: x.g }, { poly: d.q }, 0)) { out.push('lot on a street ' + x.l.name); break; }
    for (const y of GL.near(...x.b)) if (y !== x && meet(x.b, y.b, 0) && S.rectsOverlap({ poly: x.g }, { poly: y.g }, 0)) { out.push('lots overlap'); break; } }
  for (const h of homes(els)) { const c = S.corners(h); if (![...GL.near(h.x - 1, h.y - 1, h.x + 1, h.y + 1)].some(x => c.every(q => S.inRing(q, x.q)))) out.push('home off its lot ' + h.name); }
  return out;
}
const curvedShare = els => { const st = els.filter(e => e.kind === 'drive' && e.net && e.path && /^Street ·/.test(e.note || '')), len = P => P.reduce((t, q, i) => i ? t + dist(q, P[i - 1]) : 0, 0), all = st.reduce((t, e) => t + len(e.path), 0); return all ? st.reduce((t, e) => t + (N.isCurved(e.path) ? len(e.path) : 0), 0) / all : 0; };
const nan = v => /NaN/.test(v), draws = (plan, what) => assert.ok(!nan(G.planSVG(plan, { px: 600 }).svg) && !nan(S.toDXF(plan)), what + ': the sheet and DXF draw');
// everything a network layout must hold to
function checkNet(site, o, what, opt = {}) {
  const els = o.elements, plan = { ...site, elements: els, program: o.program, recipe: o.recipe }, ac = S.ringArea(site.ring) / 43560;
  assert.deepEqual(S.check(plan).filter(i => i.level === 'bad').map(i => i.text), [], what + ': no bad check');
  assert.deepEqual(lotIssues(els), [], what + ': lots clear of the streets and each other, homes on their lots');
  const R = reachedAll(els); assert.deepEqual(R.D.filter(d => !R.seen.has(d.id)).map(d => d.name || d.note), [], what + ': every drive reached from a way in'); assert.deepEqual(offStreet(els, R), [], what + ': every home on a reached street');
  const H = homes(els), lots = els.filter(e => e.kind === 'lot'); assert.equal(lots.length, H.length, what + ': a home on every lot'); for (const l of lots) assert.ok(H.some(h => S.inRing([h.x, h.y], S.shapeOf(l))), what + ': lot ' + l.name + ' holds a home');
  assert.deepEqual(N.clashes(els), [], what + ': no street runs into another or into itself');
  assert.deepEqual(N.netRules(plan).map(i => i.text).filter(t => !opt.phase || !/^A block on /.test(t)), [], what + ': within the street rules'); // (a first phase: its collectors run on past land for later, their cross streets come with it)
  const main = els.find(e => e.kind === 'drive' && e.name === 'Main entry'); assert.ok(main, what + ': a main entry');
  if (!opt.pod) { assert.ok(main.blvd, what + ': the main entry a boulevard'); assert.ok(S.entryParts(plan, main).some(e => e.median) && S.entryParts(plan, main).some(e => e.kind === 'sign'), what + ': its median and sign'); }
  const clear = (o.recipe.net.streets || []).filter(s => s.entryClear).map(s => s.id), mouth = o.recipe.net.entryAt; if (mouth) for (const l of lots.filter(l => clear.includes(l.on))) assert.ok(dist(S.shapeOf(l)[0], mouth) >= 300 - 1, what + ': no lot fronting the entry street within 300 ft of the street');
  const need = S.stormNeed(ac, {}, o.program, ac).area, m = S.metrics(plan); if (!opt.pod && need > 0) assert.ok(m.pond >= need * 0.9 || o.notes.some(t => /holds about \d+%/.test(t)), what + ': detention ' + Math.round(m.pond) + ' of ' + Math.round(need));
  if (opt.draw !== false) draws(plan, what);
  return { H: H.length, plan };
}

// ---- 1. each site, default settings: subdivision streets ranked with today's, timed against today's ----
const runs = {};
for (const [name, site] of [['Waller', waller], ['irregular', irregular], ['narrow', narrow], ['pentagon', pentagon]]) {
  const tw = Date.now(), wave = L.layoutOptions({ ...site, params: { streets: 'wave' } }, { use: 'sfr' }, { count: 3 }), msW = Date.now() - tw;
  const t0 = Date.now(), out = L.layoutOptions(site, { use: 'sfr' }, { count: 3 }), ms = Date.now() - t0, st = L.netStats, best = Math.max(...wave.map(o => homes(o.elements).length)), first = homes(out[0].elements).length;
  console.log(name + ': today ' + msW + ' ms, ' + wave.map(o => homes(o.elements).length).join('/') + ' homes; with networks ' + ms + ' ms (network ' + st.ms + ' of ' + Math.round(st.budget) + ' ms, ' + st.evaluated + ' laid out): ' + out.map(o => (o.style || 'rows') + ' ' + homes(o.elements).length).join(', '));
  const nets = out.filter(o => o.style === 'net'); assert.ok(nets.length, name + ': a network layout');
  assert.ok(first >= best * 0.9, name + ': the first layout holds ' + first + ' homes, today’s best ' + best);
  for (const o of nets) {
    const r = checkNet(site, o, name + ' ' + o.name, { draw: false }), plan = r.plan, J = N.netRules(plan).filter(i => /crossroads/.test(i.text)).length; assert.ok(J <= Math.max(1, S.ringArea(site.ring) / 43560 / 100), name + ': no crossroads grid');
  }
  // it reads as a subdivision: among the network layouts offered, one with cul-de-sacs whose local streets mostly curve (the
  // first may be the concentric one, straight along the long sides, when it holds more homes)
  if (name === 'Waller' || name === 'irregular') { const sub = nets.find(o => o.elements.some(e => e.bulb) && curvedShare(o.elements) >= 0.7); assert.ok(sub, name + ': a network with cul-de-sacs and curving streets: ' + nets.map(o => o.elements.filter(e => e.bulb).length + ' bulbs, ' + Math.round(curvedShare(o.elements) * 100) + '% curved').join('; ')); assert.ok(homes(sub.elements).length >= best * 0.9, name + ': it holds ' + homes(sub.elements).length + ' homes, today’s best ' + best); }
  assert.ok(ms <= msW + st.budget * 1.3 + 3000, name + ': the whole call ' + ms + ' ms, today ' + msW + ' + the network budget');
  assert.ok(st.ms <= st.budget * 1.3 + 1500, name + ': the network search ' + st.ms + ' of ' + Math.round(st.budget) + ' ms');
  if (name !== 'narrow') assert.ok(st.kinds.length >= 2, name + ': more than one kind of network laid out in full: ' + st.kinds.join(', '));
  runs[name] = { site, out, nets, wave };
}

// (drawn after the timings: a DXF of a big neighbourhood leaves the next layouts in the same process slower for a while)
for (const r of Object.values(runs)) for (const o of r.nets) draws({ ...r.site, elements: o.elements, program: o.program, recipe: o.recipe }, o.name);

// ---- 2. each kind of skeleton ----
{ const kind = (site, prog, k) => { const os = L.netOnly(site, prog, { netKinds: [k], count: 1 }); assert.ok(os.length, k + ': a layout'); return os[0]; };
  const r = kind(irregular, { use: 'sfr' }, 'ring'); checkNet(irregular, r, 'ring'); assert.ok(r.elements.some(e => e.coll && e.name === 'Loop road'), 'ring: a loop road');
  const s = kind(narrow, { use: 'sfr' }, 'spine'); checkNet(narrow, s, 'spine'); assert.ok(s.elements.some(e => e.name === 'Main street'), 'spine: a main street');
  const c = kind(waller, { use: 'sfr' }, 'courts'); checkNet(waller, c, 'courts'); assert.ok(c.elements.filter(e => e.bulb).length >= 4, 'courts: cul-de-sacs');
  const prog = { use: 'mixed', zones: [{ use: 'sfr' }, { use: 'amenity', items: ['lake', 'center', 'pool', 'playground'] }] }, k = kind(pentagon, prog, 'core'); checkNet(pentagon, k, 'core');
  const loop = k.recipe.net.core, cc = k.elements.find(e => e.name === 'Community center'), lake = k.elements.find(e => e.kind === 'pond');
  assert.ok(cc && S.inRing([cc.x, cc.y], loop) && lake && S.inRing(S.centroid(S.shapeOf(lake)), loop), 'core: the community center and the lake inside the loop');
  const ring = S.grow(ccw(loop), 60), side = ring.filter((p, i) => i % 4 === 0), H = homes(k.elements); assert.ok(side.filter(p => H.some(h => dist([h.x, h.y], p) < 110)).length >= side.length * 0.7, 'core: homes round most of the loop');
  // a wedge-shaped parcel: the loop goes where it fits (the box round it wouldn't)
  const T0 = S.unionParcels([mk([-95.88, 30.04], [[0, 0], [3600, 0], [1400, 2300]])]), wedge = { ...T0, front: edge(T0, n => n[1] < -0.9), setbacks: { ...S.SETBACKS } }, kw = L.netOnly(wedge, prog, { netKinds: ['core'], count: 1, netBudgetMs: 3000 });
  assert.ok(kw.length, 'core: a loop round the commons on a wedge-shaped parcel too'); checkNet(wedge, kw[0], 'core on a wedge', { draw: false });
  // the same through New Layouts: a network's ways in are its own (none added after across its lots), and a re-fit of it
  // changes nothing
  const all = L.layoutOptions(pentagon, prog, { count: 3 }), nets = all.filter(o => o.style === 'net'); assert.ok(nets.length, 'commons: a network layout among the options');
  for (const o of nets) { checkNet(pentagon, o, 'commons ' + o.name, { draw: false }); const ways = S.entrancesOf(o.elements); assert.equal(ways.length, 1 + o.recipe.net.ways.length, 'commons: every way in is the network’s own');
    const plan = { ...pentagon, program: o.program, elements: o.elements, recipe: o.recipe }, r = L.refit(structuredClone(plan), { amount: 'current' }); assert.equal(homes(r.elements).length, homes(o.elements).length, 'commons: an unchanged re-fit keeps every home'); } }

// ---- 3. a count asked for: that many homes nearest the entry, the rest land for later ----
{ const o = L.netOnly(waller, { use: 'sfr', units: 300 }, { count: 1, netBudgetMs: 25000 })[0], n = homes(o.elements).length; // (time for every kind: the clock alone mustn't decide which first phase is checked)
  assert.ok(Math.abs(n - 300) <= 3, '300 homes asked: ' + n); checkNet(waller, o, '300 homes', { phase: true });
  assert.ok(o.elements.some(e => e.future && e.name === 'Future development') || o.notes.some(t => /future phase/.test(t)), 'the rest is land for a later phase');
  // (one network: every home and every way in reached from the main entry; a street with no homes on it is built only when
  // something needs it, so without it some homes, or a way in, would be cut off)
  const on = new Set(o.elements.filter(e => e.kind === 'lot').map(e => e.on)), needs = els => { const R = reachedAll(els, e => e.name === 'Main entry'); return !offStreet(els, R).length && S.entrancesOf(els).every(w => R.seen.has(w.id)); };
  assert.ok(needs(o.elements), 'every home and way in reached from the main entry');
  for (const s of o.recipe.net.streets.filter(s => !s.pseudo)) { const d = o.recipe.net.discs.filter(x => x.of === s.id).map(x => x.id); if (on.has(s.id) || d.some(x => on.has(x))) continue;
    assert.ok(!needs(o.elements.filter(e => !(e.kind === 'drive' && (e.net === s.id || d.includes(e.net))))), 'a street with no homes on it (' + (s.name || s.role) + ') joins others'); } }

// ---- 4. re-fits of the best Waller network ----
const best = runs.Waller.nets[0], base = { ...waller, program: best.program, elements: best.elements, recipe: best.recipe };
const streets = els => JSON.stringify(els.filter(e => e.kind === 'drive' && e.net).map(e => e.path || e.poly).map(p => JSON.stringify(p)).sort());
{ const r = L.refit(structuredClone(base), { amount: 'current' }), h0 = homes(base.elements), h1 = homes(r.elements), ids = new Set(base.elements.map(e => e.id));
  assert.equal(streets(r.elements), streets(base.elements), 'an unchanged re-fit keeps every street'); assert.equal(h1.length, h0.length, 'and every home');
  assert.deepEqual(r.elements.filter(e => !ids.has(e.id)).map(e => e.kind + ' ' + (e.name || '')), [], 'and every piece, by its id (nothing new: no playground)');
  const at = new Set(h0.map(h => Math.round(h.x * 2) + ',' + Math.round(h.y * 2))); assert.ok(h1.every(h => at.has(Math.round(h.x * 2) + ',' + Math.round(h.y * 2)) || h0.some(g => dist([g.x, g.y], [h.x, h.y]) <= 0.5)), 'in the same places'); }
{ const els = structuredClone(base.elements), h = homes(els)[40]; S.moveBy(h, 30, 0); h.pinned = true;
  const r = L.refit({ ...base, elements: els }, { amount: 'current' }), k = r.elements.find(e => e.id === h.id);
  assert.equal(streets(r.elements), streets(base.elements), 'a home moved: the streets stay'); assert.ok(k && k.x === h.x && k.y === h.y, 'the moved home stays where it was put');
  assert.deepEqual(lotIssues(r.elements.filter(e => e.id !== h.id)), [], 'the lots round it clear'); assert.deepEqual(S.check({ ...base, elements: r.elements }).filter(i => i.level === 'bad').map(i => i.text), [], 'no bad check');
  assert.ok(homes(r.elements).length >= homes(base.elements).length - 3, 'homes ' + homes(r.elements).length + ' of ' + homes(base.elements).length);
  // Re-fit Plan (no amount): the subdivision's own streets again, never a fresh layout of parallel streets round the pin
  const t0 = Date.now(), p = L.refit({ ...base, elements: structuredClone(els) }); assert.ok(!p.fresh && p.recipe?.net, 'Re-fit Plan keeps the subdivision'); assert.equal(streets(p.elements), streets(base.elements), 'and its streets');
  assert.ok(Date.now() - t0 < 20000, 'Re-fit Plan in ' + (Date.now() - t0) + ' ms'); }
{ // homes deleted (their lots left, as the Delete key leaves them): their places stay empty and every other home stays
  // where it was (the count isn't made up from the far end of the march); a second re-fit agrees; Change With AI's remove too
  const H = homes(base.elements), h0 = H[Math.floor(H.length / 2)], gone = new Set(H.filter(h => dist([h.x, h.y], [h0.x, h0.y]) < 160).slice(0, 5)), at = (els, h) => homes(els).some(g => dist([g.x, g.y], [h.x, h.y]) < 0.5);
  const r = L.refit({ ...base, elements: structuredClone(base.elements.filter(e => !gone.has(e))) }, { amount: 'current' });
  assert.deepEqual([...gone].filter(h => at(r.elements, h)).map(h => h.name), [], 'homes deleted: not put back'); assert.deepEqual(H.filter(h => !gone.has(h) && !at(r.elements, h)).map(h => h.name), [], 'homes deleted: every other home stays');
  assert.equal(r.elements.filter(e => e.kind === 'lot' && e.vacant).length, gone.size, 'homes deleted: their lots left vacant'); assert.deepEqual(lotIssues(r.elements), [], 'homes deleted: the lots clear');
  const r2 = L.refit({ ...base, elements: r.elements, recipe: r.recipe }, { amount: 'current' }); assert.equal(homes(r2.elements).length, homes(r.elements).length, 'homes deleted: a second re-fit keeps their places empty');
  const ed = E.applyEdits(base, [{ action: 'remove', target: H[300].id }]), r3 = L.refit({ ...base, elements: ed.elements }, { amount: 'current', keep: true });
  assert.ok(!at(r3.elements, H[300]) && homes(r3.elements).length === H.length - 1, 'a home Change With AI removed stays removed: ' + homes(r3.elements).length + ' of ' + H.length); }
{ // a park dropped on the homes (as Add › Park, or the AI's add of a green, leaves it: pinned where it was put)
  const H = homes(base.elements), mid = H.reduce((m, h) => [m[0] + h.x / H.length, m[1] + h.y / H.length], [0, 0]), at = H.slice().sort((a, b) => dist([a.x, a.y], mid) - dist([b.x, b.y], mid))[0];
  const pk = { id: 'park1', kind: 'green', name: 'Park', x: at.x, y: at.y, w: 60, d: 60, rot: 0, pinned: true }, q = { elements: base.elements.concat(pk) };
  const r = L.refit({ ...base, elements: q.elements }, { keep: true }), p2 = r.elements.find(e => e.id === pk.id);
  assert.equal(streets(r.elements), streets(base.elements), 'a park added: the streets stay'); assert.ok(p2, 'the park stays');
  assert.ok(!r.elements.some(e => (e.kind === 'lot' || e.kind === 'building') && S.rectsOverlap({ poly: S.grow(ccw(S.shapeOf(e)), -1) }, { poly: S.shapeOf(p2) }, 0)), 'no lot or home under the park');
  assert.ok(!r.elements.some(e => e.kind === 'drive' && S.rectsOverlap(e, p2)), 'the park clear of the streets'); }
{ // a park dropped on a street: the street cut back clear of it, a cul-de-sac either side, every lot and home still reached
  const st = base.elements.filter(e => e.kind === 'drive' && e.net && e.path && /^Street/.test(e.note) && e.path.length > 40).sort((a, b) => b.path.length - a.path.length)[0], c = st.path[Math.floor(st.path.length / 2)];
  const pk = { id: 'park2', kind: 'green', name: 'Pocket park', x: c[0], y: c[1], w: 240, d: 160, rot: 0, pinned: true }, r = L.refit({ ...base, elements: base.elements.concat(pk) }, { keep: true }), p2 = r.elements.find(e => e.id === pk.id), plan = { ...base, elements: r.elements };
  assert.ok(p2 && !r.elements.some(e => e.kind === 'drive' && S.rectsOverlap({ poly: S.grow(ccw(S.shapeOf(e)), -1) }, { poly: S.shapeOf(p2) }, 0)), 'a park on a street: the street stops short of it');
  assert.deepEqual(S.check(plan).filter(i => i.level === 'bad').map(i => i.text), [], 'a park on a street: no bad check'); assert.deepEqual(lotIssues(r.elements), [], 'a park on a street: the lots clear');
  assert.ok(r.elements.filter(e => e.bulb).length > base.elements.filter(e => e.bulb).length, 'a park on a street: cul-de-sacs either side'); assert.ok(r.notes.some(t => /stops short/.test(t)), 'a park on a street: the notes say so'); }
{ // the main entry deleted: another way in takes its place
  const els = base.elements.filter(e => !(e.kind === 'drive' && e.name === 'Main entry')), r = L.refit({ ...base, elements: structuredClone(els) }, { amount: 'current' });
  assert.equal(r.elements.filter(e => e.kind === 'drive' && e.name === 'Main entry').length, 1, 'the main entry deleted: another is the main entry now'); assert.ok(r.notes.some(t => /main entry now/.test(t)), 'and the notes say so');
  const R = reachedAll(r.elements); assert.deepEqual(offStreet(r.elements, R), [], 'every home still on a reached street'); }
{ const els = structuredClone(base.elements), st = els.filter(e => e.kind === 'drive' && e.net && e.path && /^Street/.test(e.note) && e.path.length > 20).sort((a, b) => b.path.length - a.path.length)[0], m = Math.floor(st.path.length / 2), was = st.path.map(p => p.slice());
  const P = st.path, k = 12, t = [P[m + 1][0] - P[m - 1][0], P[m + 1][1] - P[m - 1][1]], L0 = Math.hypot(...t), n = [-t[1] / L0, t[0] / L0]; for (let i = m - k; i <= m + k; i++) { const f = 40 * (1 - Math.abs(i - m) / (k + 1)); P[i] = [P[i][0] + n[0] * f, P[i][1] + n[1] * f]; } st.pinned = true;
  const r = L.refit({ ...base, elements: els }, { amount: 'current' }); assert.deepEqual(lotIssues(r.elements), [], 'a street bent by hand: its lots re-flow, clear');
  const near = q => was.some(p => dist(p, q) < 300), a0 = homes(base.elements).filter(h => !near([h.x, h.y])), a1 = homes(r.elements).filter(h => !near([h.x, h.y])), key = h => Math.round(h.x) + ',' + Math.round(h.y), s1 = new Set(a1.map(key));
  assert.ok(a0.filter(h => !s1.has(key(h))).length <= a0.length * 0.02, 'homes away from it stay: ' + a0.filter(h => !s1.has(key(h))).length + ' of ' + a0.length + ' moved'); }

{ // streets deleted: their homes go, and so do those on streets left with no way in (the notes say so); nothing else breaks
  const ids = new Set(base.recipe.net.streets.filter(s => s.role === 'cross' || s.role === 'local' && !s.closed).slice(0, 6).map(s => s.id)), els = base.elements.filter(e => !(e.kind === 'drive' && ids.has(e.net)));
  const r = L.refit({ ...base, elements: structuredClone(els) }, { amount: 'current' }), R = reachedAll(r.elements);
  assert.deepEqual(offStreet(r.elements, R), [], 'streets deleted: every home left on a reached street'); assert.deepEqual(lotIssues(r.elements), [], 'streets deleted: the lots clear');
  assert.ok(homes(r.elements).length < homes(base.elements).length, 'streets deleted: their homes go');
  assert.deepEqual(r.elements.filter(e => e.bulb && !R.seen.has(e.id)).map(e => e.note), [], 'streets deleted: no cul-de-sac left without its street'); }
{ // pieces of a loop street deleted (it's drawn in pieces between its junctions): re-fit twice, and the second changes nothing
  const o = runs.irregular.nets[0], plan = { ...irregular, program: o.program, elements: structuredClone(o.elements), recipe: structuredClone(o.recipe) }, cl = o.recipe.net.streets.filter(s => s.closed && s.role === 'local').map(s => ({ s, d: plan.elements.filter(e => e.net === s.id) })).sort((a, b) => b.d.length - a.d.length)[0];
  if (cl?.d.length >= 5) { const gone = new Set([cl.d[1].id, cl.d[4].id]); plan.elements = plan.elements.filter(e => !gone.has(e.id));
    const r1 = L.refit(plan, { amount: 'current' }), r2 = L.refit({ ...plan, elements: r1.elements, recipe: r1.recipe }, { amount: 'current' });
    assert.equal(homes(r2.elements).length, homes(r1.elements).length, 'a second re-fit keeps every home: ' + homes(r2.elements).length + ' of ' + homes(r1.elements).length); assert.equal(streets(r2.elements), streets(r1.elements), 'and every street');
    for (const s of r1.recipe.net.streets.filter(s => String(s.id).startsWith(cl.s.id + '.'))) assert.ok(r1.elements.some(e => e.kind === 'drive' && e.net === s.id), 'a piece of the loop street carries its own id'); } else console.log('(no loop street drawn in five pieces on the irregular site)'); }

// ---- 5. a new home mix: the same streets, the homes laid along them again ----
{ const hm = E.withHomeMix(base, [{ stories: 1, pct: 50 }, { stories: 2, pct: 50 }]); assert.deepEqual(hm.recipe.net.mix, [{ stories: 1, pct: 50 }, { stories: 2, pct: 50 }]); assert.deepEqual(hm.program.homeMix, hm.mix);
  const r = L.refit({ ...base, program: hm.program, recipe: hm.recipe }, { amount: 'current', keep: true }), H = homes(r.elements);
  assert.ok(!H.some(h => h.floors === 3), 'no 3-story homes'); assert.ok(H.length >= homes(base.elements).length * 0.85, H.length + ' homes of ' + homes(base.elements).length); assert.equal(streets(r.elements), streets(base.elements), 'the streets stay'); }

// ---- 6. homes pods of a mixed plan: their streets meet the collectors, each pod's lots clear; a re-fit re-lays only its pod ----
{ const W = S.unionParcels([mk([-95.93, 30.06], [[0, 0], [3400, 0], [3400, 2400], [2300, 3300], [0, 3300]])]), front = edge(W, n => n[1] < -0.9), west = edge(W, n => n[0] < -0.9);
  const site = { ...W, front, streets: [west], setbacks: { ...S.SETBACKS }, streetNames: { [front]: 'FM 362', [west]: 'Bauer Road' } };
  const ASK = '60,000 sf retail with 2 pads at the corner of FM 362 and Bauer Road, 300 apartments along FM 362, about 600 homes around a lake, and a commons with a community center, pool and playground';
  const t0 = Date.now(), os = L.podsOnly(site, S.guessProgram(ASK), {}), ms = Date.now() - t0, o = os[0]; assert.ok(o, 'a pods plan');
  console.log('pods: ' + ms + ' ms, ' + homes(o.elements).length + ' homes; pods with subdivision streets: ' + (o.recipe.pods.list.filter(p => p.recipe?.net).length));
  const own = new Set(o.recipe.pods.list.filter(p => p.recipe?.net).map(p => p.id)), mine = els => els.filter(e => own.has(e.pod)), today = t => !/^home off its lot/.test(t); // (today's straight pods leave a home turned on a bend a foot off its lot: as before)
  assert.deepEqual(lotIssues(o.elements).filter(today), [], 'pods: lots clear'); assert.deepEqual(lotIssues(mine(o.elements)), [], 'pods: the subdivision pods’ lots and homes clear'); assert.deepEqual(S.check({ ...site, elements: o.elements }).filter(i => i.level === 'bad').map(i => i.text), [], 'pods: no bad check');
  const R = reachedAll(o.elements); assert.deepEqual(offStreet(o.elements, R), [], 'pods: every home on a reached street'); assert.ok(!o.elements.some(e => e.stub), 'pods: a pod’s streets that meet the collector are its ways in (no stub left)');
  const plan = { ...site, program: o.program, elements: o.elements, zones: o.zones, recipe: o.recipe }, hz = o.zones.find(z => z.use === 'sfr' && z.pod), h = o.elements.find(e => e.kind === 'building' && e.use === 'sfr' && e.pod === hz.pod);
  const els = structuredClone(o.elements), hh = els.find(e => e.id === h.id); S.moveBy(hh, 25, 0); hh.pinned = true;
  const r = L.refit({ ...plan, elements: els }, { amount: 'current', keep: true }), same = e => r.elements.some(x => x.id === e.id && x.x === e.x && x.y === e.y);
  assert.ok(o.elements.filter(e => e.pod && e.pod !== hz.pod && e.kind === 'building').every(same), 'the other pods stay as they were'); assert.deepEqual(lotIssues(r.elements.filter(e => e.id !== h.id)).filter(today), [], 'the re-laid pod’s lots clear'); }

// ---- 7. the rules on a hand-made plan ----
{ const site = { ring: [[-2000, -1000], [2000, -1000], [2000, 1000], [-2000, 1000]], front: 0, setbacks: { ...S.SETBACKS } }, st = (id, path, extra = {}) => ({ id, kind: 'drive', path, width: 28, r: 0, name: id, note: 'Street · 28 ft', net: id, x: 0, y: 0, w: 1, d: 1, ...extra });
  const entry = { id: 'm', kind: 'drive', name: 'Main entry', entry: true, path: [[0, -1000], [0, -790]], width: 40, r: 0, x: 0, y: -900, w: 40, d: 210 };
  const long = { ...site, elements: [entry, st('A', [[-650, -800], [650, -800]]), st('B', [[-650, -786], [-650, 886]]), st('C', [[650, -786], [650, 886]]), st('D', [[-650, 900], [650, 900]])], recipe: { net: {} } };
  assert.deepEqual(N.netRules(long).map(i => i.text), ['A block on B runs 1,672 ft (longest 1,400 ft)', 'A block on C runs 1,672 ft (longest 1,400 ft)'], 'blocks of 1,672 ft on B and C: warned');
  const cul = { ...site, elements: [entry, st('A', [[-400, -800], [400, -800]]), st('B', [[150, -786], [150, 214]]), { id: 'b', kind: 'drive', poly: S.ringDisc([150, 214], 42, 32), bulb: true, net: 'b', note: 'Cul-de-sac · 84 ft', x: 150, y: 214, w: 84, d: 84 }] };
  assert.deepEqual(N.netRules(cul).map(i => i.text).filter(t => /cul-de-sac/.test(t)), ['A cul-de-sac runs 1042 ft (longest 800 ft)'], 'a 1,000 ft cul-de-sac: warned');
  const close = { ...site, elements: [entry, st('A', [[-900, -800], [900, -800]]), st('B', [[-300, -786], [-300, -100]]), st('C', [[-220, -786], [-220, -100]]), st('D', [[-300, -100], [-220, -100]])] };
  assert.ok(N.netRules(close).some(i => /meet A 80 ft apart/.test(i.text)), 'two T’s 80 ft apart: warned');
  assert.equal(N.streetRules({ params: { streetRules: { culMax: 600 } } }).culMax, 600); assert.equal(N.streetRules({ params: { streetRules: { culMax: 5, blockMax: 'x', bulbR: 900 } } }).culMax, 300, 'held to its range'); assert.equal(N.streetRules({ params: { streetRules: { blockMax: 'x' } } }).blockMax, 1400); assert.equal(N.streetRules({ params: { streetRules: { bulbR: 900 } } }).bulbR, 60); }

// ---- 8. today's styles unchanged; a small site has no network ----
{ for (const name of ['narrow', 'pentagon']) { const site = runs[name].site, a = runs[name].wave, b = L.layoutOptions({ ...site, params: { streets: 'wave' } }, { use: 'sfr' }, { count: 3, noNet: true });
    assert.deepEqual(a.map(o => [o.name, homes(o.elements).length, o.elements.filter(e => e.kind === 'drive').length]), b.map(o => [o.name, homes(o.elements).length, o.elements.filter(e => e.kind === 'drive').length]), name + ': waves as before'); }
  const fm = { ring: [[-290, -290], [290, -290], [290, 290], [-290, 290]], front: 0, setbacks: { ...S.SETBACKS } }; assert.equal(L.netWanted(fm, { use: 'sfr' }), false, 'under 8 acres: no network');
  assert.equal(L.netWanted({ ...waller, params: { streets: 'straight' } }, { use: 'sfr' }), false, 'straight asked: no network'); assert.equal(L.netWanted(waller, { use: 'sfr' }), true); }

// ---- 9. the AI's settings know the four styles; the words for a new street pattern (when the AI isn't there) ----
{ const acts = t => E.guessEdits(t, base).map(o => o.action);
  for (const t of ['make the curved streets wider', 'make the winding streets 32 ft wide', 'subdivision entry sign should say Oak Hollow', 'turn the pond 20 degrees in this subdivision', 'rotate the curved streets', 'no 3-story homes in the subdivision']) assert.ok(!acts(t).includes('streets'), t + ': not a new street pattern');
  for (const t of ['make it a subdivision', 'use curved streets', 'give it loops and cul-de-sacs', 'subdivision streets please']) assert.deepEqual(acts(t), ['streets'], t + ': a new street pattern');
  assert.deepEqual(E.guessEdits('turn the pond 20 degrees in this subdivision', base).map(o => o.turnBy), [20], 'the pond turned'); }
{ const API = await import('../api/siteplan.js'), txt = JSON.stringify(API); assert.ok(/'network'|"network"/.test(JSON.stringify(Object.values(API).filter(v => v && typeof v === 'object'))), 'network in the schemas');
  const walk = (o, f) => { if (o && typeof o === 'object') { f(o); for (const v of Object.values(o)) walk(v, f); } }; let n = 0; for (const v of Object.values(API)) walk(v, o => { if (o.properties?.streets?.enum) { n++; assert.deepEqual(o.properties.streets.enum, ['curved', 'network', 'wave', 'straight', null]); assert.equal(o.additionalProperties, false); } });
  assert.ok(n >= 1 && txt.length > 0, 'the streets setting in the schemas'); }

console.log('street networks ok');
