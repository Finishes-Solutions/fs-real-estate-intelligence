// New Option › Blank site, and Clear and start over (lib/siteplan.mjs: blankOf, clearDesign, undoState, restoreState,
// nextOptionName), on a realistic option: a 5.8-acre corner lot (front on the south, a side street on the east, set by
// hand), a 25 ft utility easement along the back, laid out by the real layout engine with its layouts saved as the
// last build (lib/planruns.mjs slimRun), a recipe, zones, layout settings, a Pro forma with a land price, a rendering,
// view settings and parking rows kept to grow back. The site has to survive a blank copy and a clear; the design must not.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), RUN = await import('../lib/planruns.mjs');
const clone = o => JSON.parse(JSON.stringify(o));

const easement = { id: 'ko1', kind: 'keepout', poly: [[0, 395], [600, 395], [600, 420], [0, 420]], x: 300, y: 407.5, w: 600, d: 25, rot: 0, name: 'Easement 1', note: 'Drawn, not surveyed', pinned: true };
const site = { origin: [-95.8245, 29.7855], ring: [[0, 0], [600, 0], [600, 420], [0, 420]], src: 'parcels', front: 0, frontGuess: false, streets: [1], streetsSet: true, streetsBy: 2,
  setbacks: { ...S.SETBACKS, paveFront: 10, paveSide: 5, paveRear: 5, buildOn: true, paveOn: true }, parcel: 'pid:1234567', parcels: ['pid:1234567', 'pid:1234568'], zoning: { zoning: 'C-2', zoning_description: 'General commercial', max_far: 1.5 } };
const program = { use: 'retail', gfa: 25000, ratio: 4.5 };
const layouts = L.layoutOptions({ ...site, program, elements: [easement] }, program, { count: 4, keepout: [clone(easement)] });
assert.ok(layouts.length >= 2, 'the engine lays out more than one layout: ' + layouts.length);
const keys = RUN.layoutKeys(layouts), vs = layouts.map((v, i) => ({ ...v, key: keys[i], name: 'Layout ' + (i + 1) + ' · ' + (v.arr || 'Rows'), m: S.metrics({ ...site, ...v }) })), on = vs[0];
const now = '2026-10-18T15:04:05.000Z';
const optionA = clone({ // (as saved: JSON)
  id: 'plA', name: 'Option A', ...clone(site), program: clone(on.program || program),
  elements: clone(on.elements.filter(e => e.kind !== 'keepout')).concat([clone(easement)]),
  zones: clone(on.zones || [{ name: 'Retail', use: 'retail' }]), recipe: clone(on.recipe || { kind: 'retail', arr: on.arr }), variant: { key: on.key, name: on.name, at: now, edited: true },
  lastRun: RUN.slimRun({ ask: '25,000 sf retail strip, parking in front', note: 'Parking in front of the stores.', at: now, effort: 'medium', aiReviewed: true, variants: vs, read: { ask: '25,000 sf retail strip, parking in front', chips: ['Retail', '25,000 sf'], by: 'ai' }, ideas: { list: [{ request: 'A pad site on the corner' }] } }, on.key),
  stale: 'street', spareRows: [{ kind: 'parking', x: 100, y: 60, w: 120, d: 18, rot: 0 }], params: { fill: false, trees: false, form: 'L', style: { ponds: 'organic' } },
  pf: { landPrice: 1250000, landClosingPct: 2, rents: { retail: 26 }, rate: 7.25 },
  renders: [{ id: 'r1', view: 'aerial', look: 'modern', time: 'day', at: now, sig: 'abc', by: 'Matt' }], view: { grid: 10, lastGrid: 10, hidden: ['trees'], locked: [] },
  created: '2026-10-01T10:00:00.000Z', updated: now
});
assert.ok(S.hasDesign(optionA) && optionA.elements.some(e => e.kind === 'building') && optionA.lastRun.variants.length >= 2, 'the option is laid out, with its layouts saved');

// ---- every field of the option is sorted into site, design or the option's own ----
const known = new Set([...S.SITE_KEYS, ...S.DESIGN_KEYS, ...S.OWN_KEYS]);
assert.deepEqual(Object.keys(optionA).filter(k => !known.has(k)), [], 'every field is sorted into site / design / own');
assert.deepEqual(S.SITE_KEYS.filter(k => S.DESIGN_KEYS.includes(k) || S.OWN_KEYS.includes(k)), [], 'no field is in two lists');

