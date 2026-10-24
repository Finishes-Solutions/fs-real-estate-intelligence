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

// ---- 3. a count asked for with the land held for later (Settings › Leftover land › Hold it for later; the site is filled
// otherwise, below): that many homes nearest the entry, the rest land for later ----
{ const o = L.netOnly({ ...waller, params: { fill: false } }, { use: 'sfr', units: 300 }, { count: 1, netBudgetMs: 25000 })[0], n = homes(o.elements).length; // (time for every kind: the clock alone mustn't decide which first phase is checked)
  assert.ok(Math.abs(n - 300) <= 3, '300 homes asked: ' + n); checkNet(waller, o, '300 homes', { phase: true });
  assert.ok(o.elements.some(e => e.future && e.name === 'Future development') || o.notes.some(t => /future phase/.test(t)), 'the rest is land for a later phase');
  // (one network: every home and every way in reached from the main entry; a street with no homes on it is built only when
  // something needs it, so without it some homes, or a way in, would be cut off)
  const on = new Set(o.elements.filter(e => e.kind === 'lot').map(e => e.on)), needs = els => { const R = reachedAll(els, e => e.name === 'Main entry'); return !offStreet(els, R).length && S.entrancesOf(els).every(w => R.seen.has(w.id)); };
  assert.ok(needs(o.elements), 'every home and way in reached from the main entry');
  for (const s of o.recipe.net.streets.filter(s => !s.pseudo)) { const d = o.recipe.net.discs.filter(x => x.of === s.id).map(x => x.id); if (on.has(s.id) || d.some(x => on.has(x))) continue;
    assert.ok(!needs(o.elements.filter(e => !(e.kind === 'drive' && (e.net === s.id || d.includes(e.net))))), 'a street with no homes on it (' + (s.name || s.role) + ') joins others'); } }
// the same count with the site filled (the default): at least that many, the land past them more streets of homes as one plan
{ const o = L.netOnly(waller, { use: 'sfr', units: 300 }, { count: 1, netBudgetMs: 8000 })[0], n = homes(o.elements).length;
  assert.ok(n > 330, '300 homes asked, the site filled: ' + n); assert.ok(!o.elements.some(e => e.future || e.name === 'Future development'), 'no land held for later');
  assert.ok(o.notes.some(t => /^300 homes asked for; the land holds \d+, so the plan builds them all\.$/.test(t)), o.notes.join(' / ')); checkNet(waller, o, '300 homes, filled', { draw: false }); }

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
  // their homes go: no lot is left on a deleted street. (Not a smaller count: which network the timed search picks first
  // depends on the machine's speed, and on a ring network a deleted cross street's land re-flows into lots on the loop.)
  assert.ok(base.elements.some(e => e.kind === 'lot' && ids.has(e.on)), 'streets deleted: they had homes');
  assert.deepEqual(r.elements.filter(e => e.kind === 'lot' && ids.has(e.on)).map(e => e.id), [], 'streets deleted: their homes go');
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
  assert.deepEqual(N.netRules(cul).filter(i => i.kind === 'cul').map(i => i.text), ['A cul-de-sac runs 1042 ft (longest 800 ft)'], 'a 1,000 ft cul-de-sac: warned');
  assert.deepEqual(N.netRules(cul).filter(i => i.kind === 'dead').map(i => i.text.match(/^A ends (\d+) ft past/)?.[1]).sort(), ['250', '400'], 'A’s two ends, 250 and 400 ft past B with no turnaround: dead ends');
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


