// Where the Projects list is kept in the browser. It starts in localStorage (read at once, so a reload opens straight
// on the plan in the address). A list that outgrows localStorage moves to IndexedDB: Safari gives localStorage about
// half the room Chrome does (roughly 2.5 million characters), and a project with several built options can be
// megabytes, so on Safari the save used to fail outright ("This browser won't let the page save projects").
// IndexedDB's room is a share of the disk. When the list has moved, localStorage keeps only a small marker, so the
// next load knows to read it from IndexedDB. No DOM here: the browser passes in its storage, the test passes in fakes
// (test/projectstore.mjs).

export const MARK = { idb: 1 };
export const empty = () => ({ projects: [], dirty: [], gone: [] });
const shape = d => ({ projects: d?.projects || [], dirty: d?.dirty || [], gone: d?.gone || [] });
const isMark = d => !!d && d.idb === 1 && !d.projects;
// why a write was refused: 'full' (out of room) or 'blocked' (the browser turns site storage off, e.g. Safari's
// Block All Cookies, or Lockdown Mode)
export const whyFailed = e => /quota/i.test(String(e?.name || '') + ' ' + String(e?.message || '')) || e?.code === 22 || e?.code === 1014 ? 'full' : 'blocked';

// ls: a localStorage-like object; idb: { get(key) -> Promise, put(key, value) -> Promise } or null where there is none
export function projectStore(key, ls, idb) {
  let inIdb = false;
  return {
    get inIdb() { return inIdb; },
    // at start: { db, later } where later (when the list is in IndexedDB) is a Promise of the stored list
    load() {
      let d = null; try { d = JSON.parse(ls.getItem(key) || 'null'); } catch (e) { d = null; }
      if (isMark(d) && idb) { inIdb = true; return { db: empty(), later: idb.get(key).then(shape, () => empty()) }; }
      return { db: shape(isMark(d) ? null : d), later: null };
    },
    // -> 'local' | 'idb' (saved) or a Promise of it; throws { why: 'full' | 'blocked' } when nothing would take it.
    // shrink() makes the list smaller (true when it did), tried before moving to IndexedDB.
    save(db, shrink) {
      if (inIdb) return idb.put(key, db).then(() => 'idb', e => { throw { why: whyFailed(e), error: e }; });
      let err;
      try { ls.setItem(key, JSON.stringify(db)); return 'local'; } catch (e) { err = e; }
      if (whyFailed(err) === 'full' && shrink?.()) try { ls.setItem(key, JSON.stringify(db)); return 'local'; } catch (e) { err = e; }
      if (!idb || whyFailed(err) === 'blocked') throw { why: whyFailed(err), error: err };
      // too big for localStorage: into IndexedDB, and only once it's there does the marker replace the old copy
      return idb.put(key, db).then(() => { inIdb = true; try { ls.setItem(key, JSON.stringify(MARK)); } catch (e) { try { ls.removeItem(key); ls.setItem(key, JSON.stringify(MARK)); } catch (e2) { /* the marker can't be kept */ } } return 'idb'; },
        e => { throw { why: whyFailed(e), error: e }; });
    }
  };
}

// the list read from IndexedDB, with what changed on this page before it arrived (a project made, the team's copies
// downloaded): every project once, the newer copy where both have it
export function mergeLoaded(stored, now, t = s => Date.parse(s || 0) || 0) {
  const out = shape(stored), at = new Map(out.projects.map((p, i) => [p.id, i]));
  for (const p of now.projects || []) { const i = at.get(p.id); if (i == null) { at.set(p.id, out.projects.length); out.projects.push(p); } else if (t(p.updated) > t(out.projects[i].updated)) out.projects[i] = p; }
  out.dirty = [...new Set([...out.dirty, ...(now.dirty || [])])];
  out.gone = [...new Set([...out.gone, ...(now.gone || [])])];
  if (out.gone.length) out.projects = out.projects.filter(p => !out.gone.includes(p.id));
  return out;
}

// the browser's IndexedDB as { get, put }: one database, one store, the value kept as is (no JSON round trip)
export function browserIdb(name = 'fs-projects') {
  if (typeof indexedDB === 'undefined') return null;
  let dbp = null;
  const open = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); }; });
  return {
    get: async k => { const d = await open(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    put: async (k, v) => { const d = await open(); return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error); }); }
  };
}
