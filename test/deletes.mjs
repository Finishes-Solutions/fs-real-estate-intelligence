// Deleting (lib/project.mjs): an option with Undo, renderings (one, an option's, a project's), and Settings › Delete all
// projects (for the team through tombstones, or only this device's copies). On projects shaped like saved ones: three
// options, renderings with their massing kept beside them, a team project not yet synced.
import assert from 'node:assert/strict';
const PJ = await import('../lib/project.mjs');
const clone = o => JSON.parse(JSON.stringify(o));
const R = (id, by = 'Matt') => ({ id, view: 'corner', look: 'brick', time: 'day', at: '2026-10-18T15:00:00.000Z', sig: 'abc', by });
const plan = (id, name, renders = []) => ({ id, name, origin: [-95.82, 29.78], ring: [[0, 0], [600, 0], [600, 420], [0, 420]], front: 0, streets: [1], elements: [{ id: id + 'b', kind: 'building', x: 300, y: 200, w: 250, d: 100, rot: 0 }], program: { use: 'retail' }, renders, created: '2026-10-01T10:00:00.000Z' });
const p1 = { id: 'pj1', name: 'Katy corner site', parcels: [], plans: [plan('a', 'Option A', [R('r1'), R('r2', 'Dana')]), plan('b', 'Option B'), plan('c', 'Option C', [R('r3')])], updated: '2026-10-18T15:00:00.000Z' };
const p2 = { id: 'pj2', name: 'Cypress pad', parcels: [], plans: [plan('d', 'Option A', [R('r4')])] };

// ---- the picture keys ----
assert.deepEqual(PJ.imageKeys([R('x'), R('y')]), ['x', 'x:m', 'y', 'y:m'], 'each picture and its massing');
assert.deepEqual(PJ.imageKeys(null), []); assert.deepEqual(PJ.imageKeys([{}]), []);

// ---- an option, and Undo ----
{ const p = clone(p1), before = JSON.stringify(p);
  const r = PJ.removeOption(p, 'b');
  assert.equal(r.plan.name, 'Option B'); assert.equal(r.index, 1); assert.equal(r.next.id, 'c', 'the next one opens'); assert.deepEqual(r.keys, []);
  assert.deepEqual(p.plans.map(x => x.id), ['a', 'c']);
  assert.ok(PJ.restoreOption(p, r.plan, r.index)); assert.equal(JSON.stringify(p), before, 'Undo: back exactly where it was');
  assert.equal(PJ.restoreOption(p, r.plan, r.index), false, 'never twice');
  const last = PJ.removeOption(p, 'c'); assert.equal(last.next.id, 'b', 'the last in the row: the one before'); assert.deepEqual(last.keys, ['r3', 'r3:m'], 'its pictures to drop once Undo has passed');
  PJ.removeOption(p, 'a'); const only = PJ.removeOption(p, 'b'); assert.equal(only.next, null, 'the only one: nothing to open (the project page)'); assert.deepEqual(p.plans, []);
  assert.equal(PJ.removeOption(p, 'zz'), null);
  assert.ok(PJ.restoreOption(p, only.plan, 5)); assert.deepEqual(p.plans.map(x => x.id), ['b'], 'an index past the end goes last'); }

// ---- renderings ----
{ const p = clone(p1), A = p.plans[0];
  assert.deepEqual(PJ.removeRenders(A, ['r2']), ['r2', 'r2:m']); assert.deepEqual(A.renders.map(r => r.id), ['r1'], 'one picture');
  assert.deepEqual(PJ.removeRenders(A, ['nope']), [], 'not there: nothing changes'); assert.equal(A.renders.length, 1);
  assert.deepEqual(PJ.removeRenders(A), ['r1', 'r1:m']); assert.deepEqual(A.renders, [], 'all of an option’s');
  assert.deepEqual(PJ.removeRenders(p.plans[1]), [], 'an option with none'); assert.ok(!('renders' in p.plans[1]) || !p.plans[1].renders.length);
  assert.equal(p.plans[2].renders.length, 1, 'the other options keep theirs'); }

// ---- every project ----
assert.deepEqual(PJ.projectCounts([p1, p2]), { projects: 2, options: 4, renderings: 4 });
{ const db = { projects: clone([p1, p2]), dirty: ['pj2'], gone: ['old'] }, r = PJ.deleteAll(db, { team: true });
  assert.deepEqual(db.projects, []); assert.deepEqual(db.dirty, [], 'nothing left to send but the deletes');
  assert.deepEqual(db.gone, ['old', 'pj1', 'pj2'], 'a tombstone for each, so the team copies go and other devices drop them');
  assert.deepEqual([r.projects, r.options, r.renderings, r.team], [2, 4, 4, true]);
  assert.deepEqual(r.keys.sort(), ['r1', 'r1:m', 'r2', 'r2:m', 'r3', 'r3:m', 'r4', 'r4:m'], 'every picture on this device');
  PJ.deleteAll(db, { team: true }); assert.deepEqual(db.gone, ['old', 'pj1', 'pj2'], 'deleting again adds nothing'); }
{ const db = { projects: clone([p1, p2]), dirty: [], gone: [] }, r = PJ.deleteAll(db, { team: false });
  assert.deepEqual(db.projects, []); assert.deepEqual(db.gone, [], 'only this device: the team is left alone'); assert.equal(r.team, false); assert.equal(r.keys.length, 8); }
{ const db = { projects: [], dirty: [], gone: [] }, r = PJ.deleteAll(db); assert.deepEqual([r.projects, r.options, r.keys.length], [0, 0, 0], 'nothing to delete'); }

console.log('deletes: ok');