// ---- 10. the street network edited by hand (phase 4b, lib/streetedit.mjs): a cul-de-sac, a bow, a point dragged by a
// junction, a stretch deleted, a block laid out again; the lots re-flow along the changed streets, the rest stays ----
const SE = await import('../lib/streetedit.mjs'), SN = await import('../lib/streetnames.mjs'), RS = await import('../lib/rulesheet.mjs');
const key = h => Math.round(h.x) + ',' + Math.round(h.y), staying = (h0, h1, near) => { const a = homes(h0).filter(h => !near([h.x, h.y])), s1 = new Set(homes(h1).map(key)); return { moved: a.filter(h => !s1.has(key(h))).length, of: a.length }; };
const edited = (els, what, o = {}) => { // every drive and home reached, lots clear, no bad check, no street running into another
  const R = reachedAll(els); assert.deepEqual(R.D.filter(d => !R.seen.has(d.id)).map(d => d.name || d.note), [], what + ': every drive reached from a way in'); assert.deepEqual(offStreet(els, R), [], what + ': every home on a reached street');
  assert.deepEqual(lotIssues(els), [], what + ': lots clear'); assert.deepEqual(S.check({ ...base, elements: els }).filter(i => i.level === 'bad').map(i => i.text), [], what + ': no bad check'); assert.deepEqual(N.clashes(els), [], what + ': no street runs into another');
  const extra = N.netRules({ ...base, elements: els }).filter(i => !(o.allow || []).includes(i.kind)); assert.deepEqual(extra.map(i => i.text), [], what + ': within the street rules'); };
