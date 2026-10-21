// The team's street rule sheets in the browser (lib/rulesheet.mjs): one per jurisdiction, kept on this device and shared
// with the team through /api/rulesheets, the way the building library is (src/teamlib.js). A plan in a place the team
// has read already uses its sheet without asking the AI again; a value confirmed or edited on one plan is the team's.
// When sharing isn't set up on the site yet (no table, no secret key), the sheets stay on this device and Settings says so.
import { sheetIn } from './lib/rulesheet.mjs';

const KEY = 'fs-rule-sheets-v1', CODE_KEY = 'fs-team-code', NAME_KEY = 'fs-team-name';
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };

// onChange: called after anything changes (a save here, or the team's copy arriving)
export function ruleSheets({ onChange = () => {} } = {}) {
  let db = load(), syncing = false, syncT = 0;
  const st = { shared: null, why: '' }; // shared: true once the server has answered, false when it isn't set up (this device only), null before
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return { sheets: (d.sheets || []).map(sheetIn).filter(Boolean), dirty: d.dirty || [], gone: d.gone || [] }; } catch (e) { return { sheets: [], dirty: [], gone: [] }; } }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* full: kept for this visit */ } };
  const changed = () => { persist(); try { onChange(); } catch (e) { console.warn('rule sheets', e); } clearTimeout(syncT); syncT = setTimeout(sync, 800); };
  async function sync() {
    if (syncing || typeof navigator !== 'undefined' && navigator.onLine === false) return; syncing = true;
    const h = { 'Content-Type': 'application/json', 'x-field-code': get(CODE_KEY) }, off = async r => { const d = await r.json().catch(() => ({})); st.shared = r.status === 503 || r.status === 401 || r.status === 404 || r.status === 405 ? false : st.shared; st.why = r.status === 401 ? 'passcode' : d.local || r.status === 404 ? 'setup' : 'offline'; };
    try {
      if (db.dirty.length || db.gone.length) {
        const sent = db.sheets.filter(s => db.dirty.includes(s.key)).map(s => [s.key, s.updated]), gone = db.gone.slice();
        const r = await fetch('api/rulesheets', { method: 'POST', headers: h, body: JSON.stringify({ sheets: db.sheets.filter(s => db.dirty.includes(s.key)), deletes: gone, name: get(NAME_KEY) }) });
        if (!r.ok) { await off(r); return; }
        db.dirty = db.dirty.filter(k => !sent.some(([i, u]) => i === k && db.sheets.find(s => s.key === k)?.updated === u)); db.gone = db.gone.filter(k => !gone.includes(k));
      }
      const r = await fetch('api/rulesheets', { headers: h }); if (!r.ok) { await off(r); return; }
      const d = await r.json(); st.shared = true; st.why = '';
      for (const k of d.deleted || []) { const i = db.sheets.findIndex(s => s.key === k); if (i >= 0 && !db.dirty.includes(k)) db.sheets.splice(i, 1); }
      for (const s0 of d.sheets || []) { const s = sheetIn(s0); if (!s || db.dirty.includes(s.key) || db.gone.includes(s.key)) continue;
        const i = db.sheets.findIndex(x => x.key === s.key); if (i < 0) db.sheets.push(s); else if (Date.parse(s.updated) > Date.parse(db.sheets[i].updated)) db.sheets[i] = s; }
    } catch (e) { st.shared = st.shared ?? false; st.why = 'offline'; }
    finally { syncing = false; persist(); try { onChange(); } catch (e) {} }
  }
  if (typeof window !== 'undefined') { window.addEventListener('online', sync); setTimeout(sync, 3000); }
  return {
    list: () => db.sheets.slice().sort((a, b) => a.name.localeCompare(b.name)),
    get: key => db.sheets.find(s => s.key === key) || null,
    status: () => ({ ...st, count: db.sheets.length, pending: db.dirty.length + db.gone.length }),
    // a sheet saved (one for the same place replaced); returns the saved sheet, or null when it isn't one
    save(s0) { const s = sheetIn({ ...s0, by: s0.by || get(NAME_KEY) }); if (!s) return null; const i = db.sheets.findIndex(x => x.key === s.key); if (i < 0) db.sheets.push(s); else db.sheets[i] = s; db.gone = db.gone.filter(k => k !== s.key); if (!db.dirty.includes(s.key)) db.dirty.push(s.key); changed(); return s; },
    remove(key) { const i = db.sheets.findIndex(s => s.key === key); if (i < 0) return null; const [s] = db.sheets.splice(i, 1); db.dirty = db.dirty.filter(k => k !== key); if (!db.gone.includes(key)) db.gone.push(key); changed(); return s; },
    sync
  };
}
