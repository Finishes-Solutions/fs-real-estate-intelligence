// Where the Projects list is kept (lib/projectstore.mjs): localStorage while it fits; a list too big for it (Safari
// holds about half what Chrome does) moves to IndexedDB with a marker left behind, and loads from there next time;
// storage the browser blocks outright is told apart from storage that's full.
import assert from 'node:assert/strict';
import { projectStore, mergeLoaded, whyFailed, MARK } from '../lib/projectstore.mjs';

const KEY = 'fs-projects-v1';
// a localStorage with Safari's limit (counted in characters here) that throws what Safari throws
function fakeLS(limit = Infinity, blocked = false) {
  const m = new Map(), used = () => [...m].reduce((s, [k, v]) => s + k.length + v.length, 0);
  return { m, getItem: k => { if (blocked) throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError', code: 18 }); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (blocked) throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError', code: 18 }); const was = m.get(k); m.delete(k); if (used() + k.length + String(v).length > limit) { if (was != null) m.set(k, was); throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError', code: 22 }); } m.set(k, String(v)); },
    removeItem: k => m.delete(k) };
}
const fakeIdb = () => { const m = new Map(); return { m, get: async k => structuredClone(m.get(k)), put: async (k, v) => { m.set(k, structuredClone(v)); } }; };
// a realistic list: projects whose options carry their laid-out elements (what makes a list megabytes)
const el = i => ({ id: 'e' + i, kind: i % 5 ? 'parking' : 'building', x: i * 3.1, y: i * 1.7, w: 120, d: 60, rot: 12.5, ring: Array.from({ length: 8 }, (_, j) => [i + j * 0.123456, i - j * 0.654321]) });
const project = (id, n) => ({ id, name: 'Project ' + id, updated: '2026-11-0' + (1 + (n % 3)) + 'T10:00:00Z', plans: [{ id: id + 'p', name: 'Option A', elements: Array.from({ length: n }, (_, i) => el(i)), lastRun: { variants: [{ elements: Array.from({ length: n }, (_, i) => el(i)) }] } }] });

// fits: localStorage, as before
{ const ls = fakeLS(2.5e6), idb = fakeIdb(), s = projectStore(KEY, ls, idb), db = { projects: [project('a', 50)], dirty: ['a'], gone: [] };
  assert.equal(s.save(db), 'local'); assert.equal(idb.m.size, 0);
  const b = projectStore(KEY, ls, idb).load(); assert.equal(b.later, null); assert.deepEqual(b.db, db); }

// too big for Safari's localStorage: shrunk first, then moved to IndexedDB, with only the marker left in localStorage
{ const ls = fakeLS(2.5e6), idb = fakeIdb(), s = projectStore(KEY, ls, idb);
  ls.setItem('fs-panel', 'open'); // other settings share the room
  const db = { projects: Array.from({ length: 12 }, (_, i) => project('p' + i, 900)), dirty: [], gone: [] };
  assert.ok(JSON.stringify(db).length > 2.5e6, 'the list is bigger than Safari allows');
  let shrunk = 0; const r = s.save(db, () => { shrunk++; return false; });
  assert.ok(r instanceof Promise, 'too big: goes to IndexedDB'); assert.equal(await r, 'idb'); assert.equal(shrunk, 1, 'shrinking is tried first');
  assert.deepEqual(JSON.parse(ls.getItem(KEY)), MARK); assert.equal(ls.getItem('fs-panel'), 'open');
  assert.equal(idb.m.get(KEY).projects.length, 12);
  // later saves stay in IndexedDB, even small ones
  db.projects.splice(1); assert.equal(await s.save(db), 'idb'); assert.equal(idb.m.get(KEY).projects.length, 1);
  // the next page load: nothing at once, the list from IndexedDB a moment later
  const b = projectStore(KEY, ls, idb).load(); assert.deepEqual(b.db.projects, []); assert.equal((await b.later).projects[0].id, 'p0'); }

// shrinking enough keeps it in localStorage
{ const ls = fakeLS(2.5e6), idb = fakeIdb(), s = projectStore(KEY, ls, idb), db = { projects: Array.from({ length: 12 }, (_, i) => project('p' + i, 900)), dirty: [], gone: [] };
  assert.equal(s.save(db, () => { for (const p of db.projects) for (const pl of p.plans) { pl.lastRun = { variants: [{}] }; pl.elements = pl.elements.slice(0, 200); } return true; }), 'local'); assert.equal(idb.m.size, 0); }

// IndexedDB failing too: the old copy in localStorage is left as it was, and the save says it's full
{ const ls = fakeLS(2.5e6), s = projectStore(KEY, ls, { get: async () => null, put: async () => { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); } });
  ls.setItem(KEY, JSON.stringify({ projects: [project('old', 5)], dirty: [], gone: [] }));
  await assert.rejects(s.save({ projects: Array.from({ length: 12 }, (_, i) => project('p' + i, 900)), dirty: [], gone: [] }), e => e.why === 'full');
  assert.equal(JSON.parse(ls.getItem(KEY)).projects[0].id, 'old'); }

// no IndexedDB and full: throws full
{ const s = projectStore(KEY, fakeLS(1000), null); assert.throws(() => s.save({ projects: [project('a', 50)], dirty: [], gone: [] }), e => e.why === 'full'); }
// blocked storage (Safari's Block All Cookies): blocked, and IndexedDB isn't tried
{ const idb = fakeIdb(), s = projectStore(KEY, fakeLS(Infinity, true), idb);
  assert.deepEqual(s.load().db, { projects: [], dirty: [], gone: [] });
  assert.throws(() => s.save({ projects: [], dirty: [], gone: [] }), e => e.why === 'blocked'); assert.equal(idb.m.size, 0); }
// a damaged value loads as empty, not as a crash
{ const ls = fakeLS(); ls.setItem(KEY, '{not json'); assert.deepEqual(projectStore(KEY, ls, fakeIdb()).load().db.projects, []); }

assert.equal(whyFailed({ name: 'QuotaExceededError', code: 22 }), 'full');
assert.equal(whyFailed({ name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 }), 'full');
assert.equal(whyFailed({ name: 'SecurityError', code: 18 }), 'blocked');

// what happened before the stored list arrived is kept: a new project, a newer copy from the team; an older copy isn't
{ const stored = { projects: [{ id: 'a', updated: '2026-11-01' }, { id: 'b', updated: '2026-11-03' }], dirty: ['a'], gone: [] };
  const now = { projects: [{ id: 'a', updated: '2026-11-02', n: 2 }, { id: 'b', updated: '2026-11-01', n: 2 }, { id: 'c', updated: '2026-11-03' }], dirty: ['c'], gone: ['z'] };
  const m = mergeLoaded(stored, now);
  assert.deepEqual(m.projects.map(p => p.id), ['a', 'b', 'c']); assert.equal(m.projects[0].n, 2); assert.equal(m.projects[1].n, undefined);
  assert.deepEqual(m.dirty, ['a', 'c']); assert.deepEqual(m.gone, ['z']); }
assert.deepEqual(mergeLoaded(undefined, { projects: [] }), { projects: [], dirty: [], gone: [] });

console.log('projectstore: ok');