const chains = N.chainsOf(base), court = chains.filter(c => c.role === 'court' && !c.cyc && c.ends.every(e => e?.kind === 'bulb') && c.tees).sort((a, b) => b.L - a.L)[0];
assert.ok(chains.length > 10 && chains.some(c => c.role === 'collector' && c.cyc) && chains.some(c => c.role === 'boulevard'), 'the streets as named things: a loop road, a boulevard in');
assert.ok(court, 'a cul-de-sac street with streets meeting it along it');
{ // a dead end made a cul-de-sac: its bulb gone first (a street that ends in nothing)
  const bl = court.bulbs[1], p0 = { ...base, elements: base.elements.filter(e => e.id !== bl) }; assert.ok(N.chainsOf(p0).find(c => c.ids.includes(court.ids[0])).ends.some(e => e.kind === 'free'), 'its end is a dead end now');
  assert.ok(!N.netRules(base).some(i => i.kind === 'dead'), 'no dead end on the plan as laid');
  const r = SE.culDeSac(p0, court.ids[0]); assert.ok(!r.error, r.error); assert.match(r.note, /ends in a cul-de-sac now/);
  const f = L.refit({ ...base, elements: r.elements }, { amount: 'current' }), end = f.elements.find(e => e.id === r.bulb);
  assert.ok(end?.bulb && f.recipe.net.discs.some(d => d.id === end.net), 'the bulb drawn, and a disc of the network now'); edited(f.elements, 'a cul-de-sac made', { allow: ['cul'] });
  const near = q => dist(q, [end.x, end.y]) < 400, st = staying(base.elements, f.elements, near); assert.ok(st.moved <= st.of * 0.02, 'homes away from it stay: ' + st.moved + ' of ' + st.of + ' moved');
  const f2 = L.refit({ ...base, elements: f.elements, recipe: f.recipe }, { amount: 'current' }); assert.ok(f2.elements.some(e => e.id === r.bulb && e.bulb), 'the bulb kept by a second re-fit'); assert.equal(homes(f2.elements).length, homes(f.elements).length, 'and every home'); }
{ // a street T-ing in at both ends (a loop lane opened up by deleting a piece) ends at its far end; nothing is cut off
  const lp = chains.filter(c => c.role === 'local' && c.cyc).sort((a, b) => b.L - a.L)[0], p0 = { ...base, elements: base.elements.filter(e => e.id !== lp.ids[3]) }, c0 = N.chainsOf(p0).find(c => c.ids.includes(lp.ids[0]));
  assert.deepEqual(c0.ends.map(e => e.kind), ['tee', 'tee'], 'the loop lane opened: a T at each end');
  const r = SE.culDeSac(p0, lp.ids[0]); assert.ok(!r.error, r.error); const f = L.refit({ ...base, elements: r.elements }, { amount: 'current' }); edited(f.elements, 'a through street ended', { allow: ['cul', 'dead'] });
  const dd = N.netRules({ ...base, elements: f.elements, recipe: f.recipe }).filter(i => i.kind === 'dead'); assert.ok(dd.every(i => !lp.ids.includes(i.id) && !/^\d/.test(i.text)), 'a dead end only where a street met the piece deleted (the checks say so), not the street ended: ' + dd.map(i => i.text).join('; '));
  const R = reachedAll(f.elements); assert.ok(f.elements.filter(e => e.kind === 'drive' && e.net).every(e => R.seen.has(e.id)), 'nothing cut off'); }
{ // the only way to the streets beyond: refused (the main street of a narrow site, the street across its end beyond it)
  const sp = L.netOnly(narrow, { use: 'sfr' }, { netKinds: ['spine'], count: 1 })[0], ps = { ...narrow, elements: sp.elements, recipe: sp.recipe, program: sp.program }, ms = N.chainsOf(ps).find(c => c.label === 'Main street');
  assert.match(SE.culDeSac(ps, ms.ids[0]).error || '', /only way to the streets beyond it/, 'the only link: refused');
  // the main street curved (a spine: it bows; the loop road of Waller is a loop: refused, with why)
  const b = SE.bendStreet(ps, ms.ids[0], null); assert.ok(!b.error, b.error); const f = L.refit({ ...ps, elements: b.elements }, { amount: 'current' }); assert.deepEqual(lotIssues(f.elements), [], 'the main street curved: its lots clear'); assert.deepEqual(N.clashes(f.elements), [], 'and no street runs into another');
  assert.match(SE.bendStreet(base, chains.find(c => c.role === 'collector' && c.cyc).ids[0]).error, /loop/, 'a loop road: refused, and why');
  // a stretch of it deleted: refused when it's the only way to the streets beyond, else nothing is cut off
  const mp = ps.elements.find(e => e.id === ms.ids[0]).path, cs = SE.cutStretch(ps, ms.ids[0], mp[Math.floor(mp.length / 3)]);
  if (cs.error) assert.match(cs.error, /only way to the streets beyond it/); else assert.ok(!L.refit({ ...ps, elements: cs.elements }, { amount: 'current' }).notes.some(t => /no longer reach/.test(t)), 'a stretch deleted: nothing cut off'); }
{ // a street with T's along it bowed 60 ft: every street that met it still does; homes away from it stay
  const b = SE.bendStreet(base, court.ids[0], 60); assert.ok(!b.error, b.error); assert.equal(b.curve, 60);
  const f = L.refit({ ...base, elements: b.elements }, { amount: 'current' }), c1 = N.chainsOf({ ...base, elements: f.elements }).find(c => c.ids.includes(court.ids[0]));
  assert.equal(c1.tees, court.tees, 'every street that met it still meets it'); edited(f.elements, 'a street bowed');
  const was = base.elements.find(e => e.id === court.ids[0]).path, st = staying(base.elements, f.elements, q => was.some(p => dist(p, q) < 400)); assert.ok(st.moved <= st.of * 0.02, 'homes away from it stay: ' + st.moved + ' of ' + st.of);
  const big = SE.bendStreet(base, court.ids[0], 400); assert.ok(big.error || Math.abs(big.curve) < 400, 'a bow into the next street: refused or less: ' + (big.error || big.curve)); }
{ // a point dragged 30 ft by a junction: the street T-ing in there comes along (carryTees) and the next block stays
  const dr = base.elements.find(e => e.id === court.ids[0]), P = dr.path, m = N.measured(P), part = court.parts.find(x => x.id === dr.id), j = court.J.map(a => part.rev ? part.L - (a - part.off) : a - part.off).find(a => a > 60 && a < m.L - 60);
  const k = P.reduce((b, q, i) => Math.abs(m.c[i] - j - 20) < Math.abs(m.c[b] - j - 20) ? i : b, 0), t = m.tan(m.c[k]), nrm = [-t[1], t[0]], after = P.map((q, i) => { const f = Math.max(0, 1 - Math.abs(m.c[i] - m.c[k]) / 80); return [q[0] + nrm[0] * 30 * f, q[1] + nrm[1] * 30 * f]; });
  let els = base.elements.map(e => e.id === dr.id ? { ...e, path: after, pinned: true } : e); els = SE.carryTees(els, dr.id, P, after);
  assert.ok(els.some((e, i) => e !== base.elements[i] && e.id !== dr.id), 'the street T-ing in there carried along'); assert.deepEqual(SE.teesLost(base, { ...base, elements: els }, dr.id), [], 'its own ends still meet');
  const f = L.refit({ ...base, elements: els }, { amount: 'current' }), c1 = N.chainsOf({ ...base, elements: f.elements }).find(c => c.ids.includes(dr.id)); assert.equal(c1.tees, court.tees, 'the T holds');
  edited(f.elements, 'a point dragged by a junction'); const st = staying(base.elements, f.elements, q => dist(q, P[k]) < 400); assert.ok(st.moved <= st.of * 0.02, 'the next block’s homes stay: ' + st.moved + ' of ' + st.of); }
{ // a stretch deleted between two junctions: its homes go, the rest stay reached and clear
  const dr = base.elements.find(e => e.id === court.ids[0]), r = SE.cutStretch(base, dr.id, dr.path[Math.floor(dr.path.length / 2)]); assert.ok(!r.error, r.error); assert.match(r.note, /^Deleted a \d+ ft stretch/);
  const f = L.refit({ ...base, elements: r.elements }, { amount: 'current' }); assert.ok(homes(f.elements).length < homes(base.elements).length, 'its homes go'); edited(f.elements, 'a stretch deleted');
  assert.ok(!f.notes.some(t => /no longer reach/.test(t)), 'nothing cut off'); assert.match(SE.cutStretch(base, chains.find(c => c.role === 'local' && !c.cyc && !c.tees).ids[0], [0, 0]).error, /No streets meet/, 'a street with nothing meeting it: delete it whole'); }
{ // a block laid out again: the streets outside it as they were, its own another way; k: 2 a third way
  const H = homes(base.elements), mid = H.reduce((m, h) => [m[0] + h.x / H.length, m[1] + h.y / H.length], [0, 0]), at = H.slice().sort((a, b) => dist([a.x, a.y], mid) - dist([b.x, b.y], mid))[0];
  const t0 = Date.now(), r1 = L.netEdit(base, { op: 'relay', at: [at.x, at.y], k: 1 }), ms = Date.now() - t0; assert.ok(!r1.error, r1.error); assert.match(r1.notes[0], /^Laid the block’s streets out again: \d+ homes \(\d+ before\)\.$/);
  const keys = els => new Set(els.filter(e => e.kind === 'drive' && e.net && e.path).map(e => e.net + '|' + JSON.stringify(e.path))), k0 = keys(base.elements), k1 = keys(r1.elements), gone = [...k0].filter(x => !k1.has(x)), added = [...k1].filter(x => !k0.has(x));
  assert.ok(gone.length && added.length, 'its streets laid out another way'); const kept = base.recipe.net.streets.filter(s => !gone.some(g => g.startsWith(s.id + '|'))), ids1 = new Set(r1.recipe.net.streets.map(s => s.id));
  assert.ok(kept.length > 5 && kept.every(s => ids1.has(s.id)), 'the streets outside it as they were'); assert.ok(r1.recipe.net.streets.filter(s => s.role === 'coll').every(s => base.recipe.net.streets.some(o => o.id === s.id && JSON.stringify(o.path) === JSON.stringify(s.path))), 'the collectors as they were');
  edited(r1.elements, 'a block re-laid'); const inside = q => S.inRing(q, r1.block) || r1.block.some((p, i) => S.segDist(q, p, r1.block[(i + 1) % r1.block.length]) < 20); // (in the block, its outline from the collectors' pavement edges)
  const st = staying(base.elements, r1.elements, inside); assert.ok(st.moved <= st.of * 0.02, 'homes outside the block stay: ' + st.moved + ' of ' + st.of);
  // and it holds: the next re-fit (an edit anywhere) leaves every home outside the block where it was, and the count (the
  // far side of the loop road keeps the junctions its lots ran between before)
  const f1 = L.refit({ ...base, elements: r1.elements, recipe: r1.recipe }, { amount: 'current' }), sf = staying(base.elements, f1.elements, inside); assert.equal(sf.moved, 0, 'a re-fit after: homes outside the block stay (' + sf.moved + ' of ' + sf.of + ' moved)'); assert.equal(homes(f1.elements).length, homes(r1.elements).length, 'and the count');
  const r2 = L.netEdit(base, { op: 'relay', at: [at.x, at.y], k: 2 }); assert.ok(!r2.error, r2.error); const k2 = keys(r2.elements); assert.ok([...k2].some(x => !k1.has(x) && !k0.has(x)), 'k: 2, a third way'); edited(r2.elements, 'a block re-laid a third way');
  console.log('re-lay a block: ' + ms + ' ms; ' + r1.notes[0] + ' / ' + r2.notes[0]); }