// ---- option names ----
assert.equal(S.nextOptionName([{ name: 'Option A' }, { name: 'Option B' }]), 'Option C');
assert.equal(S.nextOptionName([{ name: 'Option A' }]), 'Option B');
assert.equal(S.nextOptionName([{ name: 'Option B' }]), 'Option C', 'after a delete, a name is never used twice');
assert.equal(S.nextOptionName([{ name: 'Option A' }, { name: 'Option C · Rows facing the street' }, { name: 'Lot test' }]), 'Option D');
assert.equal(S.nextOptionName(Array.from({ length: 26 }, (_, i) => ({ name: 'Option ' + String.fromCharCode(65 + i) }))), 'Option 27');

// ---- Blank site ----
const before = clone(optionA);
const plans = [optionA, { ...clone(optionA), id: 'plB', name: 'Option B' }];
const B = S.blankOf(optionA, { id: 'plNew', name: S.nextOptionName(plans), now: '2026-10-19T09:00:00.000Z' });
assert.equal(B.id, 'plNew'); assert.notEqual(B.id, optionA.id, 'a fresh id'); assert.equal(B.name, 'Option C', 'the next name');
assert.equal(B.created, '2026-10-19T09:00:00.000Z'); assert.equal(B.updated, '2026-10-19T09:00:00.000Z');
for (const k of S.SITE_KEYS) assert.deepEqual(B[k], optionA[k], 'the site survives: ' + k);
assert.deepEqual(B.streets, [1]); assert.equal(B.streetsSet, true); assert.equal(B.front, 0); assert.equal(B.frontGuess, false);
assert.deepEqual(B.elements, [easement], 'the easement is the site: it comes along, and nothing else');
assert.ok(!S.hasDesign(B), 'nothing laid out');
for (const k of ['zones', 'recipe', 'variant', 'lastRun', 'stale', 'spareRows', 'params', 'renders', 'view']) assert.ok(!(k in B), 'the design (or the option’s own) stays behind: ' + k);
assert.deepEqual(B.program, { use: 'retail' }, 'the program back to the default');
assert.deepEqual(B.pf, { landPrice: 1250000, landClosingPct: 2 }, 'the land price is the land’s; the rest of the Pro forma stays behind');
// a copy, never shared: changing the new option leaves the old one alone
B.ring[0][0] = 5; B.streets.push(2); B.elements[0].poly[0][1] = 390; B.setbacks.front = 40; B.zoning.max_far = 9; B.parcels.push('x');
assert.deepEqual(optionA, before, 'Option A untouched');
// the same from a plan as old saves have it (no street sides yet, no zoning, no Pro forma)
const old = S.blankOf({ id: 'o', name: 'Option A', origin: [-95, 29], ring: [[0, 0], [100, 0], [100, 100]], src: 'drawn', front: null, frontGuess: true, setbacks: { ...S.SETBACKS }, program: { use: 'office' }, elements: [{ id: 'b', kind: 'building', x: 50, y: 50, w: 20, d: 20, rot: 0 }] }, { id: 'n', name: 'Option B' });
assert.deepEqual(old.elements, []); assert.equal(old.zoning, null); assert.ok(!('pf' in old) && !('streets' in old)); assert.equal(old.frontGuess, true, 'a guessed front is still a guess (it is looked for again on opening)');
// a plan with no site yet: an option with no site either, never a broken one
const none = S.blankOf({ id: 'd', name: 'Option A', origin: [-95, 29], ring: [], elements: [] }, { id: 'n2', name: 'Option B' });
assert.deepEqual(none.ring, []); assert.deepEqual(none.elements, []); assert.deepEqual(none.setbacks, S.SETBACKS); assert.deepEqual(none.origin, [-95, 29]);

