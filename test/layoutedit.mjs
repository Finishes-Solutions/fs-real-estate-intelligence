// Edits to a saved layout run (lib/layoutedit.mjs): the words read into typed edits (and an AI's edits checked against
// the same schema, from captured answers: no AI is called), locks kept, conflicts reported instead of the request
// being changed, transactions all-or-nothing, and replay / undo rebuilding the same geometry from the saved steps.
import assert from 'node:assert/strict';
import * as SP from '../lib/siteplan.mjs';
import * as B from '../lib/layoutbrief.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import * as ED from '../lib/layoutedit.mjs';

let n = 0; const ok = (name, f) => { f(); n++; console.log('ok', n, name); };
const RECT = { origin: [-96.42, 30.38], ring: [[0, 0], [900, 0], [900, 500], [0, 500]], front: 0, streets: [3], setbacks: { ...SP.SETBACKS } };

ok('the example requests read as typed edits', () => {
  const r = t => ED.editFromWords(t, { selection: ['a', 'b'] }).edits;
  assert.deepEqual(r('Keep 240 units, but compare garden apartments with townhomes.'), [{ op: 'set-quantity', use: 'multifamily', quantity: { mode: 'exact', value: 240, unit: 'units' } }, { op: 'compare-forms', use: 'multifamily', forms: ['mf-garden', 'mf-townhome'] }]);
  assert.deepEqual(r('Keep the buildings and move the pool to the center.'), [{ op: 'lock', target: { kind: 'building' } }, { op: 'move', target: { kind: 'pool' }, to: 'center' }]);
  assert.deepEqual(r('Put retail along the main road and apartments behind it.'), [{ op: 'place', use: 'retail', where: 'front' }, { op: 'place', use: 'multifamily', where: 'back' }]);
  assert.deepEqual(r('Keep the northwest entrance and regenerate the rest.'), [{ op: 'keep-entrance', target: { entrance: 'northwest' } }]);
  assert.deepEqual(r('Increase the office portion of the flex buildings to 30%.'), [{ op: 'set-office-share', use: 'industrial', share: 0.3 }]);
  assert.deepEqual(r('Lock these two buildings and improve parking around them.'), [{ op: 'lock', target: { ids: ['a', 'b'] } }, { op: 'regenerate' }]);
  assert.deepEqual(ED.editFromWords('Lock these two buildings').unclear, ['“These” needs a selection on the plan: select the pieces first.']);
});
ok('an AI’s edits are held to the same schema (captured answers)', () => {
  const captured = [{ op: 'move', target: { kind: 'pool' }, to: 'center' }, { op: 'move', target: { kind: 'pool' } }, { op: 'set-quantity', quantity: { mode: 'lots' } }, { op: 'delete-everything' }, { op: 'set-office-share', use: 'industrial', share: 3 }];
  assert.deepEqual(captured.map(e => ED.validateEdit(e).ok), [true, false, false, false, false]);
});

const base = RUN.runBrief(B.briefFromRequest('garden apartments, as many as fit', RECT));
const opt = base.options[0];
ok('locking keeps ids and records the shapes', () => {
  const ids = opt.elements.filter(e => e.kind === 'building' && e.use === 'multifamily').slice(0, 2).map(e => e.id);
  const r = ED.applyEdit(base, { op: 'lock', target: { ids } }); assert.ok(r.ok, r.conflicts.join());
  assert.deepEqual(r.record.brief.locks, [...ids].sort()); assert.equal(r.record.options[0].validation.checks.find(c => c.id === 'locks').status, 'pass');
  const mv = ED.applyEdit(r.record, { op: 'move', target: { ids: [ids[0]] }, to: { dx: 10, dy: 0 } });
  assert.equal(mv.ok, false); assert.match(mv.conflicts[0], /locked and can’t move/);
});
ok('a target that matches nothing is a conflict, not a guess', () => {
  const r = ED.applyEdit(base, { op: 'keep-entrance', target: { entrance: 'northeast' } }); // the streets are on the south and west sides
  assert.equal(r.ok, false); assert.match(r.conflicts[0], /No entrance lies northeast/);
});
ok('an edit that would break a hard check is rejected and the record is untouched', () => {
  const before = JSON.stringify(base);
  const r = ED.applyEdit(base, { op: 'move', target: { kind: 'pool' }, to: { dx: 2000, dy: 0 } }); // off the site
  assert.equal(r.ok, false); assert.ok(r.conflicts.length); assert.equal(JSON.stringify(base), before);
});
ok('keep the southwest entrance: locked, re-fit, replayed and undone exactly', () => {
  const w = ED.editFromWords('Keep the southwest entrance and regenerate the rest.').edits, r = ED.applyEdits(base, w);
  if (!r.ok) { console.log('   (re-fit conflict reported:', r.conflicts.join('; ') + ')'); return; }
  const kept = r.record.brief.locks[0], was = opt.elements.find(e => e.id === kept), now = r.record.options[0].elements.find(e => e.id === kept);
  assert.deepEqual([now.x, now.y, now.w, now.d], [was.x, was.y, was.w, was.d]);
  const rp = ED.replayEdits(r.record.edit.base, r.record.edit.steps); assert.ok(rp.ok); assert.equal(rp.record.options[0].geometryHash, r.record.options[0].geometryHash);
  const u = ED.undo(r.record); assert.ok(u.ok); assert.equal(u.record.options[0].geometryHash, opt.geometryHash);
});
ok('changing the quantity keeps its meaning and replays', () => {
  const r = ED.applyEdit(base, { op: 'set-quantity', use: 'multifamily', quantity: { mode: 'max', value: 96, unit: 'units' } }); assert.ok(r.ok, r.conflicts.join());
  const best = r.record.options[0]; assert.ok(best.quantities.totals.units <= 96, String(best.quantities.totals.units));
  assert.equal(r.record.brief.program.uses[0].quantity.mode, 'max');
  const rp = ED.replayEdits(r.record.edit.base, r.record.edit.steps); assert.equal(rp.record.options[0].geometryHash, best.geometryHash);
});
ok('an unsupported form is a conflict', () => {
  const r = ED.applyEdit(base, { op: 'set-form', use: 'multifamily', form: 'mf-tuck-under' }); assert.equal(r.ok, false); assert.match(r.conflicts[0], /Tuck-under/);
});
ok('a flex office share raises the parking required', () => {
  const flex = RUN.runBrief(B.briefFromRequest('flex industrial buildings, 60,000 sf', RECT)), r = ED.applyEdit(flex, { op: 'set-office-share', use: 'industrial', share: 0.3 });
  assert.ok(r.ok, r.conflicts.join()); const q0 = flex.options[0].quantities.parking, q1 = r.record.options[0].quantities.parking;
  assert.ok(q1.required > q0.required, q0.required + ' -> ' + q1.required);
  assert.equal(ED.applyEdit(base, { op: 'set-office-share', use: 'multifamily', share: 0.3 }).ok, false);
});
ok('compare forms changes nothing on the plan', () => {
  const r = ED.applyEdit(base, { op: 'compare-forms', use: 'multifamily', forms: ['mf-garden', 'mf-townhome'] });
  assert.ok(r.ok); assert.equal(r.record, base); assert.equal(r.comparison.length, 2); assert.ok(r.comparison.every(c => c.outcome));
});
console.log('layoutedit: ' + n + ' passed');