// ---- 11. Change With AI on the streets (offline words and the schemas) ----
{ const sel = court.ids[0], G = t => E.guessEdits(t, base, sel);
  assert.deepEqual(G('make this street a cul-de-sac'), [{ action: 'culdesac', target: court.key }]); assert.deepEqual(G('curve the main street').map(o => o.action), ['bend']); assert.equal(G('curve the main street')[0].target, chains.find(c => c.label === 'Spine road').key, 'the main street: the spine');
  assert.deepEqual(G('re-lay this pod'), [{ action: 'relay', target: sel }]); assert.deepEqual(G('rename the streets with a golf theme'), [{ action: 'streetNames', on: true, theme: 'golf' }]); assert.deepEqual(G('turn off street names'), [{ action: 'streetNames', on: false, theme: '' }]);
  assert.deepEqual(G('call the loop road Heritage Parkway'), [{ action: 'change', target: chains.find(c => c.label === 'Loop road').key, street: 'Heritage Parkway' }]); assert.deepEqual(G('make the streets curvy'), [{ action: 'streets' }], 'a new street pattern: still New Layouts');
  assert.deepEqual(G('bend this street 80 ft to the right'), [{ action: 'bend', target: court.key, curve: -80 }]); assert.deepEqual(G('delete this street'), [{ action: 'remove', target: court.key }]);
  const d = E.describePlan(base, sel); assert.ok(d.streets.length >= 10 && d.streets.some(x => x.selected && x.id === court.key), 'the AI sees the streets, the selected one marked'); assert.deepEqual(d.streetNames, { on: false, theme: '' });
  // culdesac and bend end to end, then the re-fit
  const a = E.applyEdits(base, [{ action: 'bend', target: court.key, curve: 50 }, { action: 'culdesac', target: chains.find(c => c.label === 'Spine road').key }]); assert.equal(a.skipped.length, 0, a.skipped.join(' ')); assert.equal(a.done.length, 2);
  const f = L.refit({ ...base, elements: a.elements }, { amount: 'current' }); edited(f.elements, 'Change With AI on the streets', { allow: ['cul'] });
  const rm = E.applyEdits(base, [{ action: 'remove', target: court.key }]); assert.ok(!rm.elements.some(e => court.ids.includes(e.id) || court.bulbs.includes(e.id)), 'remove on a street: all of it and its cul-de-sacs');
  assert.deepEqual(E.applyEdits(base, [{ action: 'relay', target: sel }]).blocks.length, 1, 'relay on a neighbourhood: its block, run by the caller');
  const API = await import('../api/siteplan.js'), it = API.EDIT_SCHEMA.properties.ops.items; for (const k of ['curve', 'end', 'street']) assert.ok(it.required.includes(k) && it.properties[k], 'the op schema has ' + k);
  assert.ok(it.properties.action.enum.includes('culdesac') && it.properties.action.enum.includes('bend')); assert.ok(API.EDIT_SCHEMA.required.includes('streetNames') && API.EDIT_SCHEMA.properties.streetNames.required.join() === 'on,theme'); }
{ // a court (a bulb at one end, a T at the other) is a cul-de-sac already; "re-lay this block" with the loop road and no
  // click can't tell which block; a dead end left by an edit stays in the checks after the re-fit; a lot round a bulb is
  // measured for its frontage; a street named by hand only switches the names on; street names need subdivision streets
  const tb = chains.find(c => c.role === 'court' && !c.cyc && c.ends.some(e => e?.kind === 'bulb') && c.ends.some(e => e?.kind === 'tee'));
  assert.ok(tb, 'a court with a T at its other end'); assert.match(SE.culDeSac(base, tb.ids[0]).error || '', /already ends in a cul-de-sac/);
  const loop = chains.find(c => c.role === 'collector' && c.cyc), rl = E.applyEdits(base, [{ action: 'relay', target: loop.key }]); assert.equal(SE.blockAt(base, loop.key), null); assert.equal(rl.blocks.length, 0); assert.match(rl.skipped[0] || '', /runs between blocks/);
  let dead = null; for (const c of chains.filter(c => c.role === 'local' && !c.cyc && c.parts.length === 1)) { const e = c.ends.find(x => x?.kind === 'tee' && x.id === c.ids[0]), dr = e && base.elements.find(x => x.id === e.id); if (!dr) continue;
    const m = N.measured(dr.path), P = e.k ? dr.path.filter((q, i) => m.c[i] < m.L - 30).concat([m.at(m.L - 30).p]) : [m.at(30).p].concat(dr.path.filter((q, i) => m.c[i] > 30)), p0 = { ...base, elements: base.elements.map(x => x.id === dr.id ? { ...x, path: P, pinned: true } : x) };
    if (N.netRules(p0).some(i => i.kind === 'dead')) { dead = p0; break; } }
  assert.ok(dead, 'a street’s end pulled off its junction: a dead end in the checks'); const fd = L.refit(dead, { amount: 'current' }); assert.ok(N.netRules({ ...base, elements: fd.elements, recipe: fd.recipe }).some(i => i.kind === 'dead'), 'and still after the re-fit');
  const code = RS.codeParams(RS.WALLER), wide = N.codeRules({ ...base, params: { code: { ...code, streetRules: { ...code.streetRules, minLotW: 200 } } } }).find(i => i.kind === 'frontage');
  assert.equal(+wide.text.match(/^\d+/)[0], base.elements.filter(e => e.kind === 'lot').length, 'every lot measured, those round the bulbs too');
  const nm = E.applyEdits(base, [{ action: 'change', target: loop.key, street: 'Heritage Parkway' }]); assert.deepEqual(nm.named, ['Heritage Parkway']); assert.ok(nm.streetNames?.on && nm.streetNames.hand, 'names switched on, none given anew');
  assert.match(E.applyEdits({ ...base, recipe: null }, [{ action: 'streetNames', on: true, theme: 'golf' }]).skipped[0] || '', /own streets/, 'no subdivision streets: said so'); }