// ---- Clear and start over, and Undo ----
const A = clone(optionA), snap = S.undoState(A);
assert.ok(!('id' in snap.data) && !('renders' in snap.data) && !('view' in snap.data), 'the undo step leaves out what Clear never touches');
S.clearDesign(A, '2026-10-19T09:30:00.000Z');
for (const k of S.SITE_KEYS) assert.deepEqual(A[k], optionA[k], 'Clear keeps the site: ' + k);
assert.equal(A.id, 'plA'); assert.equal(A.name, 'Option A'); assert.equal(A.created, optionA.created); assert.equal(A.updated, '2026-10-19T09:30:00.000Z');
assert.deepEqual(A.renders, optionA.renders, 'the renderings stay (they say the plan changed since)'); assert.deepEqual(A.view, optionA.view, 'and how it is viewed');
assert.deepEqual(A.elements, [easement]); assert.ok(!S.hasDesign(A));
for (const k of ['zones', 'recipe', 'variant', 'lastRun', 'stale', 'spareRows', 'params']) assert.ok(!(k in A), 'cleared: ' + k);
assert.deepEqual(A.program, { use: 'retail' }); assert.deepEqual(A.pf, { landPrice: 1250000, landClosingPct: 2 });
// a rendering made after the clear stays through the undo; everything else comes back exactly
A.renders = A.renders.concat([{ id: 'r2', view: 'street', at: now }]);
const redo = S.undoState(A); S.restoreState(A, snap);
assert.deepEqual({ ...A, renders: optionA.renders }, optionA, 'Undo puts the option back exactly');
assert.equal(JSON.stringify({ ...A, renders: optionA.renders }), JSON.stringify(optionA), 'down to the order of its fields (what is saved and synced is byte for byte the same)');
assert.equal(A.renders.length, 2, 'a rendering made since is kept');
// Redo clears it again, exactly as the clear did; and Undo again
S.restoreState(A, redo); assert.deepEqual(A.elements, [easement]); assert.ok(!('lastRun' in A) && !('recipe' in A)); assert.equal(A.updated, '2026-10-19T09:30:00.000Z');
S.restoreState(A, snap); assert.equal(JSON.stringify({ ...A, renders: optionA.renders }), JSON.stringify(optionA), 'Undo after Redo, exactly again');
// the undo step is a copy: editing the option afterwards doesn't change what Undo puts back
const C = clone(optionA), s2 = S.undoState(C); S.clearDesign(C); C.elements.push({ id: 'x', kind: 'building', x: 1, y: 1, w: 1, d: 1, rot: 0 }); C.ring[0][0] = 9;
S.restoreState(C, s2); assert.equal(JSON.stringify(C), JSON.stringify(optionA));
// clearing an option with nothing on it is harmless
// a Waller site (lib/guardrails.mjs): its jurisdiction and its guardrail settings (outfall, margin, ROW reserve) are the
// site's and stay; the scenario laid out and the rest of the layout settings are the design's and go
{ const W = { ...clone(optionA), jur: { waller: true, how: 'inside', cls: 'VERIFIED', reason: 'Inside the City of Waller' }, laidAs: 'C',
    params: { stallW: 9.5, guard: { mode: 'on', outfall: 'ditch', factor: 0.05, row: 12, scenario: 'C' } } };
  assert.deepEqual(Object.keys(W).filter(k => !known.has(k)), [], 'the guardrails\u2019 fields are sorted too');
  const b = S.blankOf(W, { id: 'w2', name: 'Option B' });
  assert.deepEqual(b.jur, W.jur, 'blank: the jurisdiction stays'); assert.ok(!('laidAs' in b), 'blank: the scenario laid out goes');
  assert.deepEqual(b.params, { guard: { mode: 'on', outfall: 'ditch', factor: 0.05, row: 12 } }, 'blank: the site\u2019s guardrail settings stay, the layout settings and the scenario go');
  const c = clone(W), u = S.undoState(c); S.clearDesign(c);
  assert.deepEqual(c.jur, W.jur); assert.ok(!('laidAs' in c)); assert.deepEqual(c.params, { guard: { mode: 'on', outfall: 'ditch', factor: 0.05, row: 12 } }, 'clear: the same');
  S.restoreState(c, u); assert.equal(JSON.stringify(c), JSON.stringify(W), 'clear then undo: exact, guardrails included'); }
const E = S.clearDesign({ id: 'e', name: 'Option A', ring: [], elements: [] }); assert.deepEqual(E.elements, []); assert.deepEqual(E.program, { use: 'retail' }); assert.ok(!('pf' in E));

console.log('newoption: ok (' + layouts.length + ' layouts, ' + optionA.elements.length + ' pieces)');
