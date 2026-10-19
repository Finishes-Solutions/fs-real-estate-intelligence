// The team's building library in the browser: building types saved from site plans (Save to Library), kept on this
// device and shared with the team through /api/buildingtypes, the way projects are. Everyone on the team sees them under
// From the building library, as the Team group, and the AI is told about them so it can reuse one. When the team
// library isn't set up on the site yet (no table, no secret key), they stay on this device and the panel says so.
import { teamTypeIn } from './lib/customtypes.mjs';

const KEY = 'fs-team-types-v1', CODE_KEY = 'fs-team-code', NAME_KEY = 'fs-team-name';
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const uid = () => 'bt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// onChange: called after anything changes (a save here, or the team's copy arriving)
export function teamLibrary({ onChange = () => {} } = {}) {
  let db = load(), syncing = false, syncT = 0;
  // shared: true once the server has answered, false when the team library isn't set up (this device only), null before
  const st = { shared: null, why: '' };
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return { types: (d.types || []).map(teamTypeIn).filter(Boolean), dirty: d.dirty || [], gone: d.gone || [] }; } catch (e) { return { types: [], dirty: [], gone: [] }; } }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* full: kept for this visit */ } };
  const changed = () => { persist(); try { onChange(); } catch (e) { console.warn('team library', e); } clearTimeout(syncT); syncT = setTimeout(sync, 800); };
  async function sync() {
    if (syncing || typeof navigator !== 'undefined' && navigator.onLine === false) return; syncing = true;
    const h = { 'Content-Type': 'application/json', 'x-field-code': get(CODE_KEY) }, off = async r => { const d = await r.json().catch(() => ({})); st.shared = r.status === 503 || r.status === 401 || r.status === 404 || r.status === 405 ? false : st.shared; st.why = r.status === 401 ? 'passcode' : d.local || r.status === 404 ? 'setup' : 'offline'; };
    try {
      if (db.dirty.length || db.gone.length) {
        const sent = db.types.filter(t => db.dirty.includes(t.id)).map(t => [t.id, t.updated]), gone = db.gone.slice();
        const r = await fetch('api/buildingtypes', { method: 'POST', headers: h, body: JSON.stringify({ types: db.types.filter(t => db.dirty.includes(t.id)), deletes: gone, name: get(NAME_KEY) }) });
        if (!r.ok) { await off(r); return; }
        db.dirty = db.dirty.filter(id => !sent.some(([i, u]) => i === id && db.types.find(t => t.id === id)?.updated === u)); db.gone = db.gone.filter(id => !gone.includes(id));
      }
      const r = await fetch('api/buildingtypes', { headers: h }); if (!r.ok) { await off(r); return; }
      const d = await r.json(); st.shared = true; st.why = '';
      for (const id of d.deleted || []) { const i = db.types.findIndex(t => t.id === id); if (i >= 0 && !db.dirty.includes(id)) db.types.splice(i, 1); }
      for (const t0 of d.types || []) { const t = teamTypeIn(t0); if (!t || db.dirty.includes(t.id) || db.gone.includes(t.id)) continue;
        const i = db.types.findIndex(x => x.id === t.id); if (i < 0) db.types.push(t); else if (Date.parse(t.updated) > Date.parse(db.types[i].updated)) db.types[i] = t; }
    } catch (e) { st.shared = st.shared ?? false; st.why = 'offline'; }
    finally { syncing = false; persist(); try { onChange(); } catch (e) {} }
  }
  if (typeof window !== 'undefined') { window.addEventListener('online', sync); setTimeout(sync, 2500); }
  const touch = t => { t.updated = new Date().toISOString(); if (!db.dirty.includes(t.id)) db.dirty.push(t.id); };
  return {
    list: () => db.types.slice().sort((a, b) => a.name.localeCompare(b.name)),
    get: id => db.types.find(t => t.id === id) || null,
    status: () => ({ ...st, count: db.types.length, pending: db.dirty.length + db.gone.length }),
    // a new type (a name already in the library gets a number after it); returns the saved type
    save(t0) {
      const names = new Set(db.types.map(t => t.name.toLowerCase())); let name = String(t0.name || 'Building').trim().slice(0, 60), n = 2; const base = name;
      while (names.has(name.toLowerCase())) name = (base.slice(0, 55) + ' (' + n++ + ')');
      const t = teamTypeIn({ ...t0, id: t0.id || uid(), name, by: t0.by || get(NAME_KEY), at: new Date().toISOString(), updated: new Date().toISOString() }); if (!t) return null;
      db.types.push(t); touch(t); changed(); return t;
    },
    rename(id, name) { const t = db.types.find(x => x.id === id), v = String(name || '').trim().slice(0, 60); if (!t || !v || v === t.name) return false; t.name = v; if (t.recipe) t.recipe = { ...t.recipe, name: v }; touch(t); changed(); return true; },
    remove(id) { const i = db.types.findIndex(t => t.id === id); if (i < 0) return null; const [t] = db.types.splice(i, 1); db.dirty = db.dirty.filter(x => x !== id); if (!db.gone.includes(id)) db.gone.push(id); changed(); return t; },
    restore(t) { if (!t || db.types.some(x => x.id === t.id)) return; db.types.push(t); db.gone = db.gone.filter(x => x !== t.id); touch(t); changed(); },
    sync
  };
}