// ---- 12. a rule sheet: the generator follows it (pentagon, 110 acres) ----
{ const sheet = RS.sheetFrom({ values: Object.entries({ localRow: 60, localPave: 28, frontBL: 25, minLotW: 50, minLotSf: 6000, culMax: 600, blockMax: 1200, bulbR: 50, bulbRow: 70, secondAt: 50, detention: 0.65 }).map(([field, value]) => ({ field, value, url: 'https://code.example.gov/sub', sure: true })) }, { key: 'county:test', name: 'Test County', kind: 'county', sources: ['https://code.example.gov/sub'] }), code = RS.codeParams(sheet);
  const site = { ...pentagon, params: { code } }, t0 = Date.now(), o = L.netOnly(site, { use: 'sfr' }, { count: 1, netBudgetMs: 12000 })[0], ms = Date.now() - t0, plan = { ...site, elements: o.elements, recipe: o.recipe, program: o.program };
  console.log('pentagon with a rule sheet: ' + homes(o.elements).length + ' homes (' + runs.pentagon.nets[0].elements.filter(e => e.kind === 'building' && e.use === 'sfr').length + ' with typical rules) in ' + ms + ' ms');
  const loc = o.recipe.net.streets.filter(s => s.role !== 'coll'); assert.ok(loc.length && loc.every(s => s.row === 60), 'local streets: a 60 ft right-of-way');
  const locD = o.elements.filter(e => e.kind === 'drive' && e.net && e.path && !e.coll), lots = o.elements.filter(e => e.kind === 'lot');
  assert.ok(lots.every(l => l.poly.every(q => locD.every(d => d.path.every((a, i) => !i || S.segDist(q, d.path[i - 1], a) >= 29.5)))), 'no lot within 30 ft of a local street’s centre line');
  assert.deepEqual(N.netRules(plan).map(i => i.text), [], 'within the sheet: lots 50 ft wide at the front and 6,000 sq ft, homes 25 ft back, bulbs and blocks and cul-de-sacs as it says');
  assert.ok(o.recipe.net.discs.length && o.recipe.net.discs.every(d => d.R === 50), 'bulbs of 50 ft'); assert.ok(o.notes.some(t => /^Street rules: Test County rule sheet \(\d+ values still to confirm; Waller defaults stand in for \d+\)/.test(t)), 'the notes say which rules, and what’s still to confirm');
  const need = S.stormNeed(S.ringArea(pentagon.ring) / 43560, site.params, o.program), need0 = S.stormNeed(S.ringArea(pentagon.ring) / 43560, {}, o.program); assert.ok(Math.abs(need.volume / need0.volume - 0.65 / 0.55) < 1e-9, 'detention at the sheet’s rate');
  assert.ok(S.metrics(plan).pond >= need.area * 0.9 || o.notes.some(t => /holds about/.test(t)), 'the pond sized for it');
  const sq = { ring: [[-470, -470], [470, -470], [470, 470], [-470, 470]], front: 0, setbacks: { ...S.SETBACKS } }, ways = sa => N.contextOf({ ...sq, params: { code: { ...code, streetRules: { ...code.streetRules, secondAt: sa } } } }, { use: 'sfr' }).ways;
  assert.deepEqual([ways(50), ways(100)], [1, 0], 'a second way in over the sheet’s count of homes (about 73 on 20 acres)'); assert.equal(N.contextOf(sq, { use: 'sfr' }).ways, 1, 'typical: over 30');
  // a sheet's breaks shown (a home moved up to its street, a narrow lot): warnings, never a compliance claim
  const onSt = h => { const l = lots.find(l => S.inRing([h.x, h.y], l.poly)); return l && o.elements.some(e => e.kind === 'drive' && e.path && e.net === l.on); }, h = homes(o.elements).filter(onSt)[10], els = o.elements.map(e => e.id === h.id ? { ...e, ...(m => ({ x: m[0], y: m[1] }))((() => { const l = lots.find(l => S.inRing([h.x, h.y], l.poly)), d = locD.concat(o.elements.filter(e => e.kind === 'drive' && e.coll)).find(x => x.net === l.on), q = d && N.measured(d.path).proj([h.x, h.y]).p; return q ? [h.x + (q[0] - h.x) * 0.35, h.y + (q[1] - h.y) * 0.35] : [h.x, h.y]; })()) } : e);
  assert.ok(N.netRules({ ...plan, elements: els }).some(i => i.kind === 'bl'), 'a home moved up to its street: the building line flagged');
  assert.ok(o.notes.some(t => /^\d+ homes: .*% on 50 ft lots/.test(t)) && !o.notes.some(t => /on 40 ft lots/.test(t)), 'the lot mix says the widths the lots have (the narrowest widened to the sheet’s 50 ft)');
  // homes on parallel streets follow it too (the narrow tract, straight streets): their lots and right-of-way, and they say
  // which rules they used and what they still break of it (curving rows squeeze a few lots on the inside of a bend: said)
  const t1 = Date.now(), rw = L.layoutOptions({ ...narrow, params: { code, streets: 'straight' } }, { use: 'sfr' }, { count: 3 }).filter(x => x.style !== 'net' && homes(x.elements).length); assert.ok(rw.length, 'parallel-street layouts under the sheet');
  for (const x of rw) { const lw = x.elements.filter(e => e.kind === 'lot').map(e => +e.note.match(/^(\d+) ×/)?.[1]); assert.ok(lw.length && lw.every(w => w >= 50), 'lots 50 ft wide or more: ' + Math.min(...lw));
    const br = N.codeRules({ ...narrow, params: { code }, elements: x.elements }); assert.ok(x.notes.some(t => /^Street rules: Test County rule sheet/.test(t)), 'the notes say which rules'); assert.ok(br.every(b => x.notes.includes(b.text + '.')), 'and what they still break of it');
    assert.ok(!br.some(b => ['lotsize', 'row', 'sidewalk'].includes(b.kind)), 'lots, streets and right-of-way as the sheet asks: ' + br.map(b => b.text).join('; '));
    assert.ok(x.elements.filter(e => e.kind === 'drive' && /^Street · /.test(e.note || '')).every(d => +d.note.match(/^Street · (\d+)/)[1] >= 28), 'the sheet’s pavement'); }
  console.log('narrow with a rule sheet, parallel streets: ' + rw.map(x => homes(x.elements).length).join(', ') + ' homes in ' + (Date.now() - t1) + ' ms'); }

// ---- 13. street names ----
{ const ch = N.chainsOf(base), m = SN.plainNames(ch, ['Oak Ln']), named = ch.filter(c => !((c.role === 'boulevard' || c.role === 'entry') && c.L < 400));
  assert.ok(named.every(c => m.has(c.key)), 'every street named'); assert.equal(new Set([...m.values()].map(n => SN.baseOf(n).toLowerCase())).size, m.size, 'no two alike'); assert.ok(![...m.values()].some(n => /^Oak /.test(n)), 'none like a street nearby');
  for (const c of ch) { const n = m.get(c.key); if (!n) continue; if (c.role === 'collector' || c.role === 'boulevard') assert.match(n, / (Parkway|Boulevard|Drive)$/, 'grander: ' + n); if (c.role === 'court') assert.match(n, / (Court|Circle)$/, 'a cul-de-sac street: ' + n); }
  const a = SN.applyNames(base, m), on = { ...base, elements: a.elements, recipe: a.recipe, params: { streetNames: { on: true, theme: '' } } };
  assert.ok(on.elements.filter(e => e.kind === 'drive' && e.net && e.path && !e.bulb).every(e => e.street), 'every street drive carries its name'); assert.ok(on.elements.filter(e => S.isEntrance(e) && e.name === 'Main entry').every(e => e.street), 'the main entry the name of the street it meets');
  assert.ok(on.elements.every(e => !e.street || e.name !== e.street), 'names in street, never in name');
  // re-fits keep them, a loop street broken in pieces too
  const lp = ch.filter(c => c.role === 'local' && c.cyc).sort((x, y) => y.L - x.L)[0], f = L.refit({ ...on, elements: on.elements.filter(e => e.id !== lp.ids[2]) }, { amount: 'current' }), f2 = L.refit({ ...on, elements: f.elements, recipe: f.recipe }, { amount: 'current' });
  for (const r of [f, f2]) { const ds = r.elements.filter(e => e.kind === 'drive' && e.net && e.path && !e.bulb); assert.ok(ds.every(e => e.street), 'the names kept by the re-fit'); assert.ok(r.elements.filter(e => lp.ids.includes(e.id)).every(e => e.street === m.get(lp.key)), 'every piece of the broken loop keeps its name'); }
  assert.ok(f.recipe.net.streets.filter(s => !s.pseudo).every(s => s.street), 'the recipe’s streets too');
  // the map and the sheet: along the streets when on, none when off
  const sn = S.planFeatures(on).features.filter(x => x.properties.k === 'sname'); assert.ok(sn.length >= named.length * 0.8 && sn.every(x => x.geometry.type === 'LineString'), 'names along the streets on the map: ' + sn.length);
  assert.equal(S.planFeatures({ ...on, params: { streetNames: { on: false } } }).features.filter(x => x.properties.k === 'sname').length, 0, 'off: none (kept for when it’s on again)');
  assert.ok(G.planSVG(on, { px: 1400 }).svg.includes(m.get(lp.key)), 'on the PDF sheet'); assert.ok(!G.planSVG({ ...on, params: {} }, { px: 1400 }).svg.includes(m.get(lp.key)), 'not when off'); assert.ok(!nan(S.toDXF(on)), 'the DXF draws');
  // renamed by hand: the whole street; a name another street has is refused
  const rn = SN.rename(on, lp.ids[0], 'Heritage Lane'); assert.ok(on.elements.filter(e => lp.ids.includes(e.id)).length > 1 && rn.elements.filter(e => lp.ids.includes(e.id)).every(e => e.street === 'Heritage Lane'), 'every piece renamed');
  assert.match(SN.rename(on, lp.ids[0], m.get(ch.find(c => c.role === 'collector' && c.cyc).key).replace(/ \w+$/, ' Court')).error, /already a street here/, 'a name another street has: refused');
  const bk = m.get(ch.find(c => c.role === 'collector' && c.cyc).key).split(' ')[0]; assert.match(SN.rename(on, lp.ids[0], bk + ' Hill Way').error, /too like it/, 'a name too like another street’s (Bunker Hill beside Bunker): refused, as the generator would');
  assert.match(SN.rename({ ...on, nearRoads: ['Heritage Rd'] }, lp.ids[0], 'Heritage Lane').error, /road nearby/, 'a road nearby on the map: refused');
  const av = SN.plainNames(ch, ['Cedar Rd', 'Pecan St', 'Magnolia Blvd']); assert.ok(![...av.values()].some(n => /^(Cedar|Pecan|Magnolia) /.test(n)), 'the streets nearby avoided'); }

console.log('street networks ok');
