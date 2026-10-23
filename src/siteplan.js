// Projects and site plans. From a property card (the Site plan button at the top), start a project or add the parcel to
// one, then lay out a site plan on the map: buildings, parking (stalls counted as you size it), drives, truck court,
// detention and landscape, checked against setbacks, with coverage, FAR and parking numbers. "Build with AI" turns a
// request ("25,000 sf retail strip") into a program (api/siteplan) and lib/siteplan.mjs lays out three options.
// Projects are kept on this device and shared with the team through /api/projects once it's set up. Exports DXF
// (AutoCAD, CADCraft and other CAD programs) and GeoJSON.
import * as SP from './lib/siteplan.mjs';
import { layoutOptions, refit, relayPods, netEdit, wantPods, PARAMS } from './lib/sitelayout.mjs';
import * as PF from './lib/proforma.mjs';
import { sheetHTML, planSVG } from './lib/sitesheet.mjs';
import { BUILDING_TYPES, BUILDING_GROUPS, typeById, fromType } from './lib/buildings.mjs';
import * as ED from './lib/siteedit.mjs';
import { freeRect as openArea, fitPadding, planSections } from './lib/planview.mjs';
import * as RUN from './lib/planruns.mjs';
import * as ASK from './lib/planask.mjs';
import * as K from './lib/planpick.mjs';
import * as MAP from './lib/planmap.mjs';
import * as T from './lib/sitetools.mjs';
import { netRules, codeRules, chainsOf, streetRules } from './lib/streetnet.mjs';
import * as SE from './lib/streetedit.mjs';
import * as SNm from './lib/streetnames.mjs';
import * as RSL from './lib/rulesheet.mjs';
import * as RD from './lib/render.mjs';
import * as PJ from './lib/project.mjs';
import * as PS from './lib/planset.mjs';
import * as PD from './lib/plandesign.mjs';
import * as TR from './lib/terrain.mjs';
import { PLANSET_MODEL_KEY, PLANSET_EFFORT_KEY, pickedClaude, pickedEffort } from './lib/aimodels.mjs';
import * as CU from './lib/customtypes.mjs';
import * as G from './lib/guardrails.mjs';
import * as BR from './lib/planbrief.mjs';
import * as STG from './lib/planstages.mjs';
import * as RF from './lib/sitefiles.mjs';
import { siteFiles } from './sitefiles.js';
import { teamLibrary } from './teamlib.js';
import { ruleSheets } from './rulesheets.js';
const typeOptions = (cur, team = []) => (team.length ? '<optgroup label="Team">' + team.map(t => '<option value="' + t.id + '"' + (t.id === cur ? ' selected' : '') + '>' + t.name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>').join('') + '</optgroup>' : '') + BUILDING_GROUPS.map(g => '<optgroup label="' + g + '">' + BUILDING_TYPES.filter(t => t.group === g).map(t => '<option value="' + t.id + '"' + (t.id === cur ? ' selected' : '') + '>' + t.name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>').join('') + '</optgroup>').join(''); // the building library, grouped
import { areaMap } from './reportkit.js';
import { readJSON } from './lib/http.mjs';
import { withTileParcel } from './lib/footprint.mjs';

const KEY = 'fs-projects-v1', CODE_KEY = 'fs-team-code', NAME_KEY = 'fs-team-name';
const ADD = ['building', 'pad', 'parking', 'garage', 'drive', 'truck', 'roundabout', 'loop', 'pond', 'green', 'play', 'court', 'pool', 'patio', 'trash', 'sign'];
const ADD_LABEL = { roundabout: 'Roundabout', loop: 'Drop-off loop (circle drive)', sign: 'Monument sign', pad: 'Restaurant pad (drive-thru)', play: 'Playground', court: 'Courts', pool: 'Pool', patio: 'Outdoor seating', garage: 'Parking garage' };
// the pieces you can add, grouped the same way in the panel's Add section and the tool strip's Add palette
const ADD_GROUPS = [['Buildings', ['building', 'pad', 'garage']], ['Paving', ['parking', 'drive', 'truck', 'roundabout', 'loop']], ['Water & landscape', ['pond', 'green']], ['Amenities', ['play', 'court', 'pool', 'patio']], ['Site', ['trash', 'sign']]];
const ADD_SHORT = { building: 'Building', pad: 'Restaurant pad', garage: 'Garage', parking: 'Parking', drive: 'Drive', truck: 'Truck court', roundabout: 'Roundabout', loop: 'Drop-off', pond: 'Detention', green: 'Landscape', play: 'Playground', court: 'Courts', pool: 'Pool', patio: 'Seating', trash: 'Trash', sign: 'Sign' };
const SIZE = { roundabout: [100, 100], loop: [120, 70], building: [120, 100], parking: [180, 60], drive: [26, 80], truck: [200, 130], pond: [120, 80], green: [40, 40], trash: [24, 12], sign: [10, 5], pad: [44, 50], garage: [180, 120], patio: [30, 20], play: [64, 48], court: [64, 44], pool: [60, 30] };
const PAVED = ['parking', 'drive', 'truck'];
const FORMS = [['bar', 'Bar'], ['L', 'L-shaped'], ['U', 'Courtyard (U)'], ['tower', 'Tower on a podium']];
const ISLANDS = [['along', 'Along the street'], ['across', 'Across the street (toward the store)']]; // which way a canopy's pump islands run
const { COL, USE_COL } = MAP; // one palette for the map, the Plan key and the Draw buttons (lib/planmap.mjs)
// a simple line icon for each piece you can add (24 × 24, currentColor), and its accent from the map's palette: the panel's
// Add tiles and the tool strip's Add palette share them
export const ADD_ICON = Object.fromEntries(Object.entries({
  building: '<rect x="5" y="3.5" width="14" height="17" rx="1"/><path d="M8.5 7.5h2M13.5 7.5h2M8.5 11h2M13.5 11h2M8.5 14.5h2M13.5 14.5h2M10.5 20.5v-2.5h3v2.5"/>',
  pad: '<rect x="3.5" y="4" width="10" height="9" rx="1"/><path d="M13.5 8.5h2.5a4 4 0 0 1 4 4v1.5a6.5 6.5 0 0 1-6.5 6.5H3.5"/><path d="M6.5 16.5h6" stroke-dasharray="1.6 1.6"/>',
  garage: '<rect x="4" y="4" width="16" height="4.2" rx="1"/><rect x="4" y="9.9" width="16" height="4.2" rx="1"/><rect x="4" y="15.8" width="16" height="4.2" rx="1"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16.5v-9h3a2.5 2.5 0 0 1 0 5h-3"/>',
  drive: '<path d="M8.5 3.5 5 20.5M15.5 3.5l3.5 17"/><path d="M12 4.5V7M12 10.5v3M12 17v3"/>',
  roundabout: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5V6M12 18v3.5M2.5 12H6"/>',
  loop: '<rect x="8.5" y="3.5" width="7" height="5" rx=".8"/><path d="M5.5 20.5V14a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v6.5"/><path d="M2.5 20.5h19"/>',
  truck: '<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/>',
  pond: '<path d="M3 9.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0M3 14.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/>',
  green: '<path d="M5 19.5C5 11 10 5.5 19.5 4.5 19 14 13.5 19.5 5 19.5z"/><path d="M5 19.5l8.5-8.5"/>',
  play: '<path d="M5 20.5V4.5M9 20.5V4.5M5 8.5h4M5 12.5h4M5 16.5h4"/><path d="M9 6c4 0 5.5 3 7 7s2.5 7 4.5 7.5"/>',
  court: '<rect x="3.5" y="5.5" width="17" height="13" rx="1"/><path d="M12 3.5v17"/><path d="M7.5 5.5v13M16.5 5.5v13" stroke-dasharray="1.6 1.6"/>',
  pool: '<path d="M8 16.5V6a2 2 0 0 1 4 0M14 16.5V6a2 2 0 0 1 4 0M8 9.5h6M8 13h6"/><path d="M3 19.5c1.5-1.1 3-1.1 4.5 0s3 1.1 4.5 0 3-1.1 4.5 0 3 1.1 4.5 0"/>',
  patio: '<path d="M3.5 9 12 4.5 20.5 9z"/><path d="M12 9v11.5M8 20.5h8M6.5 14.5h11"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5"/><path d="M10 10.5V17M14 10.5V17"/>',
  sign: '<path d="M3.5 19.5h17M5.5 19.5v-8h13v8"/><path d="M8 11.5V8.5h8v3M9 15.5h6"/>'
}).map(([k, d]) => [k, '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>']));
export const addAccent = k => k === 'pad' ? USE_COL.restaurant : k === 'roundabout' || k === 'loop' ? COL.drive : COL[k] || COL.building;
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const PS_PICK = { model: () => pickedClaude(get(PLANSET_MODEL_KEY)), effort: () => pickedEffort(get(PLANSET_EFFORT_KEY)) }; // Settings › AI model › Plan sets
// Ultra's mark (the effort levels under Build): a four-point spark and a small one beside it
const SPARK = '<svg class="sp-spark" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 1.5c.45 3.35 1.95 4.85 5.3 5.3-3.35.45-4.85 1.95-5.3 5.3-.45-3.35-1.95-4.85-5.3-5.3C5.05 6.35 6.55 4.85 7 1.5z"/><path fill="currentColor" opacity=".7" d="M13 10.3c.17 1.25.73 1.8 1.97 1.97-1.24.17-1.8.72-1.97 1.97-.17-1.25-.73-1.8-1.97-1.97 1.24-.17 1.8-.72 1.97-1.97z"/></svg>';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const t = s => Date.parse(s || 0) || 0;
const clone = o => JSON.parse(JSON.stringify(o));

export function initSitePlan(ctx) {
  const { map, esc, fmtN } = ctx, card = ctx.card, root = document.getElementById('view-projects');
  let db = load(), ed = null, shared = null, syncT = 0, syncing = false, raf = 0;
  const f0 = v => (Math.round(v) || 0).toLocaleString('en-US'), pct = v => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
  // the numbers and checks of a plan, under the Waller guardrails when they're on for it (lib/guardrails.mjs); exactly
  // lib/siteplan.mjs's for every other plan
  const GM = x => G.metrics(x), GC = x => G.check(x), GON = x => !!x && G.isOn(x);

  // ---------- storage and team sync ----------
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return { projects: d.projects || [], dirty: d.dirty || [], gone: d.gone || [] }; } catch (e) { return { projects: [], dirty: [], gone: [] }; } }
  let persistT = 0; // written a moment after the last change, not on every one (a big plan is megabytes)
  function persistNow() { clearTimeout(persistT); persistT = 0; try { localStorage.setItem(KEY, JSON.stringify(db)); saved(); return; } catch (e) { /* full: try lighter */ }
    // the browser's store is full: the saved layouts of options that aren't open keep their numbers only (each is laid out again when clicked)
    if (RUN.lightenRuns(db.projects, ed?.plid)) try { localStorage.setItem(KEY, JSON.stringify(db)); saved(); return; } catch (e) { /* still full */ }
    ctx.toast('This browser won’t let the page save projects.'); }
  function persist() { clearTimeout(persistT); persistT = setTimeout(persistNow, 600); }
  // the plan header's save status (paintSave): saved here; synced with the team once the server has it; or a failed sync
  const saved = () => { if (saveSt.kind !== 'synced' || db.dirty.includes(ed?.pid)) { saveSt.kind = saveSt.kind === 'failed' ? 'failed' : 'local'; } saveSt.at = Date.now(); paintSave(); };
  const syncSaid = ok => { if (ok === false) saveSt.kind = 'failed'; else if (ok && shared && !db.dirty.includes(ed?.pid)) { saveSt.kind = 'synced'; saveSt.at = Date.now(); } else if (ok === null && saveSt.kind === 'failed') saveSt.kind = 'local'; paintSave(); };
  window.addEventListener('pagehide', () => { if (persistT) persistNow(); });
  function save(p) {
    if (p) { p.updated = new Date().toISOString(); p.by = get(NAME_KEY) || p.by || ''; if (!db.dirty.includes(p.id)) db.dirty.push(p.id); }
    persist(); badge(); if (ctx.view === 'projects') render();
    clearTimeout(syncT); syncT = setTimeout(sync, 1500);
  }
  async function sync() {
    if (syncing || !navigator.onLine) return; syncing = true;
    const h = { 'Content-Type': 'application/json', 'x-field-code': get(CODE_KEY) };
    try {
      if (db.dirty.length || db.gone.length) {
        const sent = db.projects.filter(p => db.dirty.includes(p.id)).map(p => [p.id, p.updated]), gone = db.gone.slice();
        const r = await fetch('api/projects', { method: 'POST', headers: h, body: JSON.stringify({ projects: db.projects.filter(p => db.dirty.includes(p.id)).map(p => RUN.syncCopy(p)), deletes: gone, name: get(NAME_KEY) }) });
        if (!r.ok) { shared = r.status === 503 || r.status === 401 ? false : shared; syncSaid([401, 404, 405, 503].includes(r.status) ? null : false); return; } // not set up: this device only
        db.dirty = db.dirty.filter(id => !sent.some(([i, u]) => i === id && db.projects.find(p => p.id === id)?.updated === u)); db.gone = db.gone.filter(id => !gone.includes(id));
      }
      const r = await fetch('api/projects', { headers: h }); if (!r.ok) { shared = r.status === 503 || r.status === 401 ? false : shared; syncSaid([401, 404, 405, 503].includes(r.status) ? null : false); return; }
      const d = await r.json(); shared = true; let changed = false; syncSaid(true);
      for (const id of d.deleted || []) { const i = db.projects.findIndex(p => p.id === id); if (i >= 0 && !db.dirty.includes(id) && ed?.pid !== id) { db.projects.splice(i, 1); changed = true; } }
      for (const p of d.projects || []) {
        const i = db.projects.findIndex(x => x.id === p.id); if (ed?.pid === p.id || db.dirty.includes(p.id)) continue;
        if (i < 0) { db.projects.push(p); changed = true; } else if (t(p.updated) > t(db.projects[i].updated)) { db.projects[i] = p; changed = true; }
      }
      if (changed) { persist(); badge(); if (ctx.view === 'projects') render(); }
    } catch (e) { syncSaid(false); /* offline: try again on the next change or when back online */ }
    finally { syncing = false; if (ctx.view === 'projects') render(); }
  }
  window.addEventListener('online', sync);
  setTimeout(sync, 4000);
  function badge() { ctx.setBadge?.('projects', db.projects.length); } // a muted count beside the Projects sub-tab
  badge();

  // ---------- the team's building library (src/teamlib.js): Save to Library, the Team group, rename and delete ----------
  const TL = teamLibrary({ onChange: () => teamRefresh() });
  const RS = ruleSheets({ onChange: () => { if (ed && card.classList.contains('sp-mode') && !card.querySelector('.sp-rules :focus')) rulesRefresh(); } }); // the team's street rule sheets (lib/rulesheet.mjs), one per place
  // ---------- a project's reference files (src/sitefiles.js): the project page's Files tab; confirmed facts go to the AI ----------
  const SF = siteFiles({ ctx, esc, project: id => db.projects.find(x => x.id === id), save: p => save(p), render: () => { if (ctx.view === 'projects') render(true); }, library: TL, when: s => when(s),
    optionsOf: p => (p?.plans || []).filter(pl => pl.ring.length >= 3).map(pl => ({ id: pl.id, name: pl.name, kos: pl.elements.filter(e => e.kind === 'keepout').map(e => e.name) })), addEasement: (p, plid, x, file) => easementFrom(p, plid, x, file) });
  // a confirmed easement (its width and the side of the lot it runs along) drawn on an option as a no-build area: a strip
  // inside that lot line (lib/sitefiles.mjs easementStrip). The layouts then keep off it, like one drawn by hand.
  function easementFrom(p, plid, x, file) {
    const pl = p.plans.find(q => q.id === plid); if (!pl || pl.ring.length < 3) throw new Error('That option has no site drawn yet.');
    const pts = RF.easementStrip(pl.ring, x.side, x.widthFt, Number.isInteger(pl.front) ? pl.front : SP.longestEdge(pl.ring));
    if (!pts) throw new Error('Couldn’t fit a ' + x.widthFt + ' ft strip along the ' + x.side + ' side of ' + pl.name + '. Open it and draw the easement by hand (Add › Easement).');
    const err = T.areaError(pl, pts, 'keepout'); if (err) throw new Error(err);
    const e = { ...T.areaPiece(pl, 'keepout', pts, uid()), name: String(x.label || 'Easement').slice(0, 60), note: 'From ' + String(file || 'a reference file').slice(0, 60) + ': check against the survey' };
    if (ed && ed.pid === p.id && ed.plid === plid) change(q => { q.elements.push(e); }); // the option is open: one undo step, drawn now
    else { pl.elements.push(e); pl.updated = new Date().toISOString(); save(p); }
    return x.label + ' is drawn on ' + pl.name + ' along the ' + x.side + ' side (' + x.widthFt + ' ft). Re-fit the plan to lay the rest out around it.';
  }
  const AIS_TIP = 'Sized by the AI from typical practice, not a product sheet: check it against the real building before relying on it';
  const teamTypes = () => TL.list().map(CU.libraryTypeOf); // the Team group, as library types
  const anyType = id => String(id || '').startsWith('team:') ? (t => t ? CU.libraryTypeOf(t) : null)(TL.get(String(id).slice(5))) : typeById(id);
  const fromAny = (t, at, rot) => ({ ...fromType(t, at, rot), ...(t.custom ? { custom: t.custom } : {}), ...(t.aiSized ? { aiSized: true } : {}) });
  const tlSize = t => t.w + ' × ' + t.d + ' ft' + (t.floors > 1 ? ' · ' + t.floors + '-story' : '') + (t.recipe ? ' · ' + [CU.PATTERNS[t.recipe.pattern]?.label.toLowerCase(), ...t.recipe.figures.slice(0, 2)].filter(Boolean).join(' · ') : '');
  const tlSaved = t => 'Saved by ' + (t.by || 'someone on this device') + ' · ' + new Date(t.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const tlWhere = () => { const s = TL.status(); return s.shared ? 'Shared with your team' : s.shared === false ? (s.why === 'passcode' ? 'On this device only: enter the team passcode (Settings) to share them' : s.why === 'setup' ? 'On this device only: the team library isn’t set up on this site yet' : 'On this device for now: they go to the team when it’s back online') : 'Saved on this device; sharing with the team…'; };
  function teamHtml() {
    const list = TL.list();
    if (!list.length) return '<div class="sp-team" id="spTeamLib"><div class="sp-sub">Team library</div><div class="rnote">Nothing saved yet: select a building and press <b>Save to Library</b> (an AI-crafted type saves with its recipe). ' + esc(tlWhere()) + '.</div></div>';
    return '<details class="sp-team" id="spTeamLib"' + (ed.teamOpen === false ? '' : ' open') + '><summary class="sp-sub">Team library · ' + list.length + '</summary><div class="rnote sp-1l">' + esc(tlWhere()) + '.</div><ul class="sp-tl">' + list.map(t =>
      '<li data-tl="' + esc(t.id) + '"><span class="sp-tl-h">' + (ed.tlEdit === t.id ? '<input type="text" maxlength="60" data-tlname="' + esc(t.id) + '" value="' + esc(t.name) + '" aria-label="New name for ' + esc(t.name) + '">' : '<b>' + esc(t.name) + '</b>') + (t.recipe?.ai ? '<i class="sp-ais" title="' + esc(AIS_TIP) + '">AI-sized</i>' : '') + '</span>' +
      '<small>' + esc(tlSize(t)) + '</small><small>' + esc(tlSaved(t)) + '</small><span class="sp-tl-a"><button type="button" class="btn sm" data-tladd="' + esc(t.id) + '" title="Add one to the plan">Add</button>' + (t.recipe ? '<button type="button" class="btn sm" data-tlbuild="' + esc(t.id) + '" title="Lay out another one with Build: the AI is given this recipe">Build One</button>' : '') +
      '<button type="button" class="btn sm ghost" data-tlren="' + esc(t.id) + '">Rename</button><button type="button" class="btn sm ghost sp-del" data-tldel="' + esc(t.id) + '">Delete</button></span></li>').join('') + '</ul></details>';
  }
  function wireTeam() {
    const box = card.querySelector('#spTeamLib'); if (!box) return;
    if (box.tagName === 'DETAILS') box.ontoggle = () => { ed.teamOpen = box.open; };
    box.querySelectorAll('[data-tladd]').forEach(b => b.onclick = () => { const t = anyType('team:' + b.dataset.tladd); if (t) { ed.editing = true; addType(t); } });
    box.querySelectorAll('[data-tlbuild]').forEach(b => b.onclick = () => { const t = TL.get(b.dataset.tlbuild); if (t) { fillAsk('Another ' + t.name.toLowerCase() + ' like the one in our team library', true); card.querySelector('#spAiSec')?.scrollIntoView({ block: 'nearest' }); } });
    box.querySelectorAll('[data-tlren]').forEach(b => b.onclick = () => { ed.tlEdit = b.dataset.tlren; teamRefresh(); const i = card.querySelector('[data-tlname]'); if (i) { i.focus(); i.select(); } });
    box.querySelectorAll('[data-tlname]').forEach(i => { const done = ok => { if (ed.tlEdit !== i.dataset.tlname) return; ed.tlEdit = null; if (ok) TL.rename(i.dataset.tlname, i.value); teamRefresh(); };
      i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); done(false); } }; i.onblur = () => done(true); });
    box.querySelectorAll('[data-tldel]').forEach(b => b.onclick = () => { const t = TL.remove(b.dataset.tldel); if (t) ctx.toast('Deleted “' + t.name + '” from the team library.', { action: { label: 'Undo', run: () => TL.restore(t) } }); });
  }
  // the library's own pieces of the panel, after a save, a rename or the team's copy arriving (not the whole panel: a box being typed in keeps its focus)
  function teamRefresh() {
    if (!ed || !card.classList.contains('sp-mode')) return;
    const box = card.querySelector('#spTeamLib'); if (box) { box.outerHTML = teamHtml(); wireTeam(); }
    const lib = card.querySelector('#spLib'); if (lib && document.activeElement !== lib) lib.innerHTML = '<option value="">Pick a building type to add…</option>' + typeOptions('', teamTypes());
    const n = card.querySelector('.sp-lib small'); if (n) n.textContent = (BUILDING_TYPES.length + TL.list().length) + ' types';
  }
  // Save to Library: a building on the plan (its size, use and type; with its recipe when it is part of an AI-crafted type), or the whole AI-crafted type
  const libSaved = t => ctx.toast('Saved “' + t.name + '” to the team library' + (TL.status().shared === false ? ' on this device (the team library isn’t shared on this site yet)' : '') + '.');
  function saveToLib(e) { const pl = PL(); if (!pl || !e) return; const t = CU.teamTypeFrom(e, pl.program, { id: 'b' + uid() }); const s = t && TL.save(t); if (s) libSaved(s); }
  function saveTypeToLib() { const pl = PL(), cs = pl && CU.customStats(pl); if (!cs) return; const r = cs.recipe, b = r.buildings.slice().sort((x, y) => y.w * y.d - x.w * x.d)[0];
    const s = TL.save({ name: r.name, w: b.w, d: b.d, floors: b.floors, use: 'other', note: r.name, recipe: r, source: 'ai' }); if (s) libSaved(s); }

  const P = () => db.projects.find(p => p.id === ed?.pid), PL = () => P()?.plans.find(x => x.id === ed?.plid) || (ed?.draftPlan && ed.draftPlan.id === ed.plid ? ed.draftPlan : undefined); // a draft isn't in the project until its site is finished
  // the next option's name: the next letter not already used (after a delete, Copy or New Option never repeats a name)
  const nextName = p => SP.nextOptionName(p.plans);
  const newPlan = (p, extra = {}) => ({ id: uid(), name: nextName(p), origin: null, ring: [], src: null, front: null, frontGuess: true, setbacks: { ...SP.SETBACKS }, program: { use: 'retail' }, zoning: null, elements: [], created: new Date().toISOString(), ...extra });
  const parcelKey = pc => pc.propId ? 'pid:' + pc.propId : 'pt:' + pc.center.map(v => v.toFixed(5)).join(',');
  // one account can be several separate pieces (31807 King Ln, Waller account 13814: two records, two outlines): the first
  // piece keeps the account's key, another piece of it adds where it is, so both stay in the project and the site
  const samePiece = (a, b) => !a.geometry || !b.geometry || inGeom(a.center, b.geometry) || inGeom(b.center, a.geometry);
  const keyIn = (rec, pool) => { if (pool.some(x => x !== rec && x.key === rec.key && !samePiece(x, rec))) rec.key = parcelKey(rec) + '~' + rec.center.map(v => v.toFixed(5)).join(','); return rec; };

  // ---------- starting from a property card ----------
  // info: { center, title, parcel } from a property card, or { center, title, parcels: [...] } from the card's All tab
  const MAXP = 20;
  const llRound = g => g && JSON.parse(JSON.stringify(g, (k, v) => typeof v === 'number' ? +v.toFixed(7) : v));
  // a parcel's acres: every piece of it (a parcel drawn across map tiles comes in pieces, side by side), holes taken out
  const geomAcres = (g, at) => { const F = SP.frame(at), polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.reduce((t, rs) => t + SP.ringArea(rs[0].map(F.toFt)) - rs.slice(1).reduce((h, r) => h + SP.ringArea(r.map(F.toFt)), 0), 0) / 43560; };
  const parcelOf = (pc, center) => { const g = pc.geometry, r = g && (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates?.[0]?.[0]); const cc = r ? SP.centroid(r) : center;
    const rec = { key: '', label: pc.situs || pc.owner || 'Parcel', owner: pc.owner || '', propId: pc.propId || null, marketValue: pc.marketValue || null, landValue: pc.landValue || null, acres: g ? +(geomAcres(g, center)).toFixed(3) : null, center: cc.map(v => +v.toFixed(6)), geometry: llRound(g) || null };
    rec.key = parcelKey(rec); return rec; };
  // the site boundary for a set of parcels (one outline, or several merged). Parcels that don't touch are joined across
  // the gap between them (SP.bridgeParcels): filled in as site, or, where the map shows a road in it, kept as a no-build
  // road strip (gapPieces)
  function siteOf(recs) { const g = recs.map(r => r.geometry).filter(Boolean); if (g.length < 2) return g.length ? { ...SP.boundaryFrom(g[0], recs[0].center), pieces: 1, strips: [] } : null;
    const br = SP.bridgeParcels(g, { roads: mapRoads() }), u = SP.unionParcels(br.geoms); return u && { ...u, strips: br.strips }; }
  // the map's streets (lon/lat lines) where its tiles are loaded (the same classes detectFront counts as streets)
  function mapRoads() {
    const s = map.getStyle?.()?.sources || {}, src = Object.keys(s).find(id => s[id].type === 'vector' && /maptiler|openmaptiles|planet/i.test(id + (s[id].url || ''))), out = []; if (!src) return out;
    try { for (const f of map.querySourceFeatures(src, { sourceLayer: 'transportation' })) { if (/path|track|rail|transit|ferry|cable|bridleway|pier|service|raceway/.test(f.properties?.class || '')) continue;
      const g = f.geometry; for (const c of g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []) out.push(c); } } catch (e) {}
    return out; }
  // the road strips between parcels as no-build areas on a plan whose site is b (the ones in the site: a strip between
  // two parcels left out isn't); marked gap so a change of parcels replaces them. Gaps without a road are just site.
  function gapPieces(b, pl) {
    const F = SP.frame(b.origin), out = [], roads = (b.strips || []).filter(s => s.road);
    for (const s of roads) { const pts = s.ll.slice(0, -1).map(F.toFt); if (!SP.inRing(SP.centroid(pts), b.ring)) continue;
      const e = T.areaPiece({ ...pl, ring: b.ring, elements: out }, 'keepout', pts, uid());
      out.push({ ...e, name: 'Road between parcels' + (roads.length > 1 ? ' ' + (out.length + 1) : ''), note: 'About ' + s.gapFt + ' ft wide, with a road on the map, and not in the parcels picked, so nothing is built or paved on it. Delete it if the road is being closed or the land is yours to build on.', gap: true }); }
    return out; }
  const gapNote = b => { const st = b?.strips || [], fill = st.filter(s => !s.road), road = st.filter(s => s.road), w = l => Math.max(...l.map(s => s.gapFt));
    return (fill.length ? '<div class="rnote">The gaps between parcels that border each other (up to ' + w(fill) + ' ft in the county’s outlines) are filled in as part of the site.</div>' : '') +
      (road.length ? '<div class="rnote">' + (road.length === 1 ? 'A road runs between two of the parcels (about ' + road[0].gapFt + ' ft): it’s' : road.length + ' roads run between the parcels: they’re') + ' in the site as a no-build area, so every parcel is in.</div>' : ''); };
  // Projects › a project › Find a Parcel: that project waits for the parcel picked next (for 10 minutes, or until used)
  let pending = null;
  const pendingProject = () => { const x = pending && Date.now() - pending.t < 6e5 && db.projects.find(p => p.id === pending.id); if (!x) pending = null; return x || null; };
  const newProject = name => { const p = { id: uid(), name, notes: '', parcels: [], plans: [], created: new Date().toISOString(), by: get(NAME_KEY) }; db.projects.push(p); return p; };
  // what an option holds, in a few words: "25,000 sf", "200 units", "nothing laid out yet"
  const holds = (p, pl) => { if (!pl) return 'no options yet'; const { drawn, m } = info(p, pl); return !drawn ? 'no site drawn yet' : m?.units ? plural(m.units, 'unit') : m?.gfa ? f0(m.gfa) + ' sq ft' : 'nothing laid out yet'; };
  let startGhost = false;
  function start(info0) {
    const info = info0;
    let list = (info?.parcels?.length ? info.parcels : info?.parcel ? [info.parcel] : []).slice(0, MAXP);
    if (!info?.center && !list.length) { ctx.toast('Open a parcel first: click a building or open ground at street zoom.'); return; }
    const rg = ctx.lastRegrid?.geom, center = info.center || list[0]?.center;
    if (list.length <= 1 && !list[0]?.geometry && rg && inGeom(center, rg)) list = [{ ...(list[0] || {}), geometry: rg, regrid: true }]; // Harris and Waller: Regrid's outline
    const recs = list.map(pc => parcelOf(pc, pc.center || center)); recs.forEach((r, i) => keyIn(r, recs.slice(0, i)));
    const b = siteOf(recs), many = recs.length > 1;
    const label = many ? recs.length + ' parcels' + (recs[0].label ? ' · ' + recs[0].label : '') : recs[0]?.label || info.title || 'Site';
    const acres = b ? SP.ringArea(b.ring) / 43560 : null, noGeom = recs.filter(r => !r.geometry).length;
    // the projects these parcels are already in (newest first), and a project waiting for a parcel (Find a Parcel)
    const have = RUN.projectsWith(db.projects, recs.map(r => r.key)).slice(0, 3), want = pendingProject(), first = !db.projects.length;
    const pre = want || have[0]?.p || null;
    const recent = db.projects.slice().sort((x, y) => t(y.updated) - t(x.updated)).slice(0, 8);
    for (const x of [pre, ...have.map(h => h.p)]) if (x && !recent.includes(x)) recent.unshift(x);
    if (ed) close();
    ctx.clearSelection?.();
    const back = info.title && !/^Loading/.test(info.title) ? info.title : recs[0]?.label || 'Property';
    // started from a property card: that card waits behind the plan ("← address" in the header, and × goes back to it)
    const radio = (id, html, on) => '<label class="sp-radio"><input type="radio" name="spP" value="' + esc(id) + '"' + (on ? ' checked' : '') + '> ' + html + '</label>';
    const paint = () => { card.innerHTML = '<div class="top"><div><div class="kicker">Site Plan</div><h2>' + (want ? 'Add a parcel to ' + esc(want.name) : have.length ? 'Site plan' : 'Start a site plan') + '</h2><div class="bsub">' + esc(label) + (acres ? ' · ' + acres.toFixed(2) + ' acres' : '') + '</div></div>' + xBtn() + '</div>' +
      (have.length ? '<div class="bsec sp-haves">' + have.map(({ p, plan }) => '<div class="sp-have"><div class="sp-have-t"><b>Already in ' + esc(p.name) + '</b><span>' + (plan ? esc(plan.name) + ' · ' + holds(p, plan) : 'no options yet') + (p.plans.length > 1 ? ' · ' + plural(p.plans.length, 'option') : '') + '</span></div>' +
        '<span class="btnrow">' + (plan ? '<button type="button" class="btn sm primary" data-openplan="' + esc(p.id) + '|' + esc(plan.id) + '">Open Plan</button>' : '') + '<button type="button" class="btn sm" data-newin="' + esc(p.id) + '" title="Start a new option in ' + esc(p.name) + '">New Option</button></span></div>').join('') + '</div>' : '') +
      '<div class="bsec sp-start"><div class="lt sp-lt-proj">' + (have.length ? 'Or start another plan' : 'Project') + '</div>' +
      radio('', 'New project <input id="spName" class="sp-in" value="' + esc(recs[0]?.label || label) + '" aria-label="Project name">', !pre) +
      recent.map(p => radio(p.id, 'Add to <b>' + esc(p.name) + '</b> <span class="rnote">' + p.plans.length + ' plan' + (p.plans.length === 1 ? '' : 's') + (have.some(h => h.p === p) ? ' · has this parcel' : p === want ? ' · waiting for a parcel' : '') + '</span>', p === pre)).join('') +
      '<div class="lt sp-lt-site" style="margin-top:12px">Site</div><div class="rnote">' + (b ? (many ? recs.length + ' parcel outlines from the county appraisal district, merged into one site (small gaps and overlaps between them are closed up, and parcels apart are joined over the gap between them).' : 'The parcel outline from ' + (list[0]?.regrid ? 'Regrid' : 'the county appraisal district') + ', dashed on the map.') + ' You can add or remove parcels, or redraw the site, in the plan.' : 'There’s no parcel outline here (in Harris and Waller County, use “Get owner, value &amp; zoning from Regrid” on the property card first). You’ll draw the site on the map.') + '</div>' +
      gapNote(b) + (b?.pieces > 1 ? '<div class="rnote sp-warn">Some parcels are more than ' + SP.BRIDGE_FT + ' ft from the rest, so they’re left out of the site.</div>' : '') +
      (noGeom && b ? '<div class="rnote sp-warn">' + noGeom + ' of the parcels have no outline from the county and are left out.</div>' : '') +
      '<div class="bacts" style="padding:12px 0 0"><button class="btn askai" id="spStart">Start Site Plan</button><button class="btn" id="spBack">Back</button></div></div>';
      card.classList.add('open'); card.scrollTop = 0; };
    if (ctx.cardPush && card.classList.contains('open') && !ed) ctx.cardPush(null, back, paint); else paint();
    fromCard = ctx.cardChild?.() === 'open' ? back : '';
    // the site on the map while choosing: its outline, dashed, fitted in the open part of the map
    if (b) { const site = { origin: b.origin, ring: b.ring }; ghost(site); startGhost = true; requestAnimationFrame(() => planFit(site));
      if (phone()) setTimeout(() => { if (startGhost && !ed) planFit(site); }, 420); } // again once the phone sheet has come up
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#spBack').onclick = () => { if (!(ctx.cardChild?.() === 'open' && ctx.cardBack?.())) ctx.openBuildingAt(center); };
    const begin = p => {
      for (const r of recs) { keyIn(r, p.parcels); const i = p.parcels.findIndex(x => x.key === r.key); if (i < 0) p.parcels.push(r); else if (!p.parcels[i].geometry && r.geometry) p.parcels[i] = r; }
      for (const x of p.parcels) regridOn(x); // the address city and zoning, when Regrid was fetched on the card
      if (pending?.id === p.id) pending = null; // used
      const z = ctx.lastRegrid?.zoning && list.some(x => x.regrid) ? zoningOf(ctx.lastRegrid.zoning) : null;
      const plan = newPlan(p, b ? { origin: b.origin, ring: b.ring, src: many ? 'parcels' : list[0]?.regrid ? 'regrid' : 'parcel', parcel: recs[0].key, parcels: recs.map(r => r.key), zoning: z } : { parcel: recs[0]?.key, parcels: recs.map(r => r.key), origin: center });
      if (b) plan.elements = gapPieces(b, plan);
      p.plans.push(plan); save(p); open(p.id, plan.id, { draw: !b });
    };
    card.querySelector('#spStart').onclick = () => {
      const pick = card.querySelector('input[name=spP]:checked').value;
      begin(db.projects.find(x => x.id === pick) || newProject(card.querySelector('#spName').value.trim() || label));
    };
    card.querySelectorAll('[data-openplan]').forEach(x => x.onclick = () => { const [pid, plid] = x.dataset.openplan.split('|'), o = planOf({ pid, plid }); if (o) open(pid, plid, { draw: o.pl.ring.length < 3 }); });
    card.querySelectorAll('[data-newin]').forEach(x => x.onclick = () => { const p = db.projects.find(y => y.id === x.dataset.newin); if (p) begin(p); });
    if (first) card.querySelector('#spStart').click(); // no projects yet: nothing to choose, so the project (named after the address) is made and the plan opens
    return true;
  }
  const inGeom = (pt, g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).some(p => SP.inRing(pt, p[0]));
  const zoningOf = z => Object.fromEntries(['zoning', 'zoning_description', 'max_far', 'max_coverage_pct', 'max_building_height_ft', 'max_density_du_per_acre'].filter(k => z[k] != null && z[k] !== '').map(k => [k, z[k]]));
  // Regrid's record for a parcel, when someone fetched it on that parcel's property card (src/regrid.js): its address city
  // and zoning are kept on the parcel for the project page's Jurisdiction card. Says whether anything changed.
  const regridOn = rec => { const R = ctx.lastRegrid; if (!R?.center || !rec?.geometry || !inGeom(R.center, rec.geometry)) return false;
    const v = { city: R.city || null, zoning: R.zoning ? zoningOf(R.zoning) : null }; if (rec.regrid && JSON.stringify([rec.regrid.city, rec.regrid.zoning]) === JSON.stringify([v.city, v.zoning])) return false;
    rec.regrid = { ...v, at: new Date().toISOString().slice(0, 10) }; return true; };
  const xBtn = () => '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>';

  // ---------- the editor ----------
  // Planning is its own workspace: the left list folds away, the area tools, filters and layer chips step aside, the plan
  // gets the map, and the property card's selection highlight is hidden under it. All of it is put back on close.
  const app = document.querySelector('.app'), phone = () => matchMedia('(max-width:700px)').matches;
  const HIDE = ['fs-bldg', 'fs-bglow', 'fs-bsel', 'fs-bhov', 'fs-psel', 'fs-bnumc', 'fs-bnum']; // the plan replaces what's there
  let hidden = null, planState = null, leaving = false, fromCard = '', lastOpen = null;
  function hideMapBits() { hidden = hidden || {}; for (const id of HIDE) if (map.getLayer(id)) { if (!(id in hidden)) hidden[id] = map.getLayoutProperty(id, 'visibility') || 'visible'; map.setLayoutProperty(id, 'visibility', 'none'); } }
  function showMapBits() { for (const [id, v] of Object.entries(hidden || {})) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v); hidden = null; }
  function enterPlanning() {
    app.classList.add('planning');
    if (ctx.mode && ctx.mode() !== 'pan') ctx.setMode?.('pan'); // an area tool that was on goes off
    planState = { collapsed: !!ctx.panelCollapsed?.(), boxZoom: !!map.boxZoom?.isEnabled(), dblZoom: !!map.doubleClickZoom?.isEnabled() }; map.boxZoom?.disable(); // Shift-drag draws a selection box instead
    if (!planState.collapsed && !phone()) ctx.setPanelCollapsed?.(true);
    watchResize(); addScale(); if (phone()) ctx.foldLegend?.(true); // the Plan key starts folded on phones
  }
  function leavePlanning() {
    app.classList.remove('planning'); ro?.disconnect(); ro = null; clearTimeout(roT);
    dropScale(); ctx.foldLegend?.(null); mapUi.hidden = true; pillMode.hidden = true; modeKey = ''; keySig = ''; ctx.setLegend?.('siteplan', ''); app.style.removeProperty('--sp-above'); clearGone();
    if (planState && !!ctx.panelCollapsed?.() !== planState.collapsed) ctx.setPanelCollapsed?.(planState.collapsed); // exactly as it was
    if (planState?.boxZoom) map.boxZoom?.enable(); if (planState?.dblZoom) map.doubleClickZoom?.enable(); closePops(); closeMenu(); strip.classList.remove('open');
    planState = null;
  }
  function open(pid, plid, o = {}) {
    if (ctx.view !== 'map') ctx.setView('map');
    const switching = !!ed; // another option of the open plan: the workspace stays as it is
    clearResume(); hideAway();
    if (!switching) {
      // the building card's selection goes and the plan takes over the card, unless the plan was started from that card:
      // then it waits behind the plan ("← address" in the header) and × goes back to it
      if (card.classList.contains('open') && !(fromCard && ctx.cardChild?.() === 'open')) ctx.closeCard();
      if (ctx.cardChild?.() !== 'open') fromCard = '';
      enterPlanning();
    }
    cur = pid; renaming = false; lastOpen = { pid, plid }; if (switching && ed?.run) ctx.toast(ed.run.kind === 'build' ? 'Build cancelled' : 'Cancelled'); killRun();
    ed = { pid, plid, sel: null, multi: [], undo: [], redo: [], mode: o.draw || !(db.projects.find(x => x.id === pid)?.plans.find(x => x.id === plid)?.ring?.length >= 3) ? 'draw' : null, draft: [], variants: null, editing: false, run: null, draftPlan: o.draftPlan || null }; // editing: pieces can be moved only in Edit Layout
    restoreRun(PL()); try { autoRules(P(), PL()); } catch (e) { /* (the team's rule sheet for its place: used before the first layout) */ }
    hideMapBits();
    addLayers(); draw(); panel();
    requestAnimationFrame(() => requestAnimationFrame(() => planFit()));
    ctx.scheduleHash?.(); // sp= in the address: a reload reopens this plan
    // (street sides found before Oct 15 counted any road near any edge, so plans the person never set by hand look again once)
    const again = pl => pl.frontGuess || pl.streets == null || pl.streetsBy !== 2;
    const pl = PL(); if (pl?.ring.length >= 3 && again(pl)) map.once('idle', () => { if (PL() === pl && again(pl)) detectFront(pl); });
  }
  // the option's last build comes back with it: its layouts (the one on the map marked), the request and the AI's note
  function restoreRun(pl) {
    const r = pl?.lastRun; if (!r?.variants?.length) return;
    let vs = clone(r.variants); if (vs.some(v => !v.key)) { const k = RUN.layoutKeys(vs); vs = vs.map((v, i) => ({ ...v, key: v.key || k[i] })); }
    const on = pl.variant && !pl.variant.edited && vs.find(v => v.key === pl.variant.key && !v.elements); if (on) on.elements = clone(pl.elements); // the team copy keeps numbers only: the one on the map is the option's own pieces
    for (const v of vs) derive(v, pl);
    ed.variants = vs; ed.aiNote = r.note || ''; ed.aiSummary = r.summary || ''; ed.sortBy = r.sort || 'rec'; ed.ask = r.ask || ''; ed.runMeta = { ask: r.ask || '', at: r.at, effort: ASK.runEffort(r) }; if (r.ideas?.list?.length) ed.ideas = r.ideas; if (r.read) ed.readAs = r.read; ed.aiPick = r.pick || null;
    refreshFin(true);
  }
  // the plan closes (Done, ×, another card, leaving the map): say where it was saved and leave a way back to it
  function close() {
    card.classList.remove('sp-mode');
    if (!ed) { if (startGhost && !resume) clearResume(); startGhost = false; return; } // the Start card went: its outline too
    const p = P(), pl = PL(), was = { pid: ed.pid, plid: ed.plid, at: performance.now() }, draft = !!ed.draftPlan; killRun();
    ed = null; fromCard = ''; draw(); showMapBits(); leavePlanning(); ctx.scheduleHash?.();
    if (persistT) persistNow();
    if (!p || !pl || draft) return; // deleted, or a site that was never finished
    if (leaving) { showAway(was); return; }
    showResume(was);
    ctx.toast('Saved to ' + p.name + '.', { action: { label: 'Open project', run: () => openProject(was.pid) } });
  }
  ctx.onCardClose?.(() => close());
  ctx.onCardRender?.(() => close()); // another card (a filing, a search result) took the panel
  // Done and ×: back to the property card the plan was started from, else the plan just closes
  function closePlan() { if (fromCard && ctx.cardChild?.() === 'open' && ctx.cardBack?.()) { if (ed) close(); return; } ctx.closeCard(); }
  function openProject(pid) { ctx.setView('projects'); if (db.projects.some(x => x.id === pid)) show(pid); }

  // ----- where the plan can be seen: the map's free rectangle (not under the card, the list, the search or the buttons) -----
  // o.key: keep clear of the legend card too (the Plan key, bottom left), for a site of aspect o.aspect (the fit)
  function freeRect(o = {}) {
    const m = map.getContainer().getBoundingClientRect(), vis = el => el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden', box = el => vis(el) ? el.getBoundingClientRect() : null;
    const f = openArea(m, { panels: [card.classList.contains('open') ? box(card) : null, app.classList.contains('ai-open') ? box(document.getElementById('ai')) : null].filter(Boolean),
      tops: [box(document.getElementById('mapleft')), box(document.getElementById('mtop'))].filter(Boolean), buttons: box(document.querySelector('.ctrls')), // search and tools on top, camera buttons on the right
      corners: o.key ? [box(document.getElementById('legends'))].filter(Boolean).map(r => ({ left: r.left - 8, right: r.right + 8, top: r.top - 8, bottom: r.bottom, width: r.width + 16, height: r.height + 8 })) : [], aspect: o.aspect });
    // phones: the sheet covers what's under it however high it's pulled (the shared rule ignores a sheet over two thirds of
    // the map, as there's little map left), so while a plan is open the free strip ends at its top when that leaves room
    const ct = phone() && card.classList.contains('open') ? box(card)?.top : null; if (ct && ct - f.t >= 120 && ct < f.b) f.b = ct;
    return { ...f, m };
  }
  function ringLL(pl) { const F = pl?.origin && pl.ring?.length >= 3 && SP.frame(pl.origin); return F ? pl.ring.map(F.toLL) : null; }
  // the whole site in the free rectangle
  function planFit(site) {
    const pl = site?.origin ? site : ed && PL(); if (!pl?.origin) return;
    const ll = ringLL(pl); if (!ll) { map.easeTo({ center: pl.origin, zoom: Math.max(map.getZoom(), 17), pitch: 0 }); return; }
    const xs = ll.map(p => p[0]), ys = ll.map(p => p[1]);
    if (map.getPitch() > 1) map.jumpTo({ pitch: 0 }); // the plan is a drawing: seen from straight above, it fits exactly
    const f = freeRect({ key: !phone(), aspect: aspectOf(ll) }), padding = fitPadding(f, f.m, phone() ? 14 : 40); // clear of the Plan key too (on phones it's folded above the sheet)
    ctx.fitBox([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding, maxZoom: 19 });
  }
  const aspectOf = ll => { const xs = ll.map(p => p[0]), ys = ll.map(p => p[1]), a = map.project([Math.min(...xs), Math.max(...ys)]), z = map.project([Math.max(...xs), Math.min(...ys)]); return Math.abs(z.x - a.x) / Math.max(1, Math.abs(z.y - a.y)); }; // the site's width / height on screen
  // is the whole site on screen, clear of the panels (and, with key, of the Plan key)?
  function planInView(key = false) {
    const ll = ringLL(ed && PL()); if (!ll) return true; const { l, t, r, b } = freeRect({ key: key && !phone(), aspect: aspectOf(ll) }), c = map.getContainer().getBoundingClientRect();
    return ll.every(q => { const s = map.project(q), x = s.x + c.left, y = s.y + c.top; return x >= l - 2 && x <= r + 2 && y >= t - 2 && y <= b + 2; });
  }
  // refit when the map itself changes size (the list folds, the window resizes) or the phone sheet settles; never on a map move
  let ro = null, roT = 0, sheetQuiet = false;
  const refitView = () => { clearTimeout(roT); roT = setTimeout(() => { if (ed) { planFit(); placeMapUi(); } }, 140); };
  function watchResize() {
    if (ro || !window.ResizeObserver) return; let first = true;
    ro = new ResizeObserver(() => { if (first) { first = false; return; } refitView(); }); ro.observe(map.getContainer());
  }
  card.addEventListener('transitionend', () => { placePill(); if (ed) placeMapUi(); }); // the run's pill and the phone legend ride above the sheet
  // the chip that's lit is the section nearest the top of the card: the one under the header, or the next as soon as it's
  // within a few lines of it (an IntersectionObserver wakes this when a section reaches the strip under the header)
  let spyIO = null, spyHold = 0, spyRaf = 0;
  const spySoon = () => { if (!spyRaf) spyRaf = requestAnimationFrame(spyPlan); };
  function spyPlan() {
    spyRaf = 0; if (!ed || !card.classList.contains('sp-mode') || performance.now() < spyHold) return;
    const nav = card.querySelector('.bnav'), top = card.querySelector(':scope>.top'); if (!nav || !top) return;
    const chips = [...nav.querySelectorAll('[data-sec]:not([hidden])')]; if (!chips.length) return;
    const line = top.getBoundingClientRect().bottom + 90, room = card.scrollHeight - card.clientHeight; let on = chips[0];
    if (room > 0 && card.scrollTop >= room - 4) on = chips[chips.length - 1];
    else for (const b of chips) { const el = card.querySelector('#' + CSS.escape(b.dataset.sec)); if (el && el.getBoundingClientRect().top <= line) on = b; }
    for (const b of nav.querySelectorAll('[data-sec]')) b.setAttribute('aria-current', String(b === on));
    if (nav.scrollWidth > nav.clientWidth + 2) { const l = on.offsetLeft - nav.offsetLeft, r = l + on.offsetWidth; if (l < nav.scrollLeft + 8) nav.scrollLeft = Math.max(0, l - 28); else if (r > nav.scrollLeft + nav.clientWidth - 8) nav.scrollLeft = r - nav.clientWidth + 28; } // phones: keep it in the scrolling row
  }
  function spyWatch() {
    spyIO?.disconnect(); spyIO = null; const top = card.querySelector(':scope>.top'); if (!top || !window.IntersectionObserver) return;
    const h = Math.round(top.getBoundingClientRect().bottom - card.getBoundingClientRect().top), ch = card.clientHeight;
    spyIO = new IntersectionObserver(spySoon, { root: card, rootMargin: '-' + h + 'px 0px -' + Math.max(0, ch - h - 90) + 'px 0px', threshold: [0, 1] });
    card.querySelectorAll('.bnav [data-sec]').forEach(b => { const el = card.querySelector('#' + CSS.escape(b.dataset.sec)); if (el) spyIO.observe(el); });
    spySoon();
  }
  card.addEventListener('scroll', () => { if (ed) spySoon(); }, { passive: true });
  card.addEventListener('click', e => { const b = ed && e.target.closest?.('.bnav [data-sec]'); if (b) { spyHold = performance.now() + 1000; setTimeout(spySoon, 1050); } }, true); // a chip just clicked stays lit while the card scrolls to its section
  card.addEventListener('transitionend', e => { if (e.target !== card || !ed || !phone() || !/max-height|transform/.test(e.propertyName)) return; if (sheetQuiet) { sheetQuiet = false; return; } refitView(); });
  const fitBtnWrap = document.createElement('div'); fitBtnWrap.className = 'rgrp sp-fitg';
  fitBtnWrap.innerHTML = '<button type="button" id="spFit" aria-label="Fit the plan in view" title="Fit the plan in view"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"/><rect x="5" y="5" width="6" height="6" rx="1"/></svg></button>';
  document.querySelector('.ctrls')?.prepend(fitBtnWrap); fitBtnWrap.querySelector('button').onclick = () => planFit();

  // ----- on the map, inside its free rectangle: one pill saying what mode you're in (and how to leave it), the scale -----
  const stage = document.getElementById('stage') || map.getContainer().parentElement;
  const mapUi = document.createElement('div'); mapUi.className = 'sp-mapui'; mapUi.hidden = true;
  mapUi.innerHTML = '<div class="sp-mpill" role="status" aria-live="polite" hidden></div><div class="sp-scale"></div>'; stage.appendChild(mapUi);
  const pillMode = mapUi.querySelector('.sp-mpill');
  let scale = null, modeKey = '';
  function placeMapUi() {
    if (!ed || ctx.view !== 'map') { mapUi.hidden = true; return; }
    const f = freeRect(), st = stage.getBoundingClientRect(), top = phone() && card.classList.contains('open') ? card.getBoundingClientRect().top : Infinity, b = Math.min(f.b, top); // phones: above the sheet, however high it is
    Object.assign(mapUi.style, { left: Math.round(f.l - st.left) + 'px', top: Math.round(f.t - st.top) + 'px', width: Math.max(0, Math.round(f.r - f.l)) + 'px', height: Math.max(0, Math.round(b - f.t)) + 'px' });
    if (phone()) app.style.setProperty('--sp-above', Math.round(Math.max(12, innerHeight - Math.min(innerHeight, top) + 8)) + 'px'); // the phone legend rides above the sheet
    mapUi.hidden = false; paintTools();
  }
  function addScale() { if (scale || !window.maplibregl?.ScaleControl) return; try { scale = new maplibregl.ScaleControl({ unit: 'imperial', maxWidth: 120 }); mapUi.querySelector('.sp-scale').appendChild(scale.onAdd(map)); } catch (e) { scale = null; } }
  function dropScale() { try { scale?.onRemove(); } catch (e) {} scale = null; }
  // the mode, as a small chip on top of the tool strip: a tool (draw, street side, side street, entrance, parcels,
  // measure, draw a piece) says what to do next in one line, with Cancel, Finish or Stop Editing; shaping a piece and plain Edit
  // just say so. b: the buttons, [label, what it does] (Finish ends a drawing, Cancel drops it)
  function modeOf() {
    if (!ed) return null; const pl = PL(), touch = coarse(), cl = touch ? 'Tap' : 'Click', c = cl.toLowerCase(), X = ['Cancel', 'leave'], D = ['Stop Editing', 'leave'], F = ['Finish', 'finish']; // Done is only the plan's (its header): a tool stops with Stop Editing, a drawing ends with Finish
    switch (ed.mode) {
      case 'draw': return pl?.ring.length >= 3 ? { k: 'redraw', t: 'Redraw the site', d: cl + ' each corner, then the first again', b: [X, F] } : { k: 'draw', t: 'Draw the site', d: cl + ' each corner, then the first again', b: [F] };
      case 'front': return { k: 'front', t: 'Street side', d: cl + ' the lot line along the street', b: [X] };
      case 'street': return { k: 'street', t: 'Side street', d: cl + ' a lot line to add or remove one', b: [D] };
      case 'entrance': return { k: 'entrance', t: 'Add entrance', d: cl + ' the lot line where the drive comes in', b: [X] };
      case 'roundabout': return { k: 'roundabout', t: 'Add roundabout', d: cl + ' where streets meet', b: [X] };
      case 'loop': return { k: 'loop', t: 'Add drop-off loop', d: cl + ' the building the drop-off loop is for', b: [X] };
      case 'parcels': return { k: 'parcels', t: 'Parcels', d: cl + ' one next to the site to add it, or in it to take it out', b: [D] };
      case 'measure': { const M = ed.meas || { pts: [] }, Q = M.pts, area = M.kind === 'area';
        const tot = area ? (Q.length >= 3 ? T.fmtArea(T.polyArea(Q)) : '') : Q.length > 1 ? T.fmtFt(T.pathLen(Q)) : '';
        return { k: 'measure', t: area ? 'Measure area' : 'Measure', d: tot ? tot + (M.done ? ' · ' + c + ' to start again' : '') : area ? cl + ' round the area' : cl + ' points along the way', b: [['Stop Measuring', 'leave']] }; }
      case 'drawpiece': { const Dp = ed.dp || {}; return { k: 'drawpiece', t: Dp.label || 'Draw', d: Dp.line ? cl + ' points along it' : cl + ' each corner, then the first again', b: [X, F] }; }
    }
    const busy = ed.refitting ? 'Re-fitting the site…' : '';
    if (ed.shape && ed.editing) return { k: 'shape', t: 'Shape', d: busy || (touch ? 'Drag a point or a face · + adds a point' : 'Drag points or faces · + adds a point · double-click removes one · Shift: whole feet, square corners'), b: [D] };
    if (ed.editing) return { k: 'edit', t: 'Editing', d: busy || (ed.sel && !(ed.multi?.length > 1) ? (touch ? 'Drag a face to resize · the dot turns it' : 'Drag a face to resize · the dot turns it · Shift: 15° turns, whole feet') : ''), b: [D] };
    return null;
  }
  const dropMode = () => { ed.mode = null; ed.draft = []; ed.hover = null; ed.meas = null; ed.dp = null; ed.cursor = null; };
  function paintMode() {
    placeMapUi(); syncDblZoom(); const m = modeOf(), k = m ? m.k : '';
    if (k !== modeKey) { modeKey = k; if (k && !document.getElementById('toast')?.classList.contains('act')) ctx.clearToast?.(); if (ed && ed.mode !== 'front' && ed.mode !== 'street') ed.hover = null; } // a new mode: an old instruction toast goes (not one with Undo in it)
    if (!m) { pillMode.hidden = true; pillMode.innerHTML = ''; placeMix(); return; }
    const html = '<span class="sp-mp-dot k-' + m.k + '" aria-hidden="true"></span><b class="sp-mp-t">' + esc(m.t) + '</b>' + (m.d ? '<span class="sp-mp-d" title="' + esc(m.d) + '">' + esc(m.d) + '</span>' : '') +
      m.b.map(([l, a]) => '<button type="button" class="sp-mp-b' + (l !== 'Cancel' ? ' done' : '') + '" data-mb="' + a + '"' + (a === 'finish' && !canFinish() ? ' disabled' : '') + '>' + l + '</button>').join('');
    if (pillMode.innerHTML !== html) { pillMode.innerHTML = html; pillMode.querySelectorAll('[data-mb]').forEach(b => b.onclick = () => b.dataset.mb === 'finish' ? finishMode() : leaveMode()); }
    pillMode.hidden = false; placeChip(); placeMix();
  }
  // Finish on a drawing: finish it (the site, a drawn piece), as Enter does
  const canFinish = () => ed.mode === 'draw' ? ed.draft.length >= 3 : ed.mode === 'drawpiece' ? ed.draft.length >= (ed.dp?.line ? 2 : 3) : true;
  function finishMode() { if (ed?.mode === 'draw') finishDraw(); else if (ed?.mode === 'drawpiece') finishPiece(); }
  // the chip's other button: Cancel a tool, or Stop Editing / Stop Measuring (Side Street, parcels, measuring, shaping, editing); Done is only the plan's
  function leaveMode() {
    if (!ed) return;
    if (ed.mode) dropMode();
    else if (ed.shape) ed.shape = null;
    else ed.editing = false;
    draw(); panel();
  }
  // double-click on the map adds and removes points while editing, so it doesn't zoom then (as it was on close)
  function syncDblZoom() { const z = map.doubleClickZoom; if (!z || !planState) return; const off = !!(ed && (ed.editing || ed.mode)); if (off && z.isEnabled()) z.disable(); else if (!off && planState.dblZoom && !z.isEnabled()) z.enable(); }

  // ----- after closing: a faint outline of the site and a "Resume plan" chip; away from the map, a banner back to it -----
  const GSRC = 'fs-sp-ghost'; let resume = null, away = null;
  const resumeEl = document.createElement('div'); resumeEl.className = 'sp-resume'; resumeEl.hidden = true; (document.getElementById('mapleft') || ctx.viewport || document.body).appendChild(resumeEl);
  const awayEl = document.createElement('div'); awayEl.className = 'sp-away'; awayEl.hidden = true; awayEl.setAttribute('role', 'status'); (document.getElementById('stage') || document.body).appendChild(awayEl);
  const RESUME = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v3h3"/></svg>';
  const XS = '<svg width="12" height="12" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const planOf = w => { const p = w && db.projects.find(x => x.id === w.pid), pl = p?.plans.find(x => x.id === w.plid); return p && pl ? { p, pl } : null; };
  let ghostWant = null;
  function ghost(pl) {
    ghostWant = pl; const ll = ringLL(pl), data = ll ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ll.concat([ll[0]])] } }] } : EMPTY;
    if (!map.getSource(GSRC)) { if (!ll) return;
      // isStyleLoaded() is false while any source reloads (the property card coming back sets its own data), so try the
      // add, and if the style really isn't ready yet, once the map settles
      try { map.addSource(GSRC, { type: 'geojson', data: EMPTY });
        map.addLayer({ id: 'fs-sp-ghost-f', type: 'fill', source: GSRC, paint: { 'fill-color': '#0a7a36', 'fill-opacity': .06 } });
        map.addLayer({ id: 'fs-sp-ghost', type: 'line', source: GSRC, paint: { 'line-color': '#0a7a36', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': .75 } });
      } catch (e) { if (map.getSource(GSRC)) map.removeSource(GSRC); map.once('idle', () => { if (!ed && ghostWant === pl) ghost(pl); }); return; } }
    map.getSource(GSRC).setData(data);
  }
  function showResume(w) {
    const x = planOf(w); if (!x) return; resume = w; ghost(x.pl);
    resumeEl.innerHTML = '<button type="button" class="sp-rs-go" title="Open ' + esc(x.pl.name) + ' of ' + esc(x.p.name) + ' again">' + RESUME + '<span>Resume plan</span><b>' + esc(x.pl.name) + '</b></button><button type="button" class="sp-rs-x" aria-label="Dismiss">' + XS + '</button>';
    resumeEl.querySelector('.sp-rs-go').onclick = () => { const r = resume; clearResume(); if (planOf(r)) open(r.pid, r.plid); };
    resumeEl.querySelector('.sp-rs-x').onclick = clearResume; resumeEl.hidden = false;
  }
  function clearResume() { resume = null; resumeEl.hidden = true; ghostWant = null; startGhost = false; if (map.getSource(GSRC)) map.getSource(GSRC).setData(EMPTY); }
  map.on('click', () => { if (resume && !ed && performance.now() - resume.at > 400) clearResume(); }); // the next click on the map lets it go
  function showAway(w) {
    const x = planOf(w); if (!x) return; away = w;
    awayEl.innerHTML = '<span>Editing <b>' + esc(x.pl.name) + '</b> of ' + esc(x.p.name) + '</span><button type="button" class="sp-aw-go">Return to plan</button><button type="button" class="sp-aw-x" aria-label="Dismiss">' + XS + '</button>';
    awayEl.querySelector('.sp-aw-go').onclick = () => { const a = away; hideAway(); if (planOf(a)) open(a.pid, a.plid); };
    awayEl.querySelector('.sp-aw-x').onclick = hideAway; awayEl.hidden = ctx.view === 'map';
  }
  function hideAway() { away = null; awayEl.hidden = true; }
  // leaving the map while a plan is open closes it cleanly (no editor floating over a page) and leaves the banner
  ctx.onViewChange?.(v => {
    if (v !== 'map') {
      if (ed) { leaving = true; try { ctx.closeCard(); } finally { leaving = false; } }
      else if (resume && performance.now() - resume.at < 1500) { const r = resume; clearResume(); showAway(r); } // closed on the way out (a phone tab, All Projects)
      else clearResume();
      awayEl.hidden = !away;
    } else if (away) { const a = away; hideAway(); showResume({ ...a, at: performance.now() }); } // back on the map: the chip, not the banner
  });

  // street side: the parcel edge facing the nearest road in the map's own road lines, else the longest edge (a guess)
  function detectFront(pl) {
    const s = map.getStyle()?.sources || {}, src = Object.keys(s).find(id => s[id].type === 'vector' && /maptiler|openmaptiles|planet/i.test(id + (s[id].url || '')));
    const F = SP.frame(pl.origin), lines = [];
    try {
      for (const f of src ? map.querySourceFeatures(src, { sourceLayer: 'transportation' }) : []) {
        const cls = f.properties?.class || ''; if (/path|track|rail|transit|ferry|cable|bridleway|pier|service|raceway/.test(cls)) continue; // (service: driveways, parking aisles and alleys, not streets)
        const g = f.geometry, parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const c of parts) { const ft = c.map(F.toFt); if (ft.some(([x, y]) => Math.abs(x) < 2500 && Math.abs(y) < 2500)) { ft.rank = SP.roadRank(cls); lines.push(ft); } }
      }
    } catch (e) {}
    const f = pl.frontGuess ? SP.frontFromRoads(pl.ring, lines) : pl.front;
    if (f == null) return; const was = pl.streetsBy != null || pl.streets == null ? null : siteParts(pl).street;
    pl.front = f; pl.frontGuess = false; const found = SP.streetsFromRoads(pl.ring, lines, f), own = (pl.streets || []).filter(i => i !== f);
    if (!pl.streetsSet) pl.streets = found;
    // street sides kept from the old check plus one the person added: theirs to fix, so say which sides the map now supports
    else if (was && [...own].sort().join() !== [...found].sort().join() && own.some(i => !found.includes(i))) ctx.toast(`This plan has ${own.length} side street${own.length === 1 ? '' : 's'} marked; the map shows ${found.length ? found.length : 'none'} beside the lot. Side Street on the toolbar: click a side to take it off.`);
    if (!pl.streetNamesSet && src) { try { // the roads' names (the map's labels), for "apartments along FM 362"
      const named = []; for (const q of map.querySourceFeatures(src, { sourceLayer: 'transportation_name' })) { const nm = q.properties?.name || q.properties?.ref, g = q.geometry; if (!nm) continue; for (const c of g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []) { const ft = c.map(F.toFt); if (ft.some(([x, y]) => Math.abs(x) < 2500 && Math.abs(y) < 2500)) named.push({ nm: String(nm).slice(0, 40), ft }); } }
      const names = {}; for (const k of [f, ...pl.streets.filter(i => i !== f)]) { const a = pl.ring[k], b = pl.ring[(k + 1) % pl.ring.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let best = null; for (const x of named) for (let i = 1; i < x.ft.length; i++) { const d = SP.segDist(m, x.ft[i - 1], x.ft[i]); if (d < 150 && (!best || d < best.d)) best = { d, nm: x.nm }; } if (best) names[k] = best.nm; }
      if (Object.keys(names).length) pl.streetNames = names; } catch (e) { /* no names in the tiles: "along the highway" means the front */ } }
    pl.streetsBy = 2;
    if (was && siteParts(pl).street !== was) { siteChanged(pl, 'street'); ctx.toast(`Street sides re-checked against the map: ${pl.streets.length ? `the front and ${pl.streets.length} side street${pl.streets.length > 1 ? 's' : ''}` : 'the front only'}. Side Street on the toolbar changes them.`); }
    save(P()); draw(); panel();
  }

  // what Undo puts back: the pieces and the site, and the option's name, its pro forma and its parcels (absent ones as null, so they're cleared too)
  function snapshot() { const pl = PL(); return clone({ name: pl.name, pf: pl.pf || null, parcels: pl.parcels || null, parcel: pl.parcel || null, zones: pl.zones || [], elements: pl.elements, front: pl.front, frontGuess: pl.frontGuess, streets: pl.streets || [], streetsSet: !!pl.streetsSet, setbacks: pl.setbacks, program: pl.program, ring: pl.ring, origin: pl.origin, src: pl.src, params: pl.params || null, recipe: pl.recipe || null, variant: pl.variant || null, stale: pl.stale || null }); }
  // a layout on the map that's been changed by hand or by Change With AI is "edited": new settings never replace it silently
  let applying = false;
  const markEdited = pl => { if (pl?.variant && !pl.variant.edited) pl.variant = { ...pl.variant, edited: true }; };
  const dirty = pl => !!(pl && (pl.variant ? pl.variant.edited : pl.elements.some(e => e.pinned)));
  function change(fn, keepPanel) {
    const pl = PL(); if (!pl) return; ed.undo.push(snapshot()); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = [];
    const watch = !applying && pl.variant && !pl.variant.edited, before = watch ? JSON.stringify(pl.elements) : '', site0 = applying ? null : siteParts(pl);
    const runOn = !applying && ed.run && !ed.run.applied && LAYS.includes(ed.run.kind), b0 = runOn && !watch ? JSON.stringify(pl.elements) : before;
    fn(pl); const moved = (watch || runOn) && JSON.stringify(pl.elements) !== b0; if (watch && moved) markEdited(pl); if (runOn && moved) handEdit();
    if (site0) { const s1 = siteParts(pl); if (s1.ring !== site0.ring) siteChanged(pl, 'site'); else if (s1.street !== site0.street) siteChanged(pl, 'street'); }
    pl.updated = new Date().toISOString(); save(P()); draw(); if (!keepPanel) panel(); else nums();
  }
  // the layouts in the list were made for one site and one street side: when either changes they're out of date (every
  // card says so, "Use this layout" fits it to the new site, and a bar offers a re-fit or new layouts)
  const siteParts = pl => { const ll = ringLL(pl); return { ring: JSON.stringify(ll ? ll.map(q => [+q[0].toFixed(6), +q[1].toFixed(6)]) : null), street: JSON.stringify([pl.front ?? null, [...(pl.streets || [])].sort()]) }; };
  function siteChanged(pl, why) {
    if (!pl || !ed || !(pl.elements.length || ed.variants?.length)) return;
    pl.stale = why || 'site'; for (const v of ed.variants || []) v.stale = pl.stale;
    if (ed.variants) saveRun(pl);
  }
  const syncStale = pl => { for (const v of ed?.variants || []) { if (pl.stale) v.stale = pl.stale; else delete v.stale; } };
  // say: the person asked (the buttons, ⌘Z / Ctrl+Y): a short toast with the way back ("Undone · Redo")
  function undo(back = true, say = false) {
    const pl = PL(), from = back ? ed.undo : ed.redo, to = back ? ed.redo : ed.undo; if (!pl || !from.length) { if (say) ctx.toast(back ? 'Nothing to undo.' : 'Nothing to redo.'); return; }
    const top = from[from.length - 1], full = !!top._full; // Clear and start over: the whole option, its last build included (SP.undoState)
    if (full && ed.run) { ctx.toast(WAIT + '.'); return; } // a build under way would land on the layouts coming back
    to.push(full ? { _full: SP.undoState(pl) } : snapshot()); from.pop();
    if (full) { SP.restoreState(pl, top._full); stopPending(); freshRun(); delete ed.buildOpen; restoreRun(pl); }
    else { Object.assign(pl, top); for (const k of ['pf', 'parcels', 'parcel']) if (pl[k] == null) delete pl[k]; }
    syncStale(pl);
    if (ed.run) ed.pickedByUser = true; if (ed.sel && !pl.elements.some(e => e.id === ed.sel)) ed.sel = null; ed.multi = (ed.multi || []).filter(id => pl.elements.some(e => e.id === id));
    save(P()); draw(); panel(); refreshFin();
    if (say) ctx.toast(back ? 'Undone.' : 'Redone.', { action: { label: back ? 'Redo' : 'Undo', run: () => { if (ed) undo(!back, true); } } });
  }
  // a piece deleted (the Delete key or button): the toast names it and can bring it back
  function delEl(el) { delEls([el.id]); }
  function delEls(ids) { // one piece or a set: one undo step
    const pl = PL(), list = ids.map(id => pl?.elements.find(e => e.id === id)).filter(Boolean); if (!list.length) return;
    const name = list.length > 1 ? plural(list.length, 'piece') : ED.labelOf(list[0]), n = ed.undo.length; change(x => { for (const el of list) dropEl(x, el); }); ed.sel = null; ed.multi = []; ed.shape = null; draw(); panel();
    ctx.toast('Deleted ' + name + '.', { action: { label: 'Undo', run: () => { if (ed && ed.undo.length === n + 1) undo(true); } } }); autoRefit('Deleted', name); }
  // the pieces picked: the primary (ed.sel) alone, or the set it's part of (ed.multi, Shift-click or a box)
  // only pieces that still exist and sit on a visible, unlocked layer: a set never drags or deletes a hidden or locked piece
  const sels = () => { const pl = ed && PL(); if (!pl || !ed.sel) return []; const V = T.viewOf(pl), ok = id => { const e = pl.elements.find(x => x.id === id); return !!e && T.editable(V, e); }; return ed.multi?.length > 1 && ed.multi.includes(ed.sel) ? ed.multi.filter(ok) : ok(ed.sel) ? [ed.sel] : []; };
  const pickOne = id => { ed.sel = id; ed.multi = []; };
  // a layout's pieces with the plan's own easements: they're site constraints you drew, not part of any one layout
  const withKeepouts = (els, cur) => clone(els.filter(e => e.kind !== 'keepout').concat((cur || []).filter(e => e.kind === 'keepout')));

  // ---------- map layers ----------
  // Drawn bottom to top: the ground (lawn, paving, pieces, stalls), the setback, the trees, the site boundary over them
  // (a white casing under it), the buildings (Phase 2 fainter, the selected one lit up and the others dimmed), outlines
  // (problems red, Phase 2 dashed, the selection green on white), the labels (the selected piece's always shows; parking
  // counts from zoom 17.5), then the drawing line, the hovered street edge and the handles. Colours come from one palette
  // (lib/planmap.mjs); a basemap change rebuilds them all (onOverlays below).
  const SRC = 'fs-sp', HSRC = 'fs-sp-h', DSRC = 'fs-sp-d', XSRC = 'fs-sp-x', GRSRC = 'fs-sp-g', EMPTY = { type: 'FeatureCollection', features: [] };
  const coarse = () => matchMedia('(pointer:coarse)').matches; // fingers: bigger handles, a wider reach, the turn dot further out
  let ids = [], dimmed = null;
  // mp: the map to draw on: the page's, or a hidden one a background rendering takes its picture from (renderInBackground)
  function addLayers(mp = map) {
    if (mp.getSource(SRC)) return;
    const kind = k => ['==', ['get', 'k'], k], P = MAP.palette(), C = P.col, Ln = P.lines, Lb = P.label, big = coarse();
    const add = def => { mp.addLayer(def); if (mp === map) ids.push(def.id); };
    if (mp === map) { ids = []; dimmed = null; }
    mp.addSource(SRC, { type: 'geojson', data: EMPTY }); mp.addSource(HSRC, { type: 'geojson', data: EMPTY }); mp.addSource(DSRC, { type: 'geojson', data: EMPTY }); mp.addSource(XSRC, { type: 'geojson', data: EMPTY }); mp.addSource(GRSRC, { type: 'geojson', data: EMPTY }); gridKey = '';
    const hatch = 'sp-hatch'; if (!mp.hasImage(hatch)) { const n = 12, px = new Uint8Array(n * n * 4), [r, g, b] = [1, 3, 5].map(i => parseInt(Ln.keepout.slice(i, i + 2), 16)); // an easement's diagonal stripes
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const on = (x + y) % n < 2, i = (y * n + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = on ? 200 : 0; } try { mp.addImage(hatch, { width: n, height: n, data: px }); } catch (e) { /* plain fill below */ } }
    const sel1 = ['==', ['get', 'sel'], 1], ph2 = ['==', ['get', 'ph'], 2], bk = ['in', ['get', 'k'], ['literal', ['building', 'garage']]];
    const useCol = f => ['match', ['get', 'use'], ...Object.entries(P.use).map(([k, v]) => [k, f(v)]).flat(), f(C.building)];
    const bcol = f => ['case', ['==', ['get', 'bad'], 1], Ln.bad, ['==', ['get', 'k'], 'garage'], f(C.garage), ph2, useCol(c => f(P.p2(c))), useCol(f)];
    const id = c => c, lit = c => P.sel(c);
    add({ id: 'fs-sp-lot', type: 'fill', source: SRC, filter: ['all', kind('lot'), ['==', ['get', 'site'], 1]], paint: { 'fill-color': C.lawn, 'fill-opacity': P.lotOpacity } }); // the site is landscape under everything on it
    add({ id: 'fs-sp-grid', type: 'line', source: GRSRC, minzoom: 17, paint: { 'line-color': 'rgba(11,13,12,.13)', 'line-width': ['interpolate', ['linear'], ['zoom'], 17, 0.5, 20, 1] } }); // the grid, light, from street zoom
    add({ id: 'fs-sp-zone', type: 'line', source: SRC, filter: kind('zone'), layout: { 'line-cap': 'round' }, paint: { 'line-color': Ln.zone, 'line-width': 1.1, 'line-dasharray': [0.1, 2.6] } }); // dotted
    // paving is drawn once as a whole (one colour, one curb line round it); the pieces under it stay clear, and show
    // only when picked, so drives and parking rows read as one surface without seams or darker overlaps
    // lawns and parks under the paving: a drive is never hidden under a park (where one overlaps, the park is flagged red
    // and the drive shows on top); a boulevard's median is drawn over its paving, below
    add({ id: 'fs-sp-green', type: 'fill', source: SRC, filter: ['all', kind('green'), ['!=', ['get', 'med'], 1]], paint: { 'fill-color': C.green, 'fill-opacity': ['case', sel1, .5, ['==', ['get', 'nm'], 0], 0.01, .75] } });
    add({ id: 'fs-sp-pave', type: 'fill', source: SRC, filter: kind('paved'), paint: { 'fill-color': C.parking, 'fill-opacity': .82 } });
    add({ id: 'fs-sp-curb', type: 'line', source: SRC, filter: kind('paved'), paint: { 'line-color': Ln.curb, 'line-width': 1.2, 'line-opacity': .9 } });
    add({ id: 'fs-sp-med', type: 'fill', source: SRC, filter: ['all', kind('green'), ['==', ['get', 'med'], 1]], paint: { 'fill-color': C.green, 'fill-opacity': ['case', sel1, .6, .9] } }); // the entry's planted median
    add({ id: 'fs-sp-medl', type: 'line', source: SRC, filter: ['all', kind('green'), ['==', ['get', 'med'], 1]], paint: { 'line-color': Ln.curb, 'line-width': 1 } });
    add({ id: 'fs-sp-sign', type: 'fill-extrusion', source: SRC, filter: kind('sign'), paint: { 'fill-extrusion-color': ['case', ['==', ['get', 'bad'], 1], Ln.bad, sel1, P.sel(C.sign || '#8b8073'), C.sign || '#8b8073'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .95 } }); // a monument sign: a low stone wall
    add({ id: 'fs-sp-fill', type: 'fill', source: SRC, filter: ['in', ['get', 'k'], ['literal', ['parking', 'drive', 'truck', 'pond', 'plaza', 'court', 'pool', 'play', 'trail', 'trash', 'patio', 'foodtruck']]],
      paint: { 'fill-color': ['match', ['get', 'k'], 'foodtruck', C.foodtruck, 'trail', C.trail, 'trash', C.trash, 'patio', C.patio, 'parking', C.parking, 'drive', C.drive, 'truck', C.truck, 'pond', C.pond, 'plaza', C.plaza, 'court', C.court, 'pool', C.pool, 'play', C.play, C.green],
        'fill-opacity': ['case', sel1, .5, ['in', ['get', 'k'], ['literal', PAVED]], 0.01, .75] } });
    add({ id: 'fs-sp-lots', type: 'line', source: SRC, filter: ['all', kind('lot'), ['!=', ['get', 'site'], 1]], minzoom: 17, layout: { 'line-cap': 'round' }, paint: { 'line-color': Ln.lots, 'line-width': 1, 'line-dasharray': [0.1, 2.4] } }); // house lots, dotted, close in
    add({ id: 'fs-sp-walk', type: 'fill', source: SRC, filter: kind('walk'), paint: { 'fill-color': Ln.walk, 'fill-opacity': .85 } });
    add({ id: 'fs-sp-yard', type: 'fill', source: SRC, filter: kind('yard'), minzoom: 16, paint: { 'fill-color': Ln.yard, 'fill-opacity': .9 } });
    add({ id: 'fs-sp-fence', type: 'line', source: SRC, filter: ['all', kind('fence'), ['!', ['has', 'id']]], minzoom: 16, paint: { 'line-color': Ln.fence, 'line-width': 1 } }); // back-yard fences
    add({ id: 'fs-sp-sfence', type: 'fill', source: SRC, filter: ['all', kind('fence'), ['has', 'id']], paint: { 'fill-color': ['case', ['==', ['get', 'gate'], 1], Ln.gate, Ln.secure], 'fill-opacity': ['case', sel1, 1, .9] } }); // a security fence, its gates
    add({ id: 'fs-sp-sfencel', type: 'line', source: SRC, filter: ['all', kind('fence'), ['has', 'id']], layout: { 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'gate'], 1], Ln.gate, Ln.secure], 'line-width': ['interpolate', ['linear'], ['zoom'], 16, ['case', ['==', ['get', 'gate'], 1], 2, 1], 19, ['case', ['==', ['get', 'gate'], 1], 4, 2]] } }); // (a line too, so it reads at any zoom)
    add({ id: 'fs-sp-ftruck', type: 'fill-extrusion', source: SRC, filter: ['in', ['get', 'k'], ['literal', ['ftbody', 'pedestal']]], paint: { 'fill-extrusion-color': ['match', ['get', 'k'], 'pedestal', '#2b3033', '#f4f1ea'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .95 } }); // a food truck on its stall, and its power and water pedestal
    add({ id: 'fs-sp-stall', type: 'line', source: SRC, filter: kind('stall'), minzoom: 16, paint: { 'line-color': Ln.stall, 'line-width': 1, 'line-opacity': .9 } });
    add({ id: 'fs-sp-isl', type: 'fill', source: SRC, filter: kind('island'), paint: { 'fill-color': C.green, 'fill-opacity': .9 } });
    add({ id: 'fs-sp-ada', type: 'fill', source: SRC, filter: kind('ada'), minzoom: 16, paint: { 'fill-color': '#2f6db5', 'fill-opacity': .9 } });
    add({ id: 'fs-sp-mark', type: 'line', source: SRC, filter: kind('mark'), minzoom: 16, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': .95 } });
    // a gas station: the fuel tanks' pad (kept clear), the canopy as a light roof the paving shows through, and the pump islands under it
    add({ id: 'fs-sp-tanks', type: 'fill', source: SRC, filter: kind('tanks'), paint: { 'fill-color': C.tanks, 'fill-opacity': ['case', sel1, .95, .8] } });
    add({ id: 'fs-sp-canopy', type: 'fill', source: SRC, filter: kind('canopy'), paint: { 'fill-color': C.canopy, 'fill-opacity': ['case', sel1, .75, .6] } });
    add({ id: 'fs-sp-pump', type: 'fill', source: SRC, filter: kind('pump'), paint: { 'fill-color': Ln.pump, 'fill-opacity': .95 } });
    // the canopy in 3D: island curbs, dispensers, columns and the fascia band; its roof deck a layer of its own, see-through, so the pumps show under it from above
    add({ id: 'fs-sp-c3', type: 'fill-extrusion', source: SRC, filter: ['all', kind('c3'), ['!=', ['get', 'part'], 'roof']], minzoom: 15, paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': .95 } });
    add({ id: 'fs-sp-c3r', type: 'fill-extrusion', source: SRC, filter: ['all', kind('c3'), ['==', ['get', 'part'], 'roof']], minzoom: 15, paint: { 'fill-extrusion-color': ['case', sel1, P.sel('#f1f2ef'), ['get', 'c']], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': .5 } });
    add({ id: 'fs-sp-canopyl', type: 'line', source: SRC, filter: ['in', ['get', 'k'], ['literal', ['canopy', 'tanks']]], paint: { 'line-color': ['case', ['==', ['get', 'bad'], 1], Ln.bad, ['==', ['get', 'k'], 'tanks'], Ln.tanks, Ln.canopy], 'line-width': ['case', ['==', ['get', 'bad'], 1], 2.5, 1.4], 'line-dasharray': ['literal', [3, 1.5]] } });
    // easements: stripes over a faint red-grey wash and a dashed outline, so they never read as a setback line
    add({ id: 'fs-sp-ko', type: 'fill', source: SRC, filter: kind('keepout'), paint: { 'fill-color': Ln.keepout, 'fill-opacity': ['case', sel1, .22, .12] } });
    if (mp.hasImage(hatch)) add({ id: 'fs-sp-koh', type: 'fill', source: SRC, filter: kind('keepout'), paint: { 'fill-pattern': hatch, 'fill-opacity': .9 } });
    add({ id: 'fs-sp-kol', type: 'line', source: SRC, filter: kind('keepout'), paint: { 'line-color': Ln.keepout, 'line-width': 1.6, 'line-dasharray': [3, 2] } });
    add({ id: 'fs-sp-pl', type: 'line', source: SRC, filter: kind('pline'), paint: { 'line-color': Ln.parcel, 'line-width': 1, 'line-dasharray': [4, 3], 'line-opacity': .8 } });
    add({ id: 'fs-sp-sb', type: 'line', source: SRC, filter: kind('setback'), paint: { 'line-color': Ln.setback, 'line-width': 1.3, 'line-dasharray': [3, 2] } });
    add({ id: 'fs-sp-tree', type: 'fill-extrusion', source: SRC, filter: kind('tree'), minzoom: 15, paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': .95 } }); // 3D trees: trunk, crown, top
    // the site boundary over the tree ring, on a thin casing, wider as you zoom in; the street frontage (orange) on it
    const lw = (a, b) => ['interpolate', ['linear'], ['zoom'], 16, a, 19, b];
    add({ id: 'fs-sp-lotc', type: 'line', source: SRC, filter: ['all', kind('lot'), ['==', ['get', 'site'], 1]], layout: { 'line-join': 'round' }, paint: { 'line-color': Ln.casing, 'line-width': lw(3.5, 5), 'line-opacity': .85 } });
    add({ id: 'fs-sp-lotl', type: 'line', source: SRC, filter: ['all', kind('lot'), ['==', ['get', 'site'], 1]], layout: { 'line-join': 'round' }, paint: { 'line-color': Ln.boundary, 'line-width': lw(1.5, 3) } });
    add({ id: 'fs-sp-front', type: 'line', source: SRC, filter: ['in', ['get', 'k'], ['literal', ['front', 'street']]], paint: { 'line-color': Ln.frontage, 'line-width': ['match', ['get', 'k'], 'street', 3.5, 5], 'line-opacity': .9 } });
    // buildings: Phase 1, Phase 2 (fainter: extrusion opacity can't vary by feature, so it's its own layer), the selected one
    add({ id: 'fs-sp-bldg', type: 'fill-extrusion', source: SRC, filter: ['all', bk, ['!', sel1], ['!', ph2]], paint: { 'fill-extrusion-color': bcol(id), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .88 } });
    add({ id: 'fs-sp-bldg2', type: 'fill-extrusion', source: SRC, filter: ['all', bk, ['!', sel1], ph2], paint: { 'fill-extrusion-color': bcol(id), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .6 } });
    add({ id: 'fs-sp-bsel', type: 'fill-extrusion', source: SRC, filter: ['all', bk, sel1], paint: { 'fill-extrusion-color': bcol(lit), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .95 } });
    const b3 = f => ({ 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': .95, // towers, parapets, floor lines
      'fill-extrusion-color': ['match', ['get', 'part'], 'tower', ['case', ph2, useCol(c => f(P.p2(c))), useCol(f)], 'parapet', ['case', ['==', ['get', 'g'], 1], '#8b9092', '#6d635a'], ['case', ['==', ['get', 'g'], 1], '#6f7476', '#4f453c']] });
    add({ id: 'fs-sp-b3', type: 'fill-extrusion', source: SRC, filter: ['all', kind('b3'), ['!', sel1]], paint: b3(id) });
    add({ id: 'fs-sp-b3s', type: 'fill-extrusion', source: SRC, filter: ['all', kind('b3'), sel1], paint: b3(lit) });
    add({ id: 'fs-sp-edge', type: 'line', source: SRC, filter: ['all', ['in', ['get', 'k'], ['literal', ['building', 'garage', 'patio', 'parking', 'drive', 'truck', 'pond', 'green', 'plaza', 'court', 'pool', 'play', 'trash', 'foodtruck', 'sign']]], ['any', ['!', ['in', ['get', 'k'], ['literal', [...PAVED, 'green']]]], ['==', ['get', 'nm'], 1], sel1, ['==', ['get', 'bad'], 1]]], // paving: outlined only when picked or wrong
      paint: { 'line-color': ['case', ['==', ['get', 'bad'], 1], Ln.bad, 'rgba(11,13,12,.45)'], 'line-width': ['case', ['==', ['get', 'bad'], 1], 2.5, 1] } });
    add({ id: 'fs-sp-p2', type: 'line', source: SRC, filter: ['all', kind('building'), ph2, ['!', sel1], ['!=', ['get', 'bad'], 1]], paint: { 'line-color': Ln.p2, 'line-width': 1.3, 'line-dasharray': [2, 1.6] } }); // Phase 2: dashed
    // the selection: green on a white casing (a red casing when it's also a problem)
    const pieces = ['all', ['has', 'id'], ['!', ['in', ['get', 'k'], ['literal', ['label', 'b3']]]]];
    add({ id: 'fs-sp-selc', type: 'line', source: SRC, filter: ['all', pieces, sel1], layout: { 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'bad'], 1], Ln.bad, Ln.selCase], 'line-width': ['case', ['==', ['get', 'bad'], 1], 6, 5] } });
    add({ id: 'fs-sp-sell', type: 'line', source: SRC, filter: ['all', pieces, sel1], layout: { 'line-join': 'round' }, paint: { 'line-color': Ln.sel, 'line-width': 3 } });
    add({ id: 'fs-sp-flash', type: 'line', source: SRC, filter: ['all', pieces, ['==', ['get', 'fl'], 1]], layout: { 'line-join': 'round' }, paint: { 'line-color': Ln.accent, 'line-width': 4, 'line-opacity': 1 } }); // what Change With AI just changed
    add({ id: 'fs-sp-gone', type: 'line', source: XSRC, paint: { 'line-color': '#0b0d0c', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': .8 } }); // …and what it removed, fading
    // labels: the most important first (lib/planmap.mjs); parking counts only close in; the selected piece's always
    const txt = { 'text-field': ['step', ['zoom'], ['get', 't1'], 17.5, ['get', 't2'], 18.25, ['get', 't']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 16, ['case', ['==', ['get', 'big'], 1], 9, 8.5], 18, ['case', ['==', ['get', 'big'], 1], 12, 11], 20, 15], 'text-max-width': 18, 'text-padding': 4, 'symbol-sort-key': ['get', 'pri'] };
    const ink = { 'text-color': Lb.ink, 'text-halo-color': Lb.halo, 'text-halo-width': 1.6 };
    // the names of the plan's parts, big and faint over their zones (they never push a piece's label off)
    add({ id: 'fs-sp-zlab', type: 'symbol', source: SRC, minzoom: 14, filter: kind('zlabel'), layout: { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-transform': 'uppercase', 'text-letter-spacing': .25, 'text-size': ['interpolate', ['linear'], ['zoom'], 14, ['case', ['==', ['get', 'small'], 1], 8, 13], 16, ['case', ['==', ['get', 'small'], 1], 12, 20], 18, ['case', ['==', ['get', 'small'], 1], 18, 30]], /* (a part's other sections smaller) */ 'text-max-width': 14, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': Lb.ink, 'text-opacity': .32, 'text-halo-color': Lb.halo, 'text-halo-width': 1, 'text-halo-blur': 1 } });
    add({ id: 'fs-sp-sname', type: 'symbol', source: SRC, minzoom: 16, filter: kind('sname'), layout: { 'symbol-placement': 'line', 'text-field': ['get', 't'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10, 19, 13], 'text-max-angle': 35, 'text-padding': 2, 'symbol-spacing': 400 }, paint: ink }); // the street names, along their streets (when they're on)
    add({ id: 'fs-sp-lab-p', type: 'symbol', source: SRC, minzoom: 17.5, filter: ['all', kind('label'), ['==', ['get', 'lp'], 1], ['!', sel1]], layout: { ...txt, 'text-allow-overlap': false }, paint: ink });
    add({ id: 'fs-sp-lab', type: 'symbol', source: SRC, filter: ['all', kind('label'), ['!=', ['get', 'lp'], 1], ['!', sel1]], layout: { ...txt, 'text-allow-overlap': false }, paint: ink });
    add({ id: 'fs-sp-lab-sel', type: 'symbol', source: SRC, filter: ['all', kind('label'), sel1], layout: { ...txt, 'text-allow-overlap': true }, paint: ink }); // always, and the others make way for it (it's on top, so placed first); as short as the others zoomed out, so it doesn't hide the outline it names
    // a picked piece's width and depth along its edges, close in
    add({ id: 'fs-sp-dim', type: 'symbol', source: SRC, minzoom: 17, filter: kind('dim'), layout: { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 17, 9.5, 20, 12], 'text-rotate': ['get', 'r'], 'text-rotation-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { ...ink, 'text-color': Ln.sel } });
    // drawing: the line being drawn, the street edge under the pointer (Street Side, Side Street), the handles
    add({ id: 'fs-sp-hv', type: 'line', source: DSRC, filter: ['==', ['get', 'hv'], 1], layout: { 'line-cap': 'round' }, paint: { 'line-color': Ln.frontage, 'line-width': 9, 'line-opacity': .6 } });
    add({ id: 'fs-sp-mf', type: 'fill', source: DSRC, filter: ['==', ['get', 'k'], 'mfill'], paint: { 'fill-color': Ln.accent, 'fill-opacity': .14 } }); // an area being drawn or measured
    add({ id: 'fs-sp-dl', type: 'line', source: DSRC, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'hv'], 1]], paint: { 'line-color': Ln.accent, 'line-width': ['case', ['==', ['get', 'rb'], 1], 1.6, 2.5], 'line-dasharray': [2, 1.5] } });
    add({ id: 'fs-sp-dp', type: 'circle', source: DSRC, filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'k']]], paint: { 'circle-radius': big ? 7 : 5, 'circle-color': Ln.accent, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    add({ id: 'fs-sp-ml', type: 'symbol', source: DSRC, filter: ['in', ['get', 'k'], ['literal', ['mlab', 'mtot']]], layout: { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-size': ['case', ['==', ['get', 'k'], 'mtot'], 13, 11], 'text-offset': ['case', ['==', ['get', 'k'], 'mtot'], ['literal', [0, -1.4]], ['literal', [0, 0]]], 'text-rotate': ['coalesce', ['get', 'r'], 0], 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': Lb.ink, 'text-halo-color': Lb.halo, 'text-halo-width': 2 } }); // lengths, the total, the area
    // handles: the turn dot and a shape's points (circles); a rectangle's corners (squares), its sides and a shape's
    // edges (white bars along them, to drag that side alone), and the + beside an edge that adds a point
    handleImages(big, Ln.accent, mp);
    const hr = big ? [10, 9] : [7, 6]; // the turn dot, a point or a scaling corner
    add({ id: 'fs-sp-h', type: 'circle', source: HSRC, filter: ['in', ['get', 't'], ['literal', ['r', 'v', 's']]], paint: { 'circle-radius': ['case', ['==', ['get', 't'], 'r'], hr[0], hr[1]], 'circle-color': ['case', ['==', ['get', 't'], 'r'], Ln.accent, '#ffffff'], 'circle-stroke-color': ['case', ['==', ['get', 't'], 'r'], '#ffffff', '#0b0d0c'], 'circle-stroke-width': big ? 2 : 1.5 } });
    add({ id: 'fs-sp-hs', type: 'symbol', source: HSRC, filter: ['in', ['get', 't'], ['literal', ['c', 'e', 'm', 'p']]], layout: { 'icon-image': ['match', ['get', 't'], 'c', 'sp-h-sq', 'p', 'sp-h-plus', 'sp-h-bar'], 'icon-rotate': ['get', 'a'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    if (mp === map) draw();
  }
  // the handle images, drawn once per style (2× for sharp edges): a corner square, a side bar (drawn east-west, turned
  // along its side by icon-rotate) and the + that adds a point; fingers get them larger
  function handleImages(big, accent, mp = map) {
    const img = (id, w, h, paint) => { if (mp.hasImage(id)) return; const r = 2, c = document.createElement('canvas'); c.width = w * r; c.height = h * r; const g = c.getContext('2d'); g.scale(r, r); paint(g, w, h);
      try { mp.addImage(id, g.getImageData(0, 0, w * r, h * r), { pixelRatio: r }); } catch (e) { /* the circles still show */ } };
    const k = big ? 1.4 : 1, ink = '#0b0d0c';
    const rr = (g, x, y, w, h, q) => { g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath(); };
    img('sp-h-sq', Math.round(11 * k), Math.round(11 * k), (g, w, h) => { g.fillStyle = '#fff'; g.strokeStyle = ink; g.lineWidth = 1.5; g.fillRect(1.5, 1.5, w - 3, h - 3); g.strokeRect(1.5, 1.5, w - 3, h - 3); });
    img('sp-h-bar', Math.round(22 * k), Math.round(9 * k), (g, w, h) => { rr(g, 1.5, 1.5, w - 3, h - 3, (h - 3) / 2); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = ink; g.lineWidth = 1.5; g.stroke(); });
    img('sp-h-plus', Math.round(15 * k), Math.round(15 * k), (g, w, h) => { g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1.5, 0, Math.PI * 2); g.fillStyle = accent; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      g.beginPath(); g.moveTo(w / 2, h * .28); g.lineTo(w / 2, h * .72); g.moveTo(w * .28, h / 2); g.lineTo(w * .72, h / 2); g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round'; g.stroke(); });
  }
  ctx.onOverlays?.(() => { for (const id of ids) if (map.getLayer(id)) map.removeLayer(id); ids = [];
    for (const s of [SRC, HSRC, DSRC, XSRC, GRSRC]) if (map.getSource(s)) map.removeSource(s); if (map.getSource(GSRC)) { for (const id of ['fs-sp-ghost', 'fs-sp-ghost-f']) if (map.getLayer(id)) map.removeLayer(id); map.removeSource(GSRC); }
    if (ed) { keySig = ''; addLayers(); hideMapBits(); } else if (resume) { const x = planOf(resume); if (x) ghost(x.pl); } });
  function handles(pl) {
    const e = ed.editing && sels().length === 1 && pl.elements.find(x => x.id === ed.sel); if (!e || !T.editable(T.viewOf(pl), e)) return []; // one piece, on a layer that isn't hidden or locked
    const F = SP.frame(pl.origin), px = ftPerPx(), big = coarse(), deg = (p, q) => +(-Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI).toFixed(1); // a bar's turn on the map (clockwise from east)
    // t: what the handle is (c corner, r turn, e a side, s scale, v a point, m an edge, p add a point); a: a bar's turn
    // the green turn dot of a curved or drawn piece: above its middle, clear of its outline, turned with it
    const freeDot = (x, conv) => { const o = SP.outline(x), c = SP.centroid(o), L = Math.max(...o.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]))) + 14 + (big ? 26 * px : 0), q = SP.rotPt([0, L], x.rot || 0); return { i: 'r', t: 'r', at: F.toLL([c[0] + q[0], c[1] + q[1]]), conv }; };
    const ent = T.isEntrance(e), nst = isNetStreet(pl, e); // an entrance (or a street of a neighbourhood's network) shows its bend points without Edit Shape (an outline from the layout is read as its route; the first drag makes it one)
    if (nst && ed.shape !== e.id) { const P = e.path, st = netStep(px), c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); const L = c[c.length - 1], k = [0]; // a street of the network: a handle every so often along it (its line is drawn with a point every 10 ft), each dragging the street round it in a smooth bend
      for (let i = 1; i < P.length - 1; i++) if (c[i] - c[k[k.length - 1]] >= st && L - c[i] >= st / 2) k.push(i); k.push(P.length - 1); return k.map(i => ({ i: 'v' + i, t: 'v', at: F.toLL(P[i]), ft: P[i] })); }
    if (ed.shape === e.id && e.path && T.routeable(e) || ent || nst) { const R = e.path ? e : SP.routeOf(e, pl.ring), conv = !e.path, P = R.path, out = P.map((p, i) => ({ i: 'v' + i, t: 'v', at: F.toLL(p), ft: p, conv })); // a route: its points, and a + in the middle of each stretch long enough
      for (let i = 0; i + 1 < P.length; i++) { const q = P[i + 1]; if (Math.hypot(q[0] - P[i][0], q[1] - P[i][1]) / px < (big ? 44 : 30)) continue; const m = [(P[i][0] + q[0]) / 2, (P[i][1] + q[1]) / 2]; out.push({ i: 'p' + i, t: 'p', at: F.toLL(m), ft: m, conv }); }
      return ent ? out.concat([freeDot(R, conv)]) : out; }
    if (ed.shape === e.id && e.poly) { const P = e.poly, out = P.map((p, i) => ({ i: 'v' + i, t: 'v', at: F.toLL(p), ft: p })); // shape editing: every point; on each edge long enough, a bar to drag it and a + beside it to add a point
      P.forEach((p, i) => { const q = P[(i + 1) % P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]) / px; if (L < (big ? 44 : 30)) return;
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], n = T.edgeNormal(P, i), o = (big ? 24 : 17) * px, pp = [m[0] + n[0] * o, m[1] + n[1] * o];
        out.push({ i: 'm' + i, t: 'm', at: F.toLL(m), ft: m, a: deg(p, q) }, { i: 'p' + i, t: 'p', at: F.toLL(pp), ft: pp }); });
      return out; }
    // the turn dot: above the piece's top (its own +v), or below it when the top's spot is on another building (the
    // drag turns from where it's grabbed, so either works); fingers get it further out
    const onB = q => pl.elements.some(x => x !== e && (x.kind === 'building' || x.kind === 'garage') && SP.hitRect(x, q));
    const dotAt = (up, dn) => { const a = (e.rot || 0) * Math.PI / 180, ex = big ? 26 * px : 0, at = (s, L) => [e.x - Math.sin(a) * L * s, e.y + Math.cos(a) * L * s], A = at(1, up + ex), B = at(-1, dn + ex); return { i: 'r', t: 'r', at: F.toLL(onB(A) && !onB(B) ? B : A) }; };
    const turnDot = P => { const vs = P.map(p => SP.toLocal(e, p)[1]), top = Math.max(...vs), bot = -Math.min(...vs); return dotAt(top + Math.max(14, top * 0.3), bot + Math.max(14, bot * 0.3)); };
    if (e.poly && faceted(e)) { const P = e.poly, out = []; // a custom outline: a bar on each face long enough on screen (drag it straight out or in) and the turn dot
      P.forEach((p, i) => { const q = P[(i + 1) % P.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) / px < (big ? 56 : 40)) return; const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; out.push({ i: 'm' + i, t: 'm', at: F.toLL(m), ft: m, a: deg(p, q) }); });
      return out.concat([turnDot(P)]); }
    if (SP.isFree(e)) { const o = SP.outline(e), xs = o.map(p => p[0]), ys = o.map(p => p[1]); // curved pieces: corner handles scale the whole shape; an outline turns too
      return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]].map((p, i) => ({ i: 's' + i, t: 's', at: F.toLL(p), ft: p })).concat([e.poly ? turnDot(e.poly) : freeDot(e)]); } // (every piece turns: a curved one about its middle)
    const c = SP.corners(e), L = e.d / 2 + Math.max(14, e.d * 0.15);
    const sides = [0, 1, 2, 3].filter(k => (k % 2 ? e.d : e.w) / px >= (big ? 56 : 40)).map(k => ({ i: 'e' + k, t: 'e', at: F.toLL(T.sideMid(e, k)), ft: T.sideMid(e, k), a: deg(c[k], c[(k + 1) % 4]) })); // a side long enough on screen for a bar between its corners
    return c.map((p, i) => ({ i, t: 'c', at: F.toLL(p), ft: p, a: -(e.rot || 0) })).concat(sides, [dotAt(L, L)]);
  }
  // a street of the network moved by hand (a point dragged, added or taken out): the streets that T into it carried along
  // (lib/streetedit.mjs carryTees), and a toast when one of its own ends no longer meets the street it met
  function carryNet(pl, el, before, els0) {
    pl.elements = SE.carryTees(pl.elements, el.id, before, el.path); const lost = SE.teesLost({ ...pl, elements: els0 }, pl, el.id);
    if (lost.length) ctx.toast('That end no longer meets ' + lost[0].replace(/^The /, 'the ') + ': it’s a dead end now (Make It a Cul-de-sac, or drag it back).');
  }
  const netStep = (px = ftPerPx()) => Math.max(80, 56 * px); // (the spacing of a network street's handles, and how far a drag of one bends it either way)
  const isNetStreet = (pl, e) => !!(e && pl?.recipe?.net && e.kind === 'drive' && e.net && e.path && !e.bulb && !e.closed); // a street of a neighbourhood's network (lib/streetedit.mjs)
  const ftPerPx = () => 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (512 * 2 ** map.getZoom()) * 3.28084;
  // layouts run in a worker (sp-worker.js) so the page stays responsive; straight in the page if workers aren't there
  let worker = null, wseq = 0; const wait = new Map();
  // a Waller plan's layouts: the engine gets the scenario's inputs (lib/guardrails.mjs forLayout) and what comes back is
  // kept with the plan's own working numbers (unapply); every other plan goes to the engine as it is
  function laid(fn, ...args) {
    if (fn === 'options' && args[0]?.ring?.length >= 3 && !args[0].terrain) { const t = terrainNow(args[0]); if (t) args[0] = { ...args[0], terrain: t }; else terrainOf(args[0]); } // the pond goes on the low side (lib/sitelayout.mjs)
    const g = fn === 'refit' ? G.forLayout(args[0], args[0]?.program, {}) : G.forLayout(args[0], args[1], args[2] || {});
    if (!g) return laid0(fn, ...args);
    const base = fn === 'refit' ? args[0] : { ...args[0], program: args[1] };
    return laid0(fn, ...(fn === 'refit' ? [g.plan, args[1] || {}] : [g.plan, g.program, g.opts])).then(r => fn === 'refit' ? G.unapply(r, base) : (r || []).map(o => G.unapply(o, base)));
  }
  function laid0(fn, ...args) {
    try { if (!worker) { worker = new Worker(new URL('./sp-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = ({ data }) => { const w = wait.get(data.id); if (!w) return; wait.delete(data.id); data.ok ? w.ok(data.result) : w.no(new Error(data.error)); }; worker.onerror = e => { for (const w of wait.values()) w.no(new Error(e.message || 'layout worker failed')); wait.clear(); worker = null; }; } }
    catch (e) { worker = null; }
    if (!worker) return new Promise((ok, no) => setTimeout(() => { try { ok(fn === 'refit' ? refit(...args) : fn === 'pods' ? relayPods(...args) : fn === 'net' ? netEdit(...args) : layoutOptions(...args)); } catch (e) { no(e); } }, 30));
    const id = ++wseq; return new Promise((ok, no) => { wait.set(id, { ok, no }); worker.postMessage({ id, fn, args: JSON.parse(JSON.stringify(args)) }); });
  }
  let lastKeep = null, keySig = '';
  function draw() {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const pl = ed && PL(), s = map.getSource(SRC); if (!s) return;
      let fc = pl?.ring.length >= 3 ? SP.planFeatures(G.effective(pl), ed.sel, drag?.moved ? lastKeep : null) : EMPTY; const P0 = P(); lastKeep = fc.keep || null; // mid-drag: last planting and checks
      const set = fc !== EMPTY ? sels() : [];
      if (set.length > 1) { const on = new Set(set); for (const f of fc.features) { const q = f.properties; if (q?.id != null && on.has(q.id)) q.sel = 1; } } // every piece of a set lit up
      if (set.length === 1) { const one = pl.elements.find(e => e.id === set[0]), F = SP.frame(pl.origin); for (const d of T.dimLabels(one, Math.max(10, (ed.editing ? 17 : 11) * ftPerPx()))) fc.features.push({ type: 'Feature', properties: { k: 'dim', t: d.text, r: d.rot, kind: one.kind }, geometry: { type: 'Point', coordinates: F.toLL(d.at) } }); } // its width and depth
      if (fc !== EMPTY) MAP.decorate(fc, pl, { flash: ed.hov ? new Set([...(ed.flash?.ids || []), ed.hov]) : ed.flash?.ids }); // ed.hov: a row hovered in Items // labels know their piece, priorities, Phase 2 labels (one pass)
      const mixed = fc !== EMPTY && ed.mix ? mixFeatures(fc, pl) : null; // the development mix: each building in its use's colour
      if (fc !== EMPTY && (pl.parcels?.length > 1 || ed.mode === 'parcels')) for (const k of pl.parcels || []) { const r = P0.parcels.find(x => x.key === k); if (r?.geometry) fc.features.push({ type: 'Feature', properties: { k: 'pline' }, geometry: r.geometry }); }
      const V = T.viewOf(pl); if (fc !== EMPTY) fc = T.visibleFeatures(fc, V); // hidden layers: the map only (numbers, checks and exports count everything)
      syncMix(); s.setData(fc); drawGrid(pl, V); // the mix layers go on (or off) with the data they read, in one reload
      map.getSource(HSRC)?.setData(pl?.ring.length >= 3 ? { type: 'FeatureCollection', features: handles(pl).map(h => ({ type: 'Feature', properties: { t: h.t, a: h.a || 0 }, geometry: { type: 'Point', coordinates: h.at } })) } : EMPTY);
      drawD(); if (mixed) paintMix(mixed);
      // something picked: the other buildings step back (extrusion opacity is per layer, so it's set here, only on a change)
      const dim = !!(ed?.sel && pl?.elements.some(e => e.id === ed.sel)); if (dim !== dimmed && map.getLayer('fs-sp-bldg')) { dimmed = dim; map.setPaintProperty('fs-sp-bldg', 'fill-extrusion-opacity', dim ? .75 : .88); map.setPaintProperty('fs-sp-bldg2', 'fill-extrusion-opacity', dim ? .5 : .6); map.setPaintProperty('fs-sp-b3', 'fill-extrusion-opacity', dim ? .75 : .95); }
      if (!drag?.moved) { planKey(pl); if (popKind === 'layers') paintItems(); } // never mid-drag; the Items list follows the plan
    });
  }
  // the grid (pl.view.grid): light lines square to the lot over the site's box, from street zoom (redrawn only on a change)
  let gridKey = '';
  function drawGrid(pl, V) {
    const src = map.getSource(GRSRC); if (!src) return; const step = pl && pl.ring.length >= 3 ? V.grid : 0, key = step ? step + '|' + pl.origin + '|' + JSON.stringify(pl.ring) : '';
    if (key === gridKey) return; gridKey = key; const F = step && SP.frame(pl.origin);
    src.setData(step ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: T.gridLines(pl.ring, step, frameAngle(pl), 1200).map(l => l.map(F.toLL)) } }] } : EMPTY);
  }
  // the Plan key in the map's legend card: what this plan uses, Phase 1 and 2, the lines, Problem (rebuilt only when that changes)
  function planKey(pl) {
    if (!ed || !pl) { if (keySig) { keySig = ''; ctx.setLegend?.('siteplan', ''); } return; }
    const sig = MAP.keySig(pl); if (sig === keySig) return; keySig = sig;
    ctx.setLegend?.('siteplan', MAP.keyHtml(pl));
  }

  // ----- the development mix (the tool strip's Mix, U): each use's buildings in their own colour, the rest greyed, and a
  // card with each use's footprint acres and share of the site (lib/sitetools.mjs mixOf). A view only, like Layers: it
  // stays on through Edit, tools and selection, and goes with Mix again, the card's ×, Esc (last) or closing the plan.
  // On the map: a grey wash over the site's ground (paving, lawns, ponds), the zones tinted and outlined in their use's
  // colour, and the buildings' fills taken from `mx` (set per feature here) in place of their usual colour.
  const MIXL = ['fs-sp-mix-mute', 'fs-sp-mix-zf', 'fs-sp-mix-zl'], MIXB = ['fs-sp-bldg', 'fs-sp-bldg2', 'fs-sp-bsel', 'fs-sp-b3', 'fs-sp-b3s'];
  let mixWas = null, mixHover = null;
  function setMix(on) {
    if (!ed) return; const pl = PL(); if (on && !pl?.elements.some(e => e.kind === 'building')) return;
    ed.mix = !!on; ed.mixPin = null; mixHover = null; if (on && ed.mixFold == null) ed.mixFold = phone(); // phones: folded to the total at first, as the Plan key is
    if (!on) { mixEl.hidden = true; mixEl.innerHTML = ''; mixEl.dataset.html = ''; }
    draw(); paintTools();
  }
  function mixFeatures(fc, pl) {
    const x = T.mixOf(pl), cols = Object.fromEntries(x.rows.map(r => [r.use, r.color])), prog = SP.normalizeProgram(pl.program), focus = mixHover || ed.mixPin || null;
    const key = new Map(pl.elements.filter(e => e.kind === 'building' || e.kind === 'garage').map(e => [e.id, T.mixKey(pl, e, prog)])), zone = new Map(x.zones.map(z => [z.name, z]));
    for (const f of fc.features) { const q = f.properties; if (!q) continue;
      if ((q.k === 'building' || q.k === 'garage') && key.has(q.id)) { const c = T.mixFill(key.get(q.id), cols, { ph: q.ph, focus }); q.mx = q.sel === 1 ? MAP.brighten(c) : c; }
      else if (q.k === 'b3' && q.part === 'tower' && key.has(q.bid)) q.mx = T.mixFill(key.get(q.bid), cols, { ph: q.ph, focus });
      else if (q.k === 'zone' && zone.has(q.t)) { const z = zone.get(q.t); q.mx = z.color; q.mz = !focus || z.use === focus ? 1 : 0; } }
    return x;
  }
  // the mix's layers and colours on the map when it's on, gone (and the usual colours back) when it's off or the plan
  // closes; a basemap change rebuilds the plan's layers (their ids include these), and the next draw puts the mix back
  function syncMix() {
    const want = !!ed?.mix && !!map.getLayer('fs-sp-lotc'), has = !!map.getLayer(MIXL[0]);
    if (want && !has) {
      const add = def => { map.addLayer(def, 'fs-sp-lotc'); ids.push(def.id); }, zf = ['all', ['==', ['get', 'k'], 'zone'], ['has', 'mx']];
      add({ id: MIXL[0], type: 'fill', source: SRC, filter: ['all', ['==', ['get', 'k'], 'lot'], ['==', ['get', 'site'], 1]], paint: { 'fill-color': '#eef0ee', 'fill-opacity': .8 } }); // the ground greyed: paving, lawns, ponds
      add({ id: MIXL[1], type: 'fill', source: SRC, filter: zf, paint: { 'fill-color': ['get', 'mx'], 'fill-opacity': ['case', ['==', ['get', 'mz'], 1], .14, .03] } });
      add({ id: MIXL[2], type: 'line', source: SRC, filter: zf, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'mx'], 'line-width': 2, 'line-opacity': ['case', ['==', ['get', 'mz'], 1], .9, .3] } });
      mixWas = {}; for (const id of MIXB) if (map.getLayer(id)) { const v = map.getPaintProperty(id, 'fill-extrusion-color'); mixWas[id] = v; map.setPaintProperty(id, 'fill-extrusion-color', ['case', ['has', 'mx'], ['to-color', ['get', 'mx']], v]); }
    } else if (!want && has) {
      for (const id of MIXL) if (map.getLayer(id)) map.removeLayer(id); ids = ids.filter(id => !MIXL.includes(id));
      for (const [id, v] of Object.entries(mixWas || {})) if (map.getLayer(id)) map.setPaintProperty(id, 'fill-extrusion-color', v); mixWas = null;
    }
  }
  // the card: one row a use (its colour, footprint acres, share of the site; buildings and floor area under it), the
  // total, garages apart, and a mixed-use plan's zones. Hover a row (or click it, to keep it) and only that use is lit.
  const mixEl = document.createElement('div'); mixEl.className = 'sp-dmix'; mixEl.hidden = true; mixEl.setAttribute('role', 'region'); mixEl.setAttribute('aria-label', 'Development mix');
  mapUi.appendChild(mixEl);
  const n0 = v => Math.round(v).toLocaleString('en-US'), plur = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function paintMix(x) {
    if (!ed?.mix) return; const pin = ed.mixPin, lit = new Set(x.rows.map(r => r.use)), fold = !!ed.mixFold;
    // a row: a button that picks its use out when there are buildings of it, else plain; subs: lines under it
    const row = (use, color, name, acres, pct, subs = [], cls = '') => { const b = lit.has(use), on = b && pin === use, tag = b ? 'button' : 'div';
      return '<' + tag + (b ? ' type="button"' : '') + ' class="sp-mx-r' + cls + (on ? ' on' : '') + '"' + (b ? ' data-mu="' + esc(use) + '" aria-pressed="' + on + '" title="' + (on ? 'Show every use again' : 'Show only ' + esc(T.mixLabel(use))) + '"' : '') + '>' +
        '<i class="sp-mx-sw" style="--c:' + color + '" aria-hidden="true"></i><span class="sp-mx-n">' + esc(name) + '</span><span class="sp-mx-a">' + T.fmtAc(acres) + '</span><span class="sp-mx-p">' + T.fmtPct(pct) + '</span>' +
        subs.map(t => '<small class="sp-mx-s">' + t + '</small>').join('') + '</' + tag + '>'; };
    const count = (n, noun) => plur(n, noun, noun + 's');
    const uses = x.rows.map(r => row(r.use, r.color, r.label, r.acres, r.pctSite, [count(r.buildings, r.noun) + ' · ' + n0(r.gfa) + ' sf floor area', ...(r.phase2 ? ['Phase 2: ' + count(r.phase2.buildings, r.noun) + ', ' + T.fmtAc(r.phase2.acres)] : [])])).join('');
    const zones = x.zones.length ? '<div class="sp-mx-zh"><b>Zones</b><small>Land given to each use, its parking included</small></div><div class="sp-mx-rows">' + x.zones.map(z => row(z.use, z.color, z.name, z.acres, z.pctSite, [], ' sp-mx-zr')).join('') + '</div>' : '';
    const html = '<div class="sp-mx-h"><button type="button" class="sp-mx-f" aria-expanded="' + !fold + '" title="' + (fold ? 'Show each use' : 'Fold to the total') + '"><b>Development mix</b>' + CHEV + '</button><button type="button" class="sp-mx-x" aria-label="Close the development mix" title="Close (U)">' + XS + '</button></div>' +
      (fold ? '' : '<div class="sp-mx-hd" aria-hidden="true"><span>Building footprint</span><span>Acres</span><span>Of site</span></div><div class="sp-mx-rows">' + (uses || '<div class="sp-mx-e">No buildings yet.</div>') + '</div>') +
      '<div class="sp-mx-t"><span>All buildings</span><span class="sp-mx-a">' + T.fmtAc(x.total.acres) + '</span><span class="sp-mx-p">' + T.fmtPct(x.total.pctSite) + '</span></div>' +
      (fold ? '' : '<div class="sp-mx-note">Of the ' + T.fmtAc(x.siteAcres) + ' site, buildings only: no parking, drives, landscape or ponds.' + (x.garages ? ' ' + plur(x.garages.count, 'parking garage', 'parking garages') + ' (' + T.fmtAc(x.garages.acres) + ') count as parking.' : '') + '</div>' + zones);
    if (html !== mixEl.dataset.html) { // unchanged: left as it is (hover and focus stay put)
      mixEl.dataset.html = html; const a = document.activeElement, f = a && mixEl.contains(a) ? a.dataset.mu || (a.classList.contains('sp-mx-f') ? 'f' : 'x') : null;
      mixEl.innerHTML = html; mixEl.classList.toggle('fold', fold);
      mixEl.querySelector('.sp-mx-x').onclick = () => setMix(false);
      mixEl.querySelector('.sp-mx-f').onclick = () => { ed.mixFold = !ed.mixFold; paintMix(x); };
      mixEl.querySelectorAll('button[data-mu]').forEach(b => { const u = b.dataset.mu;
        b.onpointerenter = e => { if (e.pointerType === 'mouse' && mixHover !== u) { mixHover = u; draw(); } }; b.onpointerleave = () => { if (mixHover === u) { mixHover = null; draw(); } }; // a mouse only: a tap picks (click)
        b.onclick = () => { ed.mixPin = ed.mixPin === u ? null : u; draw(); }; });
      if (f) mixEl.querySelector(f === 'x' ? '.sp-mx-x' : f === 'f' ? '.sp-mx-f' : 'button[data-mu="' + CSS.escape(f) + '"]')?.focus({ preventScroll: true });
    }
    mixEl.hidden = !!popKind; placeMix();
  }
  // Desktop: in the legend's column, just above it (the plan is fitted clear of the legend, so that column is open
  // map), else above the tool strip (and the mode chip). Phones: under the strip and the chip, top left.
  function placeMix() {
    if (mixEl.hidden || mapUi.hidden) return; const ph = phone(), sl = parseFloat(strip.style.left) || (ph ? 8 : GUT), chip = !pillMode.hidden, H = mapUi.clientHeight;
    if (ph) { const top = chip ? pillMode.offsetTop + pillMode.offsetHeight + 6 : strip.hidden ? 8 : strip.offsetTop + strip.offsetHeight + 6; Object.assign(mixEl.style, { left: sl + 'px', top: top + 'px', bottom: 'auto', width: '', maxHeight: Math.max(96, H - top - 8) + 'px' }); return; }
    const u = mapUi.getBoundingClientRect(), lg = document.getElementById('legends'), L = lg && lg.offsetParent !== null && getComputedStyle(lg).visibility !== 'hidden' ? lg.getBoundingClientRect() : null;
    if (L && L.width > 2 && L.left < u.left + GUT * 3 && L.bottom > u.top + H / 2 && L.top - u.top - GUT >= 180) { const bottom = Math.round(u.bottom - L.top + GAP);
      Object.assign(mixEl.style, { left: Math.round(Math.max(GUT, L.left - u.left)) + 'px', top: 'auto', bottom: bottom + 'px', width: Math.round(Math.max(264, Math.min(300, L.width))) + 'px', maxHeight: Math.round(H - bottom - GUT) + 'px' }); return; }
    const sb = parseFloat(strip.style.bottom) || GUT, bottom = (chip ? (parseFloat(pillMode.style.bottom) || sb) + pillMode.offsetHeight : sb + (strip.hidden ? 0 : strip.offsetHeight)) + 8;
    Object.assign(mixEl.style, { left: sl + 'px', top: 'auto', bottom: bottom + 'px', width: '', maxHeight: Math.max(120, H - bottom - GUT) + 'px' });
  }

  // ---------- pointer: select, move, resize, rotate ----------
  const ftAt = (pl, lngLat) => SP.frame(pl.origin).toFt([lngLat.lng, lngLat.lat]);
  const SHAPEABLE = ['building', 'plaza', 'green', 'pond', 'court', 'pool', 'patio', 'play', 'garage', 'parking']; // pieces whose outline can be edited point by point
  const faceted = e => !!e.poly && (e.poly.length <= 16 || ['building', 'garage', 'parking'].includes(e.kind)); // a drawn or reshaped outline (its faces can be dragged), not a pond's natural curve (that scales)
  const ORDER = ['sign', 'trash', 'foodtruck', 'patio', 'building', 'garage', 'pool', 'court', 'play', 'plaza', 'canopy', 'tanks', 'pond', 'keepout', 'fence', 'drive', 'truck', 'parking', 'trail', 'green']; // small pieces over what they sit on; house lots are lines, never picked
  // what's under the pointer: the selected piece's nearest handle (a finger gets more room than a mouse), else the piece
  // (plan pieces in feet, turned or not: never map tiles). A face bar is caught only along the bar as drawn, and a
  // handle the pointer is merely near gives way to another piece it's on, so a click meant for a neighbour picks it.
  function hit(pl, e) {
    const big = coarse(), k = big ? 1.4 : 1, F = SP.frame(pl.origin); let best = null, bd = Infinity;
    for (const h of handles(pl)) { const p = map.project(h.at), dx = e.point.x - p.x, dy = e.point.y - p.y; let dd, tight;
      if (h.t === 'e' || h.t === 'm') { const r = -(h.a || 0) * Math.PI / 180, q = map.project(F.toLL([h.ft[0] + Math.cos(r) * 5, h.ft[1] + Math.sin(r) * 5])), L = Math.hypot(q.x - p.x, q.y - p.y) || 1, ux = (q.x - p.x) / L, uy = (q.y - p.y) / L;
        const s = Math.abs(dx * ux + dy * uy), t = Math.abs(dx * uy - dy * ux), hl = 11 * k, ht = 4.5 * k; if (s > hl + (big ? 8 : 3) || t > ht + (big ? 10 : 5)) continue; // the bar, drawn along its face
        dd = Math.max(0, s - hl) + t; tight = s <= hl + 1 && t <= ht + 1; }
      else { dd = Math.hypot(dx, dy); if (dd >= (big ? 22 : 12)) continue; tight = dd <= (big ? 12 : 7); }
      if (dd < bd) { bd = dd; best = { h, tight }; } }
    const ft = ftAt(pl, e.lngLat), V = T.viewOf(pl); // hidden and locked layers can't be picked
    const piece = () => { for (const kd of ORDER) { const el = pl.elements.slice().reverse().find(x => x.kind === kd && T.editable(V, x) && SP.hitRect(x, ft)); if (el) return el; } return null; };
    if (best) { if (!best.tight) { const el = piece(); if (el && el.id !== ed.sel) return { el }; } return { h: best.h.i, hd: best.h }; }
    const el = piece(); return el ? { el } : null;
  }
  let drag = null;
  // Shift-click: a piece in or out of the set (the last one picked is the primary)
  function toggleSel(id) {
    const cur = sels(), has = cur.includes(id), next = has ? cur.filter(x => x !== id) : cur.concat(id);
    ed.multi = next.length > 1 ? next : []; ed.sel = has ? (ed.sel === id ? next[next.length - 1] || null : ed.sel) : id; ed.shape = null; draw(); panel();
  }
  function down(e) {
    const pl = ed && PL(); if (!pl || ed.mode || ctx.view !== 'map' || pl.ring.length < 3) return;
    const oe = e.originalEvent; if (oe?.button > 0 || oe?.touches?.length > 1) return;
    const h = hit(pl, e); ed.clickFt = ftAt(pl, e.lngLat); ed.clickOn = h?.el?.id ?? null; // (where it was clicked, and on what: Delete This Stretch takes the stretch there)
    if (oe?.shiftKey && !(h && h.h != null)) { e.preventDefault(); // Shift: a piece in or out of the set, or a box drawn on open map (Edit or not)
      drag = { type: 'box', p0: e.point, p1: e.point, moved: false, on: h?.el?.id ?? null }; // a click toggles the piece under it; a drag draws a box
      return; }
    if (!h) return;
    if (!ed.editing) { if (h.el && (ed.sel !== h.el.id || sels().length > 1)) { pickOne(h.el.id); panel(); draw(); } return; } // looking, not editing: a click selects and the map still pans
    e.preventDefault(); // stops the map's own drag-to-pan for this press
    const el = h.el || pl.elements.find(x => x.id === ed.sel); if (!el) return;
    const set = sels(); // a piece of the set: the whole set moves (each with what's attached to it)
    if (h.el && h.h == null && set.length > 1 && set.includes(h.el.id)) { ed.sel = h.el.id; drag = { type: 'set', ids: T.withAttached(pl, set).map(x => x.id), id: el.id, from: ftAt(pl, e.lngLat), orig: clone(pl.elements), lead: clone(el), snap: snapshot(), moved: false }; return; }
    if (h.el && (ed.sel !== el.id || set.length > 1)) { pickOne(el.id); panel(); draw(); }
    const t = h.hd?.t, k0 = typeof h.h === 'string' ? +h.h.slice(1) : h.h, snap0 = h.hd?.conv && !el.path ? snapshot() : null, pre = snap0 ? clone(el) : null; if (snap0) SP.toRoute(el, pl.ring); // an entrance drawn as an outline: a route from its first drag (one undo step with it; let go unmoved, it's put back)
    const parts = T.isEntrance(el) ? SP.entryParts(pl, el).map(x => x.id) : null; // its median and signs: drawn again for where it ends up
    if (t === 'v' || t === 'p') { // a point of the shape (the + beside an edge adds one in the middle of it first, and drags it)
      let k = k0; const snap = snap0 || snapshot(); if (t === 'p' && el.path && !el.poly) { const P = el.path, q = P[k + 1]; P.splice(k + 1, 0, [+((P[k][0] + q[0]) / 2).toFixed(2), +((P[k][1] + q[1]) / 2).toFixed(2)]); k++; }
      else if (t === 'p') { const P = el.poly, q = P[(k + 1) % P.length]; P.splice(k + 1, 0, [+((P[k][0] + q[0]) / 2).toFixed(2), +((P[k][1] + q[1]) / 2).toFixed(2)]); k++; }
      drag = { type: 'vertex', k, id: el.id, from: ftAt(pl, e.lngLat), orig: clone(el), snap, moved: t === 'p', parts, pre, soft: isNetStreet(pl, el) && ed.shape !== el.id ? netStep() : 0 }; draw(); return; }
    // a side of a rectangle or an edge of a shape: only it moves, straight out or in
    if (t === 'e' || t === 'm') { drag = { type: t === 'e' ? 'side' : 'edge', k: k0, id: el.id, from: ftAt(pl, e.lngLat), orig: clone(el), snap: snapshot(), moved: false }; return; }
    const hs = t === 's' ? h.hd : null;
    drag = { type: h.h == null ? 'move' : h.h === 'r' ? 'rot' : hs ? 'scale' : 'size', k: h.h, corner: hs?.ft, id: el.id, from: ftAt(pl, e.lngLat), orig: clone(el), snap: snap0 || snapshot(), moved: false, parts, pre };
    if (drag.type === 'rot') { if (T.isEntrance(el) || SP.isFree(el) && !faceted(el)) { drag.grp = [el, ...SP.attachedTo(pl, el)].map(clone); drag.c = SP.centroid(SP.outline(el)); } // a curved piece or an entrance turns about its middle (SP.turnPiece), what goes with it put back each time; a rectangle or a drawn outline as T.turnPiece turns it
      drag.targets = T.turnTargets(pl, el); const f = drag.from, c0 = drag.c || [el.x, el.y], g = Math.atan2(f[1] - c0[1], f[0] - c0[0]) * 180 / Math.PI - 90; drag.off = ((((el.rot || 0) - g) % 360) + 540) % 360 - 180; } // what a turn lines up with (the street, the site's edges, the buildings' faces); it turns from where the dot was grabbed
    if (drag.type === 'move' && T.isEntrance(el)) drag.m0 = (el.path || SP.routeOf(el, pl.ring).path)[0]; // its mouth: slides along the street
    if (drag.type === 'move') { const att = SP.attachedTo(pl, el); drag.att = att.map(a => ({ id: a.id, orig: clone(a) })); if (el.kind === 'building' || el.kind === 'garage') drag.obs = SP.spotObstacles(pl, el, att); else if (SP.isPark(el)) drag.obs = SP.placeObs(pl, el, att, SP.shapeOf(el)); } // what moves with it, and what it has to stay clear of (a park: not what stands in it, nor more room than it has now)
  }
  // the grid, when it's on and Alt isn't held: where a point or a piece lands (a corner square with the grid, else its middle)
  const gridOf = (pl, ev) => { const V = T.viewOf(pl); return V.grid && !ev?.altKey ? { step: V.grid, a: frameAngle(pl) } : null; };
  const onGrid = (G, e) => { const sq = !SP.isFree(e) && Math.abs((((e.rot || 0) - G.a) % 90 + 135) % 90 - 45) < 1, c = sq ? SP.corners(e)[0] : [e.x, e.y], q = T.snapPt(c, G.step, G.a); return [q[0] - c[0], q[1] - c[1]]; };
  // while a face, a point or the turn dot is dragged: live labels (the face's length and how far it's moved, the sides
  // either side of a point, the turn and what it's square to) and a thin guide line, drawn with the measuring layers
  const guide = list => { if (ed) { ed.guide = list && list.length ? list : null; drawD(); } };
  const offPx = n => n * ftPerPx() * (coarse() ? 1.4 : 1);
  const along = (a, b) => { const F = SP.frame(PL().origin), p = map.project(F.toLL(a)), q = map.project(F.toLL(b)); let d = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI; if (d > 90) d -= 180; if (d <= -90) d += 180; return +d.toFixed(1); }; // a label's turn on screen to run along a face, kept upright
  const edgeLabel = (P, i, t) => { const f = T.faceInfo(P, i), n = T.edgeNormal(P, i), o = offPx(17); return { at: [f.mid[0] + n[0] * o, f.mid[1] + n[1] * o], t, r: along(P[i], P[(i + 1) % P.length]) }; };
  const sideLabel = (el, k, t) => { const m = T.sideMid(el, k), n = T.sideNormal(el, k), o = offPx(17), c = SP.corners(el); return { at: [m[0] + n[0] * o, m[1] + n[1] * o], t, r: along(c[k], c[(k + 1) % 4]) }; };
  const cornerLabel = (P, k, t) => { const c = SP.centroid(P), v = [P[k][0] - c[0], P[k][1] - c[1]], L = Math.hypot(...v) || 1, o = offPx(20); return { at: [P[k][0] + v[0] / L * o, P[k][1] + v[1] / L * o], t }; };
  const ftTxt = v => { const a = Math.abs(v); return (Math.abs(a - Math.round(a)) < 0.05 ? Math.round(a) : a.toFixed(1)) + ' ft'; };
  const offTxt = d => Math.abs(d) < 0.05 ? 'not moved' : ftTxt(d) + (d > 0 ? ' out' : ' in');
  const degTxt = r => (Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r) % 360 : (+r).toFixed(1)) + '°';
  function move(e) {
    if (drag?.type === 'box') { drag.p1 = e.point; drag.moved = drag.moved || Math.hypot(e.point.x - drag.p0.x, e.point.y - drag.p0.y) > 3; paintBox(); return; }
    if (drag?.type === 'set') { // the set follows the pointer; with the grid on, the piece under the pointer lands on it
      const pl = PL(); if (!pl) return; const p = ftAt(pl, e.lngLat), G = gridOf(pl, e.originalEvent); let dx = p[0] - drag.from[0], dy = p[1] - drag.from[1];
      if (G) { const [sx, sy] = onGrid(G, SP.moveBy(clone(drag.lead), dx, dy)); dx += sx; dy += sy; }
      pl.elements = T.moveSet({ elements: drag.orig }, drag.ids, dx, dy, false).elements; drag.moved = drag.moved || Math.hypot(dx, dy) > 0.5; draw(); return; }
    if (!drag) return; const pl = PL(), el = pl?.elements.find(x => x.id === drag.id); if (!el) return;
    const p = ftAt(pl, e.lngLat), o = drag.orig, V = T.viewOf(pl), G = gridOf(pl, e.originalEvent); drag.moved = true;
    if (drag.type === 'vertex' && el.path && !el.poly) { // a route's point follows the pointer (on the grid when it's on); an entrance's mouth slides along the lot line
      const P = el.path, k = drag.k; let q = G ? T.snapPt(p, G.step, G.a) : p; if (k === 0 && T.isEntrance(el)) { const m = T.lotLineAt(pl.ring, q); q = m.at; if (el.mouth) el.mouth = m.mouth; }
      if (drag.soft) { const O = drag.orig.path, c = [0]; for (let i = 1; i < O.length; i++) c.push(c[i - 1] + Math.hypot(O[i][0] - O[i - 1][0], O[i][1] - O[i - 1][1])); const d = [q[0] - O[k][0], q[1] - O[k][1]]; // a network street: the points round it follow, less the farther they are (a smooth bend, its ends held unless dragged)
        for (let i = 0; i < O.length; i++) { const f = Math.abs(c[i] - c[k]) / drag.soft, w = i === k ? 1 : (i === 0 || i === O.length - 1) ? 0 : f >= 1 ? 0 : (1 + Math.cos(Math.PI * f)) / 2; P[i] = [+(O[i][0] + d[0] * w).toFixed(2), +(O[i][1] + d[1] * w).toFixed(2)]; } }
      else P[k] = q.map(v => +v.toFixed(2)); const mid = P[Math.floor((P.length - 1) / 2)], nx = P[Math.ceil((P.length - 1) / 2)]; el.x = +((mid[0] + nx[0]) / 2).toFixed(2); el.y = +((mid[1] + nx[1]) / 2).toFixed(2); draw(); readout(el); return;
    }
    if (drag.type === 'vertex') { // the point follows the pointer, lining up with its neighbours (within 3 ft, square to the piece) unless Alt is held; Shift: whole feet and square (or 45°) corners
      const P = el.poly, n = P.length, k = drag.k, r = (el.rot || 0), loc = q => SP.rotPt(q, -r), back = q => SP.rotPt(q, r); let q = loc(p), sq = false;
      if (e.originalEvent?.shiftKey) { const s = T.snapPoint(P, k, p, r); q = loc(s.q); sq = s.square; }
      else if (G) q = loc(T.snapPt(p, G.step, G.a)); else if (!e.originalEvent?.altKey && V.snap) for (const nb of [P[(k - 1 + n) % n], P[(k + 1) % n]]) { const b = loc(nb); if (Math.abs(q[0] - b[0]) < 3) q = [b[0], q[1]]; if (Math.abs(q[1] - b[1]) < 3) q = [q[0], b[1]]; }
      P[k] = back(q).map(v => +v.toFixed(2)); const c = SP.centroid(P); el.x = +c[0].toFixed(2); el.y = +c[1].toFixed(2);
      guide([(k - 1 + n) % n, k].map(i => edgeLabel(P, i, T.fmtFt(T.faceInfo(P, i).len))).concat(sq ? [cornerLabel(P, k, '90°')] : []));
      draw(); readout(el); return;
    }
    if (drag.type === 'move') { // snaps to its neighbours' edges, stays out of the setbacks and (a building) off the drives and other buildings; hold Alt for a free move
      const free = e.originalEvent?.altKey, carry = () => (drag.att || []).map(a => pl.elements.find(x => x.id === a.id)).filter(Boolean);
      if (drag.m0 && !free) { const m0 = drag.m0, q = SP.lotLineAt(pl.ring, [m0[0] + p[0] - drag.from[0], m0[1] + p[1] - drag.from[1]]); Object.assign(el, SP.moveBy(clone(o), q.at[0] - m0[0], q.at[1] - m0[1])); if (el.path) { el.path[0] = q.at; el.mouth = q.mouth; } } // an entrance: its mouth slides along the street (Alt: anywhere)
      else if (SP.isFree(o)) { Object.assign(el, SP.moveBy(clone(o), p[0] - drag.from[0], p[1] - drag.from[1])); if (G) { const [sx, sy] = onGrid(G, el); SP.moveBy(el, sx, sy); } }
      else { el.x = +(o.x + p[0] - drag.from[0]).toFixed(2); el.y = +(o.y + p[1] - drag.from[1]).toFixed(2); if (G) { const [gx, gy] = onGrid(G, el); el.x = +(el.x + gx).toFixed(2); el.y = +(el.y + gy).toFixed(2); }
        if (!free) { const [sx, sy] = SP.settleShift(pl, el, G || !V.snap ? 0 : 3); el.x = +(el.x + sx).toFixed(2); el.y = +(el.y + sy).toFixed(2); } } // lines up with its neighbours' edges unless the grid's on or edge snapping is off; always out of the setbacks
      const mv = () => { const dx = el.x - o.x, dy = el.y - o.y; for (const a of drag.att || []) { const t = pl.elements.find(x => x.id === a.id); if (t) Object.assign(t, SP.moveBy(clone(a.orig), dx, dy)); } };
      mv(); drag.blocked = false;
      if (!free && drag.obs) { const c = SP.clearSpot(pl, el, { carry: carry(), obs: drag.obs }); if (c) { if (c[0] || c[1]) { SP.moveBy(el, c[0], c[1]); mv(); } } else drag.blocked = true; } // the nearest clear spot to the pointer
      drag.last = p; drag.alt = !!free; if (SP.inRing(p, pl.ring) && !drag.blocked) drag.good = { el: clone(el), att: carry().map(clone) }; // the last clear spot with the pointer on the site
    }
    else if (drag.type === 'side') { // one side out or in, the opposite one fixed: on the grid, else lined up with a neighbour's edge (unless Alt), and never past the setback; Shift: a whole number of feet across
      const k = drag.k, n = T.sideNormal(o, k), alt = e.originalEvent?.altKey, sh = e.originalEvent?.shiftKey, d0 = (p[0] - drag.from[0]) * n[0] + (p[1] - drag.from[1]) * n[1]; let d = d0;
      const along = dd => ({ ...o, ...T.dragSide(o, k, dd) }), sq = G && Math.abs((((o.rot || 0) - G.a) % 90 + 135) % 90 - 45) < 1, was = k % 2 ? o.w : o.d;
      if (sh) d = Math.round(was + d) - was;
      else if (sq) { const m = T.sideMid(along(d), k), q = T.snapPt(m, G.step, G.a); d += (q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1]; }
      else if (!alt && V.snap) d += T.sideSnap(pl, along(d), k, 3);
      if (!alt && d > 0) { const [sx, sy] = SP.settleShift(pl, along(d), 0), back = sx * n[0] + sy * n[1]; if (back < -0.01) d = Math.max(Math.min(0, d), d + back); } // the setback stops it
      Object.assign(el, T.dragSide(o, k, d)); drag.moved = Math.abs(d) > 0.05;
      const got = (k % 2 ? el.w : el.d) - was; guide([sideLabel(el, k, T.fmtFt(k % 2 ? el.d : el.w) + ' face · ' + offTxt(got))]);
    }
    else if (drag.type === 'edge') { // a face of an outline straight out or in along its normal; the faces either side keep their direction (T.dragFace), cut back where it would fold over or pinch; Shift: whole feet
      const k = drag.k, n = T.edgeNormal(o.poly, k); let d = (p[0] - drag.from[0]) * n[0] + (p[1] - drag.from[1]) * n[1];
      if (e.originalEvent?.shiftKey) d = Math.round(d);
      else if (G) { const a = o.poly[k], b = o.poly[(k + 1) % o.poly.length], m = [(a[0] + b[0]) / 2 + n[0] * d, (a[1] + b[1]) / 2 + n[1] * d], q = T.snapPt(m, G.step, G.a); d += (q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1]; }
      const r = T.dragFace(o.poly, k, d); el.poly = r.poly; const c = SP.centroid(r.poly); el.x = +c[0].toFixed(2); el.y = +c[1].toFixed(2);
      drag.moved = Math.abs(r.d) > 0.05; guide([edgeLabel(r.poly, k, T.fmtFt(T.faceInfo(r.poly, k).len) + ' face · ' + offTxt(r.d))]);
    }
    else if (drag.type === 'scale') { const c = [o.x, o.y], f = Math.max(0.2, Math.min(5, Math.hypot(p[0] - c[0], p[1] - c[1]) / (Math.hypot(drag.corner[0] - c[0], drag.corner[1] - c[1]) || 1))); Object.assign(el, SP.scaleBy(clone(o), f, c)); }
    else if (drag.type === 'size') {
      const sx = [-1, 1, 1, -1][drag.k], sy = [-1, -1, 1, 1][drag.k], opp = [-sx * o.w / 2, -sy * o.d / 2], q = SP.toLocal(o, p);
      const w = Math.max(8, Math.abs(q[0] - opp[0])), d = Math.max(8, Math.abs(q[1] - opp[1])), mid = [opp[0] + sx * w / 2, opp[1] + sy * d / 2], a = (o.rot || 0) * Math.PI / 180;
      Object.assign(el, { w: +w.toFixed(2), d: +d.toFixed(2), x: +(o.x + mid[0] * Math.cos(a) - mid[1] * Math.sin(a)).toFixed(2), y: +(o.y + mid[0] * Math.sin(a) + mid[1] * Math.cos(a)).toFixed(2) });
    } else { // the turn dot: Shift, 15° steps; else free to the degree, settling square to the street, a site edge or a building's face within 2° (not with Alt or edge snapping off), a guide line along it
      const c0 = drag.c || [o.x, o.y], raw = Math.atan2(p[1] - c0[1], p[0] - c0[0]) * 180 / Math.PI - 90 + (drag.off || 0), s = T.snapTurn(raw, !e.originalEvent?.altKey && V.snap ? drag.targets : [], { shift: !!e.originalEvent?.shiftKey }); drag.turn = s;
      const c = c0, R = Math.max(o.w || 0, o.d || 0) * 0.8 + 30, g = [];
      if (s.snap) { const t = s.snap.a * Math.PI / 180, u = [Math.cos(t), Math.sin(t)]; g.push({ line: [[c[0] - u[0] * R, c[1] - u[1] * R], [c[0] + u[0] * R, c[1] + u[1] * R]] }, { line: s.snap.seg }); } // through its middle along what it lines up with, and that edge
      g.push({ at: [c[0] + (p[0] - c[0]) * 1.25, c[1] + (p[1] - c[1]) * 1.25], t: degTxt(s.r) + (s.snap ? ' · square to ' + s.snap.what : '') });
      guide(g);
      if (drag.grp) { const ids = new Set(drag.grp.map(x => x.id)); pl.elements = pl.elements.filter(x => !ids.has(x.id)).concat(drag.grp.map(clone)); const el2 = pl.elements.find(x => x.id === drag.id), d = ((s.r - (o.rot || 0)) % 360 + 540) % 360 - 180;
        pl.elements = SP.turnPiece(pl, el2, d).elements; draw(); readout(el2); return; } // (from where it was each time: an entrance's turn is held to 60° off square)
      Object.assign(el, T.turnPiece(o, s.r));
    }
    draw(); readout(el);
  }
  function up(ev) {
    if (!drag) return; const d = drag; drag = null; if (ed?.guide) { ed.guide = null; drawD(); }
    if (d.type === 'box') { boxEl.hidden = true; const pl = PL(); if (!pl) return; if (!d.moved) { if (d.on != null) toggleSel(d.on); return; } // the pieces wholly inside the box join the set
      const q = [[d.p0.x, d.p0.y], [d.p1.x, d.p0.y], [d.p1.x, d.p1.y], [d.p0.x, d.p1.y]].map(([x, y]) => ftAt(pl, map.unproject([x, y])));
      const got = T.boxSelect(pl, q, T.viewOf(pl)); if (!got.length) { ctx.toast('No pieces wholly inside that box.'); return; }
      const all = [...new Set([...sels(), ...got])]; ed.multi = all.length > 1 ? all : []; ed.sel = all.includes(ed.sel) ? ed.sel : got[0]; ed.shape = null; draw(); panel(); return; }
    if (d.type === 'set') { const pl = PL(); if (!d.moved) { pickOne(d.id); draw(); panel(); return; } // a click on one of the set: just that piece
      ed.undo.push(d.snap); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = []; markEdited(pl); handEdit();
      for (const id of d.ids) { const el = pl.elements.find(x => x.id === id), o = d.orig.find(x => x.id === id); if (el && o) { if (el.kind === 'parking') delete el.ext; makeRoom(el, [o]); } }
      pl.updated = new Date().toISOString(); save(P()); draw(); panel(); autoRefit('Moved', plural(sels().length, 'piece')); return; }
    if (!d.moved) { const el = d.pre && PL()?.elements.find(x => x.id === d.id); if (el) { for (const k of Object.keys(el)) delete el[k]; Object.assign(el, d.pre); draw(); } return; } // (an outline entrance pressed but not dragged: as it was)
    let off = false;
    { const pl0 = PL(), el0 = pl0?.elements.find(x => x.id === d.id); // dropped off the site (Alt places it anyway): back to the last clear spot on it
      if (d.type === 'move' && !d.alt && el0 && d.last && !SP.inRing(d.last, pl0.ring)) {
        const put = g => { Object.assign(el0, clone(g.el)); for (const a of g.att) { const t = pl0.elements.find(x => x.id === a.id); if (t) Object.assign(t, clone(a)); } };
        if (!d.good) { put({ el: d.orig, att: (d.att || []).map(a => a.orig) }); draw(); readout(el0); ctx.toast('That\'s outside the site'); return; } // it never had a clear spot on the site: it stays where it was
        put(d.good); off = true; d.blocked = false; } } // it moved to the last clear spot: saved like any other move (undo, pinned)
    ed.undo.push(d.snap); ed.redo = []; const pl = PL(), el = pl.elements.find(x => x.id === d.id); markEdited(pl); handEdit();
    if (el) { el.pinned = true; if (el.kind === 'parking') delete el.ext; /* placed by hand: this is its length now */
      const went = d.type === 'move' ? [d.orig, ...(d.att || []).map(a => a.orig)] : [d.orig]; makeRoom(el, went, !!d.alt);
      for (const a of d.att || []) { const t = pl.elements.find(x => x.id === a.id); if (t) { t.pinned = true; makeRoom(t); } }
      if (d.parts && (d.type === 'vertex' || d.type === 'move')) { const had = pl.elements.filter(x => d.parts.includes(x.id)), r = SP.refreshEntry(pl, el, null, had); pl.elements = r.elements; if (r.why) ctx.toast(r.why); } // an entrance's median follows its bend, its signs its mouth
      if (d.type === 'vertex' && isNetStreet(pl, el)) carryNet(pl, el, d.orig.path, d.snap.elements); } // a street's junctions hold: the streets that meet it come along
    if (off) ctx.toast('That\'s outside the site'); else if (d.blocked) ctx.toast('No clear spot there: it overlaps a drive or another building. Hold Alt (Option) to place it anyway.');
    pl.updated = new Date().toISOString(); save(P()); draw(); panel();
    if (el && !d.blocked) autoRefit({ move: 'Moved', rot: 'Turned', vertex: 'Reshaped', edge: 'Reshaped' }[d.type] || 'Resized', ED.labelOf(el));
  }
  const boxEl = document.createElement('div'); boxEl.className = 'sp-box'; boxEl.hidden = true; map.getContainer().appendChild(boxEl);
  function paintBox() { const d = drag; if (!d || d.type !== 'box' || !d.moved) return; Object.assign(boxEl.style, { left: Math.min(d.p0.x, d.p1.x) + 'px', top: Math.min(d.p0.y, d.p1.y) + 'px', width: Math.abs(d.p1.x - d.p0.x) + 'px', height: Math.abs(d.p1.y - d.p0.y) + 'px' }); boxEl.hidden = false; }
  map.on('mousedown', down); map.on('touchstart', down); map.on('mousemove', move); map.on('touchmove', move); map.on('mouseup', up); map.on('touchend', up);
  window.addEventListener('mouseup', up);
  // cursor feedback; set a frame later, after the building hover's own (src/building.js), which would clear it
  let curRaf = 0; const setCur = v => { cancelAnimationFrame(curRaf); curRaf = requestAnimationFrame(() => { if (ed) map.getCanvas().style.cursor = v; }); };
  map.on('mousemove', e => {
    const pl = ed && PL(); if (!pl || drag || ctx.view !== 'map') return;
    if (ed.mode) { setCur('var(--cur-cross, crosshair)');
      if (ed.mode === 'draw' || ed.mode === 'drawpiece' || ed.mode === 'measure') { ed.cursor = clickFt(pl, e, ed.mode !== 'measure'); drawD(); } // the line on to the pointer
      if ((ed.mode === 'front' || ed.mode === 'street') && pl.ring.length >= 3) { const k = SP.nearestEdge(pl.ring, ftAt(pl, e.lngLat)); if (k !== ed.hover) { ed.hover = k; draw(); } } // the lot edge a click would pick, in orange
      return; }
    const h = pl.ring.length >= 3 && hit(pl, e); setCur(!h ? '' : h.h != null ? handleCursor(pl, h.hd) : ed.editing ? 'move' : 'var(--cur-pointer, pointer)'); // looking, not editing: a click just picks it
  });
  // the cursor over a handle says what it does: a resize arrow along the way it pulls (turned with the piece and the
  // map), the turn arrow, a hand for a point, a + for adding one
  const ROT_CUR = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 8.5A7.5 7.5 0 1 0 19 15" stroke="#fff" stroke-width="4"/><path d="M19 4v5h-5" stroke="#fff" stroke-width="4"/><path d="M18.5 8.5A7.5 7.5 0 1 0 19 15" stroke="#16201b" stroke-width="1.8"/><path d="M19 4v5h-5" stroke="#16201b" stroke-width="1.8"/></svg>') + '") 12 12, grab';
  const resizeCur = (dx, dy) => { const a = ((Math.atan2(dy, dx) * 180 / Math.PI) % 180 + 180) % 180; return a < 22.5 || a >= 157.5 ? 'ew-resize' : a < 67.5 ? 'nwse-resize' : a < 112.5 ? 'ns-resize' : 'nesw-resize'; }; // screen y runs down
  function handleCursor(pl, hd) {
    if (!hd) return 'move'; if (hd.t === 'r') return ROT_CUR; if (hd.t === 'v') return 'grab'; if (hd.t === 'p') return 'copy';
    const el = pl.elements.find(x => x.id === ed.sel); if (!el) return 'move'; const F = SP.frame(pl.origin), s = map.project(hd.at);
    if (hd.t === 'e' || hd.t === 'm') { const n = hd.t === 'e' ? T.sideNormal(el, +hd.i.slice(1)) : T.edgeNormal(el.poly, +hd.i.slice(1)), q = map.project(F.toLL([hd.ft[0] + n[0] * 10, hd.ft[1] + n[1] * 10])); return resizeCur(q.x - s.x, q.y - s.y); }
    if (hd.t === 'c') { const n = SP.rotPt([[-1, 1, 1, -1][hd.i], [-1, -1, 1, 1][hd.i]], el.rot || 0), q = map.project(F.toLL([hd.ft[0] + n[0] * 10, hd.ft[1] + n[1] * 10])); return resizeCur(q.x - s.x, q.y - s.y); } // a corner: along its diagonal, whatever the piece's shape
    const c = map.project(F.toLL([el.x, el.y])); return resizeCur(s.x - c.x, s.y - c.y); // a scaling corner: out from the middle
  }
  map.on('zoomend', () => { if (ed?.editing && ed.sel) draw(); }); // the side bars and the + depend on the zoom
  const frameAngle = pl => pl.ring.length >= 3 ? SP.mainAngle(pl.ring) : 0; // the lot's main lines: new pieces square up with them

  // clicks while the plan is open: draw the boundary, pick the street side, or select; never open other cards
  const nearFirst = (pl, pts, e) => { if (pts.length < 3) return false; const q = map.project(SP.frame(pl.origin).toLL(pts[0])); return Math.hypot(q.x - e.point.x, q.y - e.point.y) < 14; };
  ctx.mapClickHandlers.unshift(e => {
    const pl = ed && PL(); if (!pl) return false;
    if (performance.now() - lpAt < 900) return true; // the tap that ends a long press (it opened the menu)
    if (ed.mode === 'draw') {
      if (nearFirst(pl, ed.draft, e)) finishDraw(); else { ed.draft.push(clickFt(pl, e, true)); draw(); panel(); }
      return true;
    }
    if (ed.mode === 'drawpiece') { // an area (the first point again closes it) or a line
      if (!ed.dp.line && nearFirst(pl, ed.draft, e)) finishPiece(); else { ed.draft.push(clickFt(pl, e, true)); drawD(); paintMode(); }
      return true;
    }
    if (ed.mode === 'measure') { const M = ed.meas; // a distance (points along a line) or an area (the first point again closes it)
      if (M.done) { M.pts = []; M.done = false; }
      if (M.kind === 'area' && nearFirst(pl, M.pts, e)) M.done = true; else M.pts.push(clickFt(pl, e, false));
      drawD(); paintMode(); return true; }
    if (ed.mode === 'parcels') { pickParcel(e.lngLat); return true; }
    if (ed.mode === 'front') { const p = ftAt(pl, e.lngLat); change(x => { x.front = SP.nearestEdge(x.ring, p); x.frontGuess = false; }); ed.mode = null; panel(); return true; }
    if (ed.mode === 'roundabout') { ringAt(ftAt(pl, e.lngLat), true); return true; } // a roundabout at the junction clicked (one-shot, as Add Entrance)
    if (ed.mode === 'loop') { const p = ftAt(pl, e.lngLat), b = pl.elements.find(x => loopFor(x) && SP.hitRect(x, p)); if (!b) { ctx.toast('Click a clubhouse, school, shop, hotel or office: a drop-off loop goes in front of one.'); return true; } loopAt(b); return true; }
    if (ed.mode === 'entrance') { // a driveway in from the street where the lot line was clicked
      const p = ftAt(pl, e.lngLat), k = SP.nearestEdge(pl.ring, p), d = SP.segDist(p, pl.ring[k], pl.ring[(k + 1) % pl.ring.length]);
      if (d > 60) { ctx.toast('Click on the lot line along the street, where the driveway should come in.'); return true; }
      const r = SP.addEntrance(pl, p, { id: uid() }); if (r.error) { ctx.toast(r.error); return true; }
      change(x => { x.elements = r.elements; x.streets = r.streets; if (r.streets.length) x.streetsSet = true; }); ed.sel = r.entrance.id; ed.mode = null; ed.editing = true; if (!pl.stale) siteChanged(pl, 'entrance');
      draw(); panel(); ctx.toast(r.entrance.name + ' added.' + (r.note ? ' ' + r.note : '')); return true;
    }
    if (ed.mode === 'street') { // a street side on or off; it stays armed for the next one until Done. The front can come off too when another lot line is a street: the longest of those becomes the front
      const p = ftAt(pl, e.lngLat), k = SP.nearestEdge(pl.ring, p), f0 = pl.front ?? SP.longestEdge(pl.ring), others = (pl.streets || []).filter(i => i !== f0);
      if (k === f0 && !others.length) { ctx.toast('That’s the site’s only street side. Mark the real street first, then click this one again to take it off.'); return true; }
      change(x => { const st = new Set(x.streets || []); if (k === f0) { const nf = others.sort((a, b) => SP.edgeLen(x.ring, b) - SP.edgeLen(x.ring, a))[0]; st.delete(nf); x.front = nf; x.frontGuess = false; } else if (st.has(k)) st.delete(k); else st.add(k); x.streets = [...st]; x.streetsSet = true; });
      if (k === f0) ctx.toast('Street side moved to the other street.'); return true; }
    if (e.originalEvent?.shiftKey) return true; // Shift-clicks build the set (pointer down)
    if (!hit(pl, e) && ed.sel) { pickOne(null); ed.shape = null; draw(); panel(); }
    return true;
  });
  map.on('dblclick', e => {
    if (ed?.mode === 'draw') { e.preventDefault(); finishDraw(); return; }
    if (ed?.mode === 'drawpiece') { e.preventDefault(); finishPiece(); return; }
    if (ed?.mode === 'measure') { e.preventDefault(); finishMeasure(); return; }
    const pl = ed?.editing && PL(); if (!pl || pl.ring.length < 3) return; e.preventDefault(); // editing: a double-click never zooms
    // (an entrance shows its route's points without Edit Shape; one drawn as an outline is read as its route, so the
    // point is a route point: never one of its outline's, a curb flare)
    const h = hit(pl, e), ent = h?.hd?.t === 'v' && pl.elements.find(x => x.id === ed.sel && T.isEntrance(x)), sh = ent || ed.shape && pl.elements.find(x => x.id === ed.shape);
    if (h?.hd?.t === 'v' && (ent || sh?.path && !sh.poly)) { const P = sh.path && !sh.poly ? sh.path : SP.routeOf(sh, pl.ring).path; if (P.length <= 2) { ctx.toast('A drive needs two points.'); return; }
      const k = +h.h.slice(1); if (k === 0 && T.isEntrance(sh)) { ctx.toast('That’s where the entrance meets the street: drag it along the lot line instead.'); return; }
      change(x => { SP.toRoute(sh, pl.ring); const was = sh.path.map(q => q.slice()), els0 = clone(x.elements); sh.path.splice(k, 1); if (isNetStreet(x, sh)) carryNet(x, sh, was, els0); }); draw(); autoRefit('Reshaped', ED.labelOf(sh)); return; }
    if (h?.hd?.t === 'v' && sh?.poly) { if (sh.poly.length <= 3) { ctx.toast('A shape needs at least three points.'); return; } // a point removed
      change(() => { sh.poly.splice(+h.h.slice(1), 1); const c = SP.centroid(sh.poly); sh.x = +c[0].toFixed(2); sh.y = +c[1].toFixed(2); }); draw(); autoRefit('Reshaped', ED.labelOf(sh)); return; }
    // on a drive: a bend there (the drive under the pointer wins over an outline a few pixels away, unless that outline
    // is the one being shaped); on or near a building's outline: a point there
    const on = h?.el || (h?.h != null ? pl.elements.find(x => x.id === ed.sel) : null), near = nearOutline(pl, e), dr = on && T.routeable(on) && !(isNetStreet(pl, on) && ed.shape !== on.id) && T.editable(T.viewOf(pl), on) ? on : null, /* (a network street bends by its handles: Edit Shape for every point) */ /* (a narrow aisle's side bar sits on its middle) */ el = near && (near.id === ed.shape || !dr) ? near : dr;
    if (el) addPointAt(el, ftAt(pl, e.lngLat));
  });
  // the piece whose outline is under the pointer (within a few pixels): the selected one first, then any whose shape can be edited
  function nearOutline(pl, e) {
    const V = T.viewOf(pl), ft = ftAt(pl, e.lngLat), px = ftPerPx(), reach = (coarse() ? 20 : 12) * px, cur = pl.elements.find(x => x.id === ed.sel);
    const ok = x => x && SHAPEABLE.includes(x.kind) && T.editable(V, x), d = x => T.nearestOnOutline(x.poly || SP.outline(x), ft)?.dist ?? Infinity;
    if (ok(cur) && d(cur) <= reach) return cur;
    let best = null, bd = reach; for (const x of pl.elements) if (ok(x)) { const q = d(x); if (q <= bd) { bd = q; best = x; } } return best;
  }
  // a point added on a piece's outline where it's nearest ft (as Edit Shape does, a rectangle becomes points first, so
  // its outline is kept exactly); then its shape is open for dragging that point. One undo step.
  function addPointAt(el, ft) {
    const pl = PL(); if (!pl || !el) return;
    if (T.routeable(el)) { // a drive: as a route (one undo step with the point), the new point ready to drag
      ed.editing = true; ed.sel = el.id; ed.multi = []; ed.shape = el.id;
      change(() => { if (!el.path) { const r0 = T.routeOf(el, pl.ring); for (const k of Object.keys(el)) delete el[k]; Object.assign(el, r0); } const r = T.addRoutePoint(el.path, ft); if (r) el.path = r.path; el.pinned = true; });
      ctx.toast('Point added to ' + ED.labelOf(el) + ': drag it to bend the drive. Curve in the panel rounds the bends.'); return; }
    if (!SHAPEABLE.includes(el.kind)) return; const r = T.addPoint(el, ft);
    ed.editing = true; ed.sel = el.id; ed.multi = []; ed.shape = el.id; if (!r) { draw(); panel(); return; } // on a point already there: just shaping
    change(() => { const o = T.asOutline(el); Object.assign(el, o.set, { poly: r.poly }); for (const k of o.drop) delete el[k]; const c = SP.centroid(r.poly); el.x = +c[0].toFixed(2); el.y = +c[1].toFixed(2); el.pinned = true; });
    ctx.toast('Point added to ' + ED.labelOf(el) + ': drag it to change the shape.');
  }
  // move a plan to a new boundary (and origin), keeping every piece where it is on the ground
  function reorigin(x, b, src) {
    const G = SP.frame(x.origin), N = SP.frame(b.origin);
    const to = p => N.toFt(G.toLL(p)).map(v => +v.toFixed(2));
    x.elements.forEach(e => { [e.x, e.y] = to([e.x, e.y]); if (e.path) e.path = e.path.map(to); if (e.poly) e.poly = e.poly.map(to); if (e.cl) e.cl = e.cl.map(to); });
    x.origin = b.origin; x.ring = b.ring; x.src = src; x.front = null; x.frontGuess = true; x.streets = []; x.streetsSet = false; x.zones = []; // the layout's zone lines were drawn on the old outline
  }
  function setParcels(keys) {
    const p = P(), recs = keys.map(k => p.parcels.find(x => x.key === k)).filter(r => r?.geometry), b = siteOf(recs);
    if (!b) { ctx.toast('Those parcels have no outline to plan on.'); return; }
    const pl = PL(); change(x => { reorigin(x, b, recs.length > 1 ? 'parcels' : 'parcel'); x.parcels = recs.map(r => r.key); x.parcel = recs[0].key; x.elements = x.elements.filter(e => !e.gap).concat(gapPieces(b, x)); });
    if (b.pieces > 1) ctx.toast('Some parcels are more than ' + SP.BRIDGE_FT + ' ft from the rest, so they’re left out of the site.');
    else if (b.strips.some(s => s.road)) ctx.toast('The road between the parcels is in the site as a no-build area; the other gaps between them are filled in as site.');
    else if (b.strips.length) ctx.toast('The gaps between the parcels are filled in as part of the site.');
    map.once('idle', () => PL() === pl && detectFront(pl));
  }
  async function pickParcel(lngLat) {
    const p = P(), pl = PL(), c = [lngLat.lng, lngLat.lat], keys = pl.parcels || (pl.parcel ? [pl.parcel] : []);
    // a click in a parcel of the site takes it out; one in a different account drawn on the map is another parcel, even inside
    // an outline that takes in several (lib/footprint.mjs withTileParcel)
    const t0 = ctx.tileParcelAt?.(c), idOf = v => String(v ?? '').replace(/\W/g, '').toUpperCase(), other = r => t0?.apn && r.propId && idOf(r.propId) !== idOf(t0.apn);
    const inside = keys.map(k => p.parcels.find(x => x.key === k)).find(r => r?.geometry && inGeom(c, r.geometry) && !other(r));
    if (inside) { if (keys.length === 1) { ctx.toast('A site needs at least one parcel.'); return; } setParcels(keys.filter(k => k !== inside.key)); return; }
    if (keys.length >= MAXP) { ctx.toast('Up to ' + MAXP + ' parcels in one site.'); return; }
    ctx.toast('Looking up the parcel…');
    try {
      const tile = ctx.tileParcelAt?.(c) || null; // the parcel drawn on the map there decides which one it is (lib/footprint.mjs withTileParcel)
      const r = await fetch('api/building?' + new URLSearchParams({ lat: c[1].toFixed(6), lon: c[0].toFixed(6), part: 'parcel', ...(tile?.apn ? { apn: tile.apn } : {}) })), d = await readJSON(r);
      d.parcel = withTileParcel(d.parcel, tile);
      if (!d.parcel) throw new Error('No parcel here.');
      if (!d.parcel.geometry) { ctx.toast('The county has no outline for that parcel. Get its Regrid details on the property card first.'); return; }
      const rec = keyIn(parcelOf(d.parcel, c), p.parcels); if (!p.parcels.some(x => x.key === rec.key)) p.parcels.push(rec);
      if (keys.includes(rec.key)) return; setParcels([...keys, rec.key]);
    } catch (e) { ctx.toast('Couldn’t look up that parcel: ' + e.message); }
  }
  function finishDraw() {
    const pl = PL(); if (!pl || ed.draft.length < 3) { ctx.toast('Click at least three corners of the site.'); return; }
    if (T.selfIntersects(ed.draft)) { ctx.toast('The outline crosses itself. Click the corners in order round the site (Backspace takes a point back).'); return; } // a bow-tie has no real area: its layouts were nonsense
    const F = SP.frame(pl.origin), ll = ed.draft.map(F.toLL), b = SP.boundaryFrom({ type: 'Polygon', coordinates: [ll.concat([ll[0]])] });
    if (!b || SP.ringArea(b.ring) < 1000) { ctx.toast('That outline has almost no area: click at least three corners that aren’t in a line.'); return; }
    if (ed.draftPlan) { P().plans.push(ed.draftPlan); ed.draftPlan = null; ctx.scheduleHash?.(); } // the option exists from here (and goes in the address)
    change(x => reorigin(x, b, 'drawn'));
    ed.mode = null; ed.draft = []; draw(); panel(); map.once('idle', () => PL() === pl && detectFront(pl));
  }

  // ---------- tools: measure, draw an area or a line, fit, the grid, layers ----------
  // A point clicked on the map, in plan feet (on the grid when it's on, unless Alt is held)
  const clickFt = (pl, e, snap) => { const p = ftAt(pl, e.lngLat), G = snap && gridOf(pl, e.originalEvent); return G ? T.snapPt(p, G.step, G.a) : p.map(v => +v.toFixed(2)); };
  const dedupe = pts => pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5); // a double-click's second point
  // Measure: click points (a distance, with each segment's length and the total) or round an area (sq ft and acres).
  // Nothing is saved; the measurement stays until you leave measuring (Esc, Done or the tool again).
  function startMeasure(kind) {
    if (!ed || !(PL()?.ring.length >= 3)) return; if (ed.mode === 'measure' && ed.meas?.kind === kind) { leaveMode(); return; }
    ed.mode = 'measure'; ed.meas = { kind, pts: [], done: false }; ed.draft = []; ed.cursor = null; closePops(); draw(); panel();
  }
  function finishMeasure() { const M = ed?.meas; if (!M) return; M.pts = dedupe(M.pts); if (M.pts.length >= (M.kind === 'area' ? 3 : 2)) M.done = true; drawD(); paintMode(); }
  // Draw an area (lawn, plaza, pond, an easement) or a line (a drive, a walk) point by point, like the site's outline
  function startDrawPiece(kind) {
    const pl = PL(); if (!pl || pl.ring.length < 3) return; if (!ed.editing) { ctx.toast('Turn on Edit to draw.'); return; }
    const L = T.LINE_KINDS.find(x => x[0] === kind), A = T.AREA_KINDS.find(x => x[0] === kind); if (!L && !A) return;
    ed.mode = 'drawpiece'; ed.dp = { kind, line: !!L, width: L ? L[2] : 0, label: (L || A)[1] }; ed.draft = []; ed.cursor = null; pickOne(null); ed.shape = null; closePops(); draw(); panel();
  }
  function finishPiece() {
    const pl = PL(), D = ed?.dp; if (!pl || !D) return; const pts = dedupe(ed.draft); ed.draft = pts;
    const err = D.line ? T.lineError(pl, pts) : T.areaError(pl, pts, D.kind); if (err) { ctx.toast(err); drawD(); return; }
    const e = D.line ? T.linePiece(pl, D.kind, pts, uid(), D.width) : T.areaPiece(pl, D.kind, pts, uid());
    change(x => { x.elements.push(e); makeRoom(e); }); // one undo step; parking under a drawn drive, pond or plaza gives way (an easement leaves it, flagged)
    ed.mode = null; ed.dp = null; ed.draft = []; ed.cursor = null; pickOne(e.id); draw(); panel();
    ctx.toast((e.name || D.label) + ' added.' + (e.kind === 'keepout' ? ' Anything built or paved on it shows as a problem; Re-fit Plan lays the rest out around it.' : ''));
  }
  // the drawing line, the measurement and the street edge under the pointer (fs-sp-d), on their own: the pointer moving
  // redraws only these, never the plan
  let rafD = 0;
  function drawD() { cancelAnimationFrame(rafD); rafD = requestAnimationFrame(() => {
    const pl = ed && PL(), src = map.getSource(DSRC); if (!src) return; const F = pl?.origin && SP.frame(pl.origin), feats = [];
    if (F) {
      const pt = (c, props = {}) => feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: F.toLL(c) } });
      const line = (cs, props = {}) => { if (cs.length > 1) feats.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: cs.map(F.toLL) } }); };
      const fill = cs => feats.push({ type: 'Feature', properties: { k: 'mfill' }, geometry: { type: 'Polygon', coordinates: [cs.concat([cs[0]]).map(F.toLL)] } });
      const live = ed.cursor && ['draw', 'drawpiece', 'measure'].includes(ed.mode) ? ed.cursor : null;
      if (ed.mode === 'draw' || ed.mode === 'drawpiece') { const d = ed.draft, area = ed.mode === 'draw' || !ed.dp?.line;
        if (area && d.length >= 3) fill(d); d.forEach(c => pt(c)); line(d); if (live && d.length) line([d[d.length - 1], live], { rb: 1 });
        if (ed.mode === 'drawpiece') { for (const l of T.measureLabels(d)) pt(l.at, { k: 'mlab', t: l.text }); if (area && d.length >= 3) pt(SP.centroid(d), { k: 'mtot', t: T.fmtArea(T.polyArea(d)) }); }
      }
      if (ed.mode === 'measure' && ed.meas) { const M = ed.meas, Q = M.pts, closed = M.kind === 'area' && M.done;
        if (M.kind === 'area' && Q.length >= 3) fill(Q); Q.forEach(c => pt(c)); line(closed ? Q.concat([Q[0]]) : Q);
        if (live && !M.done && Q.length) line([Q[Q.length - 1], live], { rb: 1 });
        for (const l of T.measureLabels(Q, closed)) pt(l.at, { k: 'mlab', t: l.text });
        if (M.kind === 'dist' && Q.length > 1) pt(Q[Q.length - 1], { k: 'mtot', t: 'Total ' + T.fmtFt(T.pathLen(Q)) });
        if (M.kind === 'area' && Q.length >= 3) pt(SP.centroid(Q), { k: 'mtot', t: T.fmtArea(T.polyArea(Q)) });
      }
      if (ed.mode === 'roundabout' && pl.ring.length >= 3) for (const at of SP.ringSpots(pl)) { const c = SP.ringDisc(at, 24, 24); line(c.concat([c[0]]), { rb: 1 }); } // where one can go: a small dashed circle at each street junction with room (nothing built in the way)
      if (ed.hover != null && (ed.mode === 'front' || ed.mode === 'street') && pl.ring.length >= 3) line([pl.ring[ed.hover], pl.ring[(ed.hover + 1) % pl.ring.length]].filter(Boolean), { hv: 1 });
      if (ed.guide && drag) for (const g of ed.guide) { if (g.line) line(g.line, { rb: 1 }); else if (g.at) pt(g.at, { k: 'mlab', t: g.t, r: g.r || 0 }); } // a drag's guide line and live labels (along the face they measure)
    }
    src.setData({ type: 'FeatureCollection', features: feats });
  }); }
  // the camera on some points (lon/lat) in the open part of the map, as the plan's own fit does
  function fitLL(ll, maxZoom = 19) {
    const xs = ll.map(p => p[0]), ys = ll.map(p => p[1]); if (map.getPitch() > 1) map.jumpTo({ pitch: 0 });
    const f = freeRect({ key: !phone(), aspect: aspectOf(ll) }), padding = fitPadding(f, f.m, phone() ? 14 : 40);
    ctx.fitBox([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding, maxZoom });
  }
  // F: the selection in view (the whole plan when nothing is picked); Shift+F: the plan
  function fitSel() {
    const pl = PL(), set = sels(); if (!pl || !set.length) { planFit(); return; }
    const b = T.bboxOf(pl.elements.filter(e => set.includes(e.id))), F = SP.frame(pl.origin); if (!b) return;
    const pad = Math.max(30, (b[2] - b[0] + b[3] - b[1]) * 0.08); fitLL([[b[0] - pad, b[1] - pad], [b[2] + pad, b[1] - pad], [b[2] + pad, b[3] + pad], [b[0] - pad, b[3] + pad]].map(F.toLL), 20);
  }
  // the view settings (pl.view: the grid, edge snapping, hidden and locked layers): saved with the option, not undone
  function setView(fn) { const pl = PL(); if (!pl) return; const v = T.viewOf(pl); fn(v); pl.view = v; save(P()); if (ed.sel) { const left = sels(); if (!left.length) pickOne(null); else { ed.multi = left.length > 1 ? left : []; if (!left.includes(ed.sel)) ed.sel = left[0]; } panel(); } draw(); paintTools(); paintLayers(); }
  const toggleGrid = () => setView(v => { v.grid = v.grid ? 0 : v.lastGrid || 10; });
  function setEditing(on) { if (!ed) return; if (on && !inLayoutStage()) { ctx.toast('The plan is changed in the Layout stage.'); return; } if (!on && ed.mode === 'drawpiece') { ed.mode = null; ed.draft = []; ed.dp = null; } ed.editing = on; if (!on) ed.shape = null; draw(); panel(); }

  // ----- the tool strip: a small bar at the bottom left of the open map, clear of the Plan key and the scale -----
  const IC = (d, extra = '') => '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + extra + '>' + d + '</svg>';
  const TOOLS = [
    { id: 'select', label: 'Select', key: 'V', ic: IC('<path d="M3.5 2.5l9 5.2-4 .9-2.1 3.9z"/>') },
    { id: 'edit', label: 'Edit', key: 'E', ic: IC('<path d="M2.5 13.5l.6-3L10.8 2.8a1.5 1.5 0 0 1 2.1 0l.3.3a1.5 1.5 0 0 1 0 2.1L5.5 12.9z"/><path d="M9.5 4l2.5 2.5"/>') },
    0,
    { id: 'add', label: 'Add', key: 'A', ic: IC('<path d="M8 3v10M3 8h10"/>') },
    { id: 'area', label: 'Draw area', key: '', ic: IC('<path d="M2.5 11.5l2-8 8 2-1.5 7.5z" stroke-dasharray="2 1.6"/><circle cx="4.5" cy="3.5" r="1.2" fill="currentColor"/>'), more: 1 },
    { id: 'line', label: 'Draw line', key: '', ic: IC('<path d="M2.5 13l4-6 3 3 4-7"/>'), more: 1 },
    0,
    { id: 'dist', label: 'Measure distance', key: 'M', ic: IC('<path d="M1.5 10.5l9-9 4 4-9 9z"/><path d="M4.5 7.5l1.5 1.5M6.5 5.5l1.5 1.5M8.5 3.5l1.5 1.5"/>') },
    { id: 'marea', label: 'Measure area', key: '⇧M', ic: IC('<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 6.5h4v-4M13.5 9.5h-4v4" />'), more: 1 },
    0,
    { id: 'fit', label: 'Fit plan', key: '⇧F', ic: IC('<path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"/>') },
    { id: 'fitsel', label: 'Fit selection', key: 'F', ic: IC('<path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"/><rect x="5.5" y="5.5" width="5" height="5" rx=".8"/>'), more: 1 },
    0,
    { id: 'grid', label: 'Grid', key: 'G', ic: IC('<path d="M2.5 5.5h11M2.5 10.5h11M5.5 2.5v11M10.5 2.5v11"/>'), more: 1 },
    0,
    { id: 'mix', label: 'Development mix', key: 'U', ic: IC('<circle cx="8" cy="8" r="5.5"/><path d="M8 8V2.5A5.5 5.5 0 0 1 13.5 8z" fill="currentColor" stroke="none" opacity=".5"/><path d="M8 2.5V8h5.5M8 8l-3.9 3.9"/>') },
    { id: 'layers', label: 'Layers', key: '', ic: IC('<path d="M8 2.5l6 3-6 3-6-3z"/><path d="M2 8.5l6 3 6-3"/><path d="M2 11.2l6 3 6-3"/>') },
    { id: 'more', label: 'More tools', key: '', ic: IC('<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>'), phone: 1 }
  ];
  const strip = document.createElement('div'); strip.className = 'sp-strip'; strip.setAttribute('role', 'toolbar'); strip.setAttribute('aria-label', 'Plan tools');
  strip.innerHTML = '<div class="sp-tgrp">' + TOOLS.map(t => !t ? '</div><div class="sp-tgrp">' : '<button type="button" class="sp-tb' + (t.more ? ' sp-tb-x' : '') + (t.phone ? ' sp-tb-more' : '') + '" data-tool="' + t.id + '" aria-label="' + t.label + '">' + t.ic + '</button>').join('') + '</div>';
  const pop = document.createElement('div'); pop.className = 'sp-tpop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  mapUi.append(strip, pop);
  strip.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { if (!b.getAttribute('aria-disabled')) runTool(b.dataset.tool, b); });
  function runTool(id, b) {
    if (!ed) return;
    if (id === 'select') { if (ed.mode) leaveMode(); setEditing(false); }
    else if (id === 'edit') setEditing(!ed.editing);
    else if ((id === 'add' || id === 'area' || id === 'line') && !inLayoutStage()) ctx.toast('The plan is changed in the Layout stage.');
    else if (id === 'add') { if (popKind === 'add') closePops(); else openPop('add', b || strip.querySelector('[data-tool="add"]')); }
    else if (id === 'area' || id === 'line') { if (ed.mode === 'drawpiece' && ed.dp?.line === (id === 'line')) { leaveMode(); return; } openPop(id, b); }
    else if (id === 'dist') startMeasure('dist'); else if (id === 'marea') startMeasure('area');
    else if (id === 'fit') planFit(); else if (id === 'fitsel') fitSel();
    else if (id === 'grid') toggleGrid();
    else if (id === 'mix') setMix(!ed.mix);
    else if (id === 'layers') { if (popKind === 'layers') closePops(); else openPop('layers', b); }
    else if (id === 'more') { strip.classList.toggle('open'); paintTools(); }
    paintTools();
  }
  // each button: pressed when its tool is on, and when it can't be used, why (in its tooltip)
  function paintTools() {
    if (!ed) return; const pl = PL(), has = !!pl?.elements.length, ring = pl?.ring.length >= 3, V = T.viewOf(pl), m = ed.mode;
    const state = {
      select: [!ed.editing && !m, ring ? '' : 'Draw the site first'], edit: [!!ed.editing, ring && has ? '' : 'Lay something out first'], add: [popKind === 'add', ring ? '' : 'Draw the site first'],
      area: [m === 'drawpiece' && !ed.dp?.line, !ring ? 'Draw the site first' : ed.editing ? '' : 'Turn on Edit to draw'], line: [m === 'drawpiece' && !!ed.dp?.line, !ring ? 'Draw the site first' : ed.editing ? '' : 'Turn on Edit to draw'],
      dist: [m === 'measure' && ed.meas?.kind === 'dist', ring ? '' : 'Draw the site first'], marea: [m === 'measure' && ed.meas?.kind === 'area', ring ? '' : 'Draw the site first'],
      fit: [null, ring ? '' : 'Draw the site first'], fitsel: [null, sels().length ? '' : 'Select a piece first'],
      grid: [!!V.grid, ring ? '' : 'Draw the site first'], layers: [popKind === 'layers', ring ? '' : 'Draw the site first'], more: [strip.classList.contains('open'), ''],
      mix: [!!ed.mix, ed.mix || ring && pl.elements.some(e => e.kind === 'building') ? '' : 'Lay out buildings first'] // on, it can always be turned off
    };
    if (ring && !inLayoutStage()) for (const k of ['edit', 'add', 'area', 'line']) state[k] = [false, 'Changed in the Layout stage']; // the plan changes only there
    for (const t of TOOLS) { if (!t) continue; const b = strip.querySelector('[data-tool="' + t.id + '"]'), [on, why] = state[t.id];
      if (on != null) b.setAttribute('aria-pressed', String(!!on)); b.classList.toggle('on', !!on);
      if (why) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      const name = t.id === 'grid' && V.grid ? 'Grid (' + V.grid + ' ft)' : t.id === 'edit' && ed.editing ? 'Stop editing' : t.label;
      b.title = name + (t.key ? ' (' + t.key + ')' : '') + (why ? ': ' + why : ''); b.setAttribute('aria-label', name); }
    mixEl.hidden = !ed.mix || !!popKind || !ring || !mixEl.innerHTML; // the mix card steps aside while a pop-over is open
    strip.hidden = !ring; placeStrip();
  }
  // where the strip sits: the bottom left of the open map; past the Plan key when that's there, else above it. On phones
  // the bottom of the map holds the folded key, the scale and the sheet: the strip goes top left, the mode pill under it
  // Desktop: the legend, the strip and the scale share one baseline and one gutter (16 px in from the map's edges): the
  // strip sits 12 px right of the legend with their bottoms lined up, so the legend folding (it grows and shrinks
  // upwards) never moves it; only when there's no room beside the legend does it go above it.
  const GUT = 16, GAP = 12;
  function placeStrip() {
    if (mapUi.hidden) return; const sc = mapUi.querySelector('.sp-scale');
    if (phone()) { Object.assign(strip.style, { left: '8px', top: '8px', bottom: 'auto' }); Object.assign(sc.style, { right: '8px', bottom: '8px' }); if (popKind) placePop(); placeChip(); placeMix(); return; } strip.style.top = '';
    const u = mapUi.getBoundingClientRect(), lg = document.getElementById('legends'), w = strip.hidden ? 0 : strip.offsetWidth, sw = sc.offsetWidth;
    const L = lg && lg.offsetParent !== null && getComputedStyle(lg).visibility !== 'hidden' && getComputedStyle(lg).display !== 'none' ? lg.getBoundingClientRect() : null;
    let left = GUT, bottom = GUT, line = GUT;
    if (L && L.width > 2 && L.right > u.left && L.left < u.left + w + GUT && L.bottom > u.top + u.height / 2) { // the legend is in that corner
      const base = Math.round(u.bottom - L.bottom), after = L.right - u.left + GAP, room = u.width - GUT - sw - GAP - after;
      if (base >= 0) line = base; if (room >= w && base >= 0) { left = after; bottom = base; } else { left = Math.max(GUT, L.left - u.left); bottom = Math.max(GUT, u.bottom - L.top + GAP); }
    }
    strip.style.left = Math.round(left) + 'px'; strip.style.bottom = Math.round(bottom) + 'px';
    Object.assign(sc.style, { right: GUT + 'px', bottom: line + 'px' }); // the scale on the same line
    if (popKind) placePop(); placeChip(); placeMix();
  }
  // the mode chip rides on the strip: just above it, left edges lined up (phones: just under it, top left)
  function placeChip() {
    if (pillMode.hidden || mapUi.hidden) return; const ph = phone(), on = !strip.hidden, sl = parseFloat(strip.style.left) || (ph ? 8 : GUT);
    if (ph) { Object.assign(pillMode.style, { left: sl + 'px', top: (on ? strip.offsetTop + strip.offsetHeight + 6 : 8) + 'px', bottom: 'auto', maxWidth: 'calc(100% - ' + (sl + 8) + 'px)' }); return; }
    const sb = parseFloat(strip.style.bottom) || GUT; Object.assign(pillMode.style, { left: sl + 'px', top: 'auto', bottom: (on ? sb + strip.offsetHeight + 6 : sb) + 'px', maxWidth: 'calc(100% - ' + (sl + GUT) + 'px)' });
  }
  if (window.ResizeObserver) { const lro = new ResizeObserver(() => { if (ed) placeStrip(); }), watchKey = () => { const lg = document.getElementById('legends'); if (lg) lro.observe(lg); else setTimeout(watchKey, 1000); }; watchKey(); } // the Plan key folds and unfolds
  // the pop-overs from the strip: what to draw, and Layers
  let popKind = null, popBtn = null;
  function openPop(kind, b) { closeMenu(); if (itRen != null) endRename(true); popKind = kind; popBtn = b; pop.hidden = false; pop.dataset.kind = kind; pop.classList.remove('sp-items'); pop.innerHTML = ''; itSel = null; if (kind === 'layers') paintLayers(); else if (kind === 'add') paintAdd(); else paintChooser(kind); placePop(); paintTools(); pop.querySelector('button, input')?.focus({ preventScroll: true }); }
  function closePops() { if (itRen != null) endRename(true); const was = popKind; popKind = null; pop.hidden = true; pop.innerHTML = ''; pop.classList.remove('sp-items'); if (ed?.hov) hoverItem(null); if (was) { paintTools(); if (popBtn && document.activeElement && pop.contains(document.activeElement)) popBtn.focus(); } }
  const closeChooser = closePops;
  function placePop() { if (!popKind || !popBtn) return; const u = mapUi.getBoundingClientRect(), b = popBtn.getBoundingClientRect(), s0 = strip.getBoundingClientRect(), c = pillMode.hidden ? null : pillMode.getBoundingClientRect();
    const s = c ? { top: Math.min(s0.top, c.top), bottom: Math.max(s0.bottom, c.bottom) } : s0; // clear of the mode chip on the strip too
    pop.classList.toggle('ph', phone()); if (phone()) { Object.assign(pop.style, { left: Math.round(Math.max(8, Math.min(s0.left, innerWidth - pop.offsetWidth - 8))) + 'px', top: Math.round(s.bottom + 6) + 'px', bottom: 'auto', maxHeight: Math.round(innerHeight - s.bottom - 90) + 'px' }); return; } pop.style.top = ''; // phones: under the strip, over the sheet
    pop.style.left = Math.round(Math.max(6, Math.min(b.left - u.left, u.width - pop.offsetWidth - 6))) + 'px'; pop.style.bottom = Math.round(u.bottom - s.top + 6) + 'px'; pop.style.maxHeight = Math.max(120, Math.round(s.top - u.top - 12)) + 'px'; }
  function paintChooser(kind) {
    const list = kind === 'line' ? T.LINE_KINDS.map(([k, l, w]) => [k, l, w + ' ft wide']) : T.AREA_KINDS.map(([k, l]) => [k, l, k === 'keepout' ? 'Nothing built or paved on it' : '']);
    pop.innerHTML = '<div class="sp-tp-h">' + (kind === 'line' ? 'Draw a line' : 'Draw an area') + '</div>' + list.map(([k, l, sub]) => '<button type="button" class="sp-tp-i" data-dk="' + k + '"><i class="sp-tp-sw k-' + k + '" aria-hidden="true"></i><span>' + esc(l) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>').join('') +
      '<div class="sp-tp-n">' + (kind === 'line' ? 'Click points along it; Enter or double-click finishes.' : 'Click each corner; click the first again or press Enter to close it.') + ' Backspace takes a point back, Esc cancels.</div>';
    pop.querySelectorAll('[data-dk]').forEach(b => b.onclick = () => startDrawPiece(b.dataset.dk));
  }
  // Add: the pieces you can add (ADD_GROUPS), as tiles with a small drawing each; picked, it turns Edit on and lands in
  // the nearest clear spot to the middle of the view (or, from the right-click menu, where you clicked)
  const addTiles = () => ADD_GROUPS.map(([g, ks]) => '<div class="sp-ad-g"><div class="sp-ad-gh">' + esc(g) + '</div><div class="sp-ad-ts">' + ks.map(k => '<button type="button" class="sp-ad-t" data-ak="' + k + '" title="' + esc(ADD_LABEL[k] || SP.KINDS[k]?.label || k) + '"><i class="sp-ad-ic" style="--c:' + addAccent(k) + '">' + (ADD_ICON[k] || ADD_ICON.building) + '</i><span>' + esc(ADD_SHORT[k] || k) + '</span></button>').join('') + '</div></div>').join('');
  function paintAdd() {
    pop.innerHTML = '<div class="sp-tp-h">Add to the plan</div><div class="sp-ad">' + addTiles() + '</div>' + (card.querySelector('#spLib') ? '<button type="button" class="sp-link sp-ad-lib" data-lib>From the building library…</button>' : '') +
      '<div class="sp-tp-n">Drag one onto the site to place it there, or click to drop it near the middle of the view.</div>';
    pop.querySelectorAll('[data-ak]').forEach(b => { b.onclick = () => { closePops(); addPiece(b.dataset.ak); }; dragToAdd(b, b.dataset.ak); });
    const lb = pop.querySelector('[data-lib]'); if (lb) lb.onclick = () => { closePops(); const s = card.querySelector('#spLib'); if (!s) return; s.scrollIntoView({ block: 'center' }); s.focus(); try { s.showPicker?.(); } catch (e) {} };
  }
  // a piece from the Add palette or the right-click menu: adding is editing, so Edit comes on (at: where, in plan feet)
  function addPiece(kind, at) { if (!ed) return; if (!ed.editing) ed.editing = true; ed.shape = null; addEl(kind, at); }
  // drag an Add tile (the palette's or the panel's) onto the map: its outline follows the pointer at the map's scale and
  // turned as it will land, red off the site, and it's added where you let go. A plain click still adds it mid-view; Esc
  // or letting go off the map cancels. The palette steps aside while you drag.
  const addSize = (pl, kind) => { if (kind !== 'building') return SIZE[kind] || [40, 40]; const pg = SP.normalizeProgram(pl.program); return [Math.round(Math.max(40, Math.min(240, 12000 / pg.depth))), Math.round(Math.min(pg.depth, 160))]; };
  function dragToAdd(b, kind) {
    let dragged = false;
    b.addEventListener('click', ev => { if (dragged) { dragged = false; ev.stopImmediatePropagation(); ev.preventDefault(); } }, true); // the click that ends a drag back on the tile adds nothing
    b.addEventListener('pointerdown', e0 => {
      if (e0.button !== 0 || !ed || b.getAttribute('aria-disabled')) return; const pl0 = PL(); if (!pl0 || pl0.ring.length < 3) return;
      let on = false, spot = null, ghost = null, chip = null; const inPop = pop.contains(b), x0 = e0.clientX, y0 = e0.clientY;
      const start = () => { on = true; dragged = true; closeMenu();
        ghost = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ghost.setAttribute('class', 'sp-dragghost'); ghost.innerHTML = '<polygon/>'; ghost.style.setProperty('--ac', addAccent(kind));
        chip = document.createElement('div'); chip.className = 'sp-dragchip'; chip.style.setProperty('--ac', addAccent(kind)); chip.innerHTML = ADD_ICON[kind] + '<span>' + esc(ADD_SHORT[kind] || kind) + '</span>';
        document.body.append(ghost, chip); document.documentElement.classList.add('sp-dragging'); if (inPop) pop.style.visibility = 'hidden'; };
      const place = (x, y) => {
        chip.style.transform = 'translate(' + Math.round(x + 14) + 'px,' + Math.round(y + 14) + 'px)';
        const pl = PL(), mc = map.getContainer(), r = mc.getBoundingClientRect(), t = document.elementFromPoint(x, y);
        spot = null; ghost.classList.remove('on', 'off'); if (!pl || !t || !t.classList.contains('maplibregl-canvas')) { chip.classList.remove('on'); return; }
        const F = SP.frame(pl.origin), at = F.toFt(map.unproject([x - r.left, y - r.top]).toArray()), inSite = SP.inRing(at, pl.ring), { rot } = addAt(pl, at), [w, d] = addSize(pl, kind);
        const pts = SP.outline({ kind: kind === 'pad' ? 'building' : kind, x: at[0], y: at[1], w, d, rot, ...(kind === 'roundabout' ? { shape: 'circle' } : {}) }).map(q => { const p = map.project(F.toLL(q)); return (p.x + r.left).toFixed(1) + ',' + (p.y + r.top).toFixed(1); });
        ghost.firstChild.setAttribute('points', pts.join(' ')); ghost.classList.add(inSite ? 'on' : 'off'); chip.classList.add('on'); spot = { at, inSite };
      };
      const move = e => { if (e.pointerId !== e0.pointerId) return; if (!on) { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; start(); } e.preventDefault(); place(e.clientX, e.clientY); };
      const end = drop => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); removeEventListener('keydown', key, true);
        if (!on) return; ghost.remove(); chip.remove(); document.documentElement.classList.remove('sp-dragging'); if (inPop) pop.style.visibility = '';
        if (!drop || !spot) return; if (!spot.inSite) { ctx.toast('Drop it inside the site.'); return; }
        if (inPop) closePops(); addPiece(kind, spot.at); };
      const up = e => { if (e.pointerId === e0.pointerId) end(true); }, cancel = e => { if (e.pointerId === e0.pointerId) end(false); };
      const key = e => { if (e.key === 'Escape' && on) { e.preventDefault(); e.stopPropagation(); end(false); } };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel); addEventListener('keydown', key, true);
    });
  }
  // arrows step through a pop-over's tiles and buttons (and the right-click menu's), Home and End to the ends
  function stepFocus(box, e, wrap = true) {
    const all = [...box.querySelectorAll('button:not([disabled]):not([aria-disabled]), input')].filter(b => b.offsetParent !== null), i = all.indexOf(document.activeElement); if (!all.length) return false;
    const k = e.key, n = all.length, to = k === 'Home' ? 0 : k === 'End' ? n - 1 : k === 'ArrowDown' || k === 'ArrowRight' ? (i < 0 ? 0 : wrap ? (i + 1) % n : Math.min(n - 1, i + 1)) : k === 'ArrowUp' || k === 'ArrowLeft' ? (i < 0 ? n - 1 : wrap ? (i - 1 + n) % n : Math.max(0, i - 1)) : null;
    if (to == null) return false; e.preventDefault(); e.stopPropagation(); all[to].focus({ preventScroll: true }); return true;
  }
  const EYE = on => on ? IC('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>') : IC('<path d="M2 2l12 12M6.4 3.8A6.8 6.8 0 0 1 8 3.5C12.1 3.5 14.5 8 14.5 8a11 11 0 0 1-1.9 2.5M10.6 10.9A5.6 5.6 0 0 1 8 12.5C3.9 12.5 1.5 8 1.5 8a11.5 11.5 0 0 1 2.6-3"/>');
  const LOCKI = on => on ? IC('<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>') : IC('<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>');
  // Layers has two tabs: Layers (each kind of thing hidden or locked, the grid, snapping) and Items (every piece of the
  // plan under its layer, as in a design tool's layers panel: pick one, Shift-click to add to the set, double-click, F2
  // or the pencil to rename it). The tab last used is remembered on this device.
  const LTAB_KEY = 'fs-sp-ltab', att = s => esc(s).replace(/"/g, '&quot;');
  let layTab = (() => { try { return localStorage.getItem(LTAB_KEY) === 'items' ? 'items' : 'layers'; } catch (e) { return 'layers'; } })();
  const layTabs = () => '<div class="sp-ltabs" role="tablist" aria-label="Layers or items">' + [['layers', 'Layers'], ['items', 'Items']].map(([k, l]) => '<button type="button" role="tab" id="spLt-' + k + '" data-ltab="' + k + '" aria-selected="' + (layTab === k) + '" aria-controls="spLp" tabindex="' + (layTab === k ? 0 : -1) + '">' + l + '</button>').join('') + '</div>';
  const layerBtns = (L, V) => { const hid = V.hidden.includes(L.id), lk = V.locked.includes(L.id);
    return '<button type="button" class="sp-lb" data-f="eye:' + L.id + '" aria-pressed="' + !hid + '" aria-label="' + (hid ? 'Show ' : 'Hide ') + esc(L.label) + '" title="' + (hid ? 'Show' : 'Hide') + ' on the map">' + EYE(!hid) + '</button>' +
      (T.lockable(L) ? '<button type="button" class="sp-lb" data-f="lock:' + L.id + '" aria-pressed="' + lk + '" aria-label="' + (lk ? 'Unlock ' : 'Lock ') + esc(L.label) + '" title="' + (lk ? 'Locked: can’t be picked or moved' : 'Lock so it can’t be picked or moved') + '">' + LOCKI(lk) + '</button>' : '<span class="sp-lb-x"></span>'); };
  const flipLayer = b => { const [k, v] = b.dataset.f.split(':');
    setView(x => { if (k === 'eye') x.hidden = x.hidden.includes(v) ? x.hidden.filter(q => q !== v) : x.hidden.concat(v); else if (k === 'lock') x.locked = x.locked.includes(v) ? x.locked.filter(q => q !== v) : x.locked.concat(v); else if (k === 'grid') { x.grid = +v; if (+v) x.lastGrid = +v; } else if (k === 'snap') x.snap = b.checked; }); };
  function paintLayers() {
    if (popKind !== 'layers' || !ed) return;
    if (layTab === 'items') { if (!pop.querySelector('.sp-il')) { pop.innerHTML = layTabs() + '<div class="sp-il" id="spLp" role="tabpanel" aria-labelledby="spLt-items"></div>'; itSig = ''; } pop.classList.add('sp-items'); paintItems(true); return; }
    pop.classList.remove('sp-items'); const pl = PL(), V = T.viewOf(pl), f = document.activeElement && pop.contains(document.activeElement) ? document.activeElement.dataset.f : null;
    pop.innerHTML = layTabs() + '<div id="spLp" role="tabpanel" aria-labelledby="spLt-layers"><div class="sp-lrows">' + T.LAYERS.map(L => { const hid = V.hidden.includes(L.id);
      return '<div class="sp-lrow' + (hid ? ' off' : '') + '"><span>' + esc(L.label) + (L.id === 'trees' ? '<small>On the map only; Trees in Settings › Look takes them off the plan and the PDF</small>' : '') + '</span>' + layerBtns(L, V) + '</div>'; }).join('') + '</div>' +
      '<div class="sp-tp-sub">Grid <span class="sp-seg" role="group" aria-label="Grid">' + [[0, 'Off'], [5, '5 ft'], [10, '10 ft']].map(([g, l]) => '<button type="button" data-f="grid:' + g + '" aria-pressed="' + (V.grid === g) + '">' + l + '</button>').join('') + '</span></div>' +
      '<label class="sp-tp-sw2"><input type="checkbox" data-f="snap"' + (V.snap ? ' checked' : '') + '><span>Snap to edges<small>Lines pieces up with their neighbours; hold Alt to move freely</small></span></label>' +
      '<div class="sp-tp-n">Exports always include every layer.</div></div>';
    pop.querySelectorAll('[data-f]').forEach(b => b[b.type === 'checkbox' ? 'onchange' : 'onclick'] = () => flipLayer(b));
    if (f) pop.querySelector('[data-f="' + f + '"]')?.focus({ preventScroll: true });
  }
  function setTab(t, focus) {
    if (t === layTab && pop.querySelector('[data-ltab]')) { if (focus) pop.querySelector('[data-ltab="' + t + '"]')?.focus({ preventScroll: true }); return; }
    if (itRen != null) endRename(true); layTab = t; try { localStorage.setItem(LTAB_KEY, t); } catch (e) { /* this visit only */ }
    pop.innerHTML = ''; itSel = null; paintLayers(); placePop(); if (focus) pop.querySelector('[data-ltab="' + t + '"]')?.focus({ preventScroll: true });
  }
  // ----- Items -----
  // The list repaints whenever the map does (draw), but only rebuilds when what it shows changes; a new selection just
  // moves the highlight (and scrolls to it). Never mid-rename or mid-click (the row under the pointer would be swapped
  // out and the click lost): it waits, then catches up. Folded layers: ed.fold; long ones (not buildings) start folded.
  let itSig = '', itSel = null, itRen = null, itPress = false, itDirty = false, hovT = 0;
  const PEN = IC('<path d="M2.5 13.5l.6-3L10.8 2.8a1.5 1.5 0 0 1 2.1 0l.3.3a1.5 1.5 0 0 1 0 2.1L5.5 12.9z"/><path d="M9.5 4l2.5 2.5"/>');
  const itBox = () => popKind === 'layers' && layTab === 'items' ? pop.querySelector('.sp-il') : null;
  const itNavs = box => [...box.querySelectorAll('[data-nav]')];
  const itShut = g => ed.fold?.[g.id] ?? (g.id !== 'buildings' && g.items.length > 12);
  const itRow = (box, id) => [...box.querySelectorAll('.sp-it')].find(r => r.dataset.id === String(id));
  const navKey = a => a.dataset.pick != null ? '[data-pick="' + CSS.escape(a.dataset.pick) + '"]' : a.dataset.fold ? '[data-fold="' + a.dataset.fold + '"]' : a.dataset.f ? '[data-f="' + a.dataset.f + '"]' : a.dataset.ren != null ? '[data-ren="' + CSS.escape(a.dataset.ren) + '"]' : null;
  function paintItems(force) {
    const box = itBox(), pl = ed && PL(); if (!box || !pl) return;
    const V = T.viewOf(pl), groups = T.itemGroups(pl), set = sels(), on = new Set(set), selKey = set.join('\n'), newSel = selKey !== itSel;
    if (newSel && set.length) for (const g of groups) if (itShut(g) && g.items.some(i => on.has(i.id))) (ed.fold ||= {})[g.id] = false; // picked on the map: its layer opens
    const sig = JSON.stringify([groups, V.hidden, V.locked, groups.map(itShut)]);
    if (itRen != null || itPress) { itDirty = itDirty || force || sig !== itSig; markItems(box, on, newSel); itSel = selKey; return; }
    if (force || itDirty || sig !== itSig) {
      const top = box.scrollTop, a = document.activeElement, k = a && box.contains(a) ? navKey(a) : null, at = k ? itNavs(box).indexOf(a.closest('.sp-it')?.querySelector('[data-nav]') || a) : -1;
      box.innerHTML = groups.length ? groups.map(g => { const L = T.LAYERS.find(x => x.id === g.id), hid = V.hidden.includes(g.id), lk = V.locked.includes(g.id), shut = itShut(g), why = hid ? ' · hidden on the map' : lk ? ' · locked' : '';
        return '<div class="sp-ig' + (hid ? ' off' : '') + (lk ? ' lk' : '') + '" role="group" aria-label="' + att(g.label) + '"><div class="sp-ig-h"><button type="button" class="sp-ig-f" data-fold="' + g.id + '" data-nav tabindex="-1" aria-expanded="' + !shut + '" title="' + (shut ? 'Show' : 'Fold') + ' the ' + att(g.label.toLowerCase()) + '"><i class="sp-ig-c" aria-hidden="true"></i><span>' + esc(g.label) + '</span><small>' + g.items.length + '</small></button>' + layerBtns(L, V) + '</div>' +
          (shut ? '' : '<div class="sp-ig-l">' + g.items.map(it => '<div class="sp-it" data-id="' + att(it.id) + '"><button type="button" class="sp-it-b" data-pick="' + att(it.id) + '" data-nav tabindex="-1" aria-pressed="false" title="' + att(it.name + ' · ' + it.sub + why) + '"><i class="sp-it-sw' + (it.kind === 'keepout' ? ' ko' : '') + '" style="--c:' + it.color + '" aria-hidden="true"></i><span class="sp-it-t"><span class="sp-it-n">' + esc(it.name) + '</span><small>' + esc(it.sub) + '</small></span></button>' +
            '<button type="button" class="sp-it-r" data-ren="' + att(it.id) + '" tabindex="-1" aria-label="Rename ' + att(it.name) + '" title="Rename (F2)">' + PEN + '</button></div>').join('') + '</div>') + '</div>'; }).join('')
        : '<div class="sp-tp-n">Nothing on this plan yet. Build layouts, or add pieces with Add.</div>';
      box.scrollTop = top; itSig = sig; itDirty = false;
      if (k) { const navs = itNavs(box), t = box.querySelector(k) || navs[Math.min(Math.max(at, 0), navs.length - 1)]; t?.focus({ preventScroll: true }); }
    }
    markItems(box, on, newSel); itSel = selKey;
  }
  // the selection highlighted (and kept in view when it changes); one row or layer heading is the list's Tab stop
  function markItems(box, on, scroll) {
    let first = null; for (const r of box.querySelectorAll('.sp-it')) { const s = on.has(r.dataset.id); r.classList.toggle('on', s); r.firstElementChild?.setAttribute('aria-pressed', String(s)); if (s && !first) first = r; }
    const navs = itNavs(box), stop = navs.find(n => n === document.activeElement) || first?.querySelector('[data-nav]') || navs[0]; for (const n of navs) n.tabIndex = n === stop ? 0 : -1;
    if (scroll && first) keepInView(box, first);
  }
  function keepInView(box, el) { const b = box.getBoundingClientRect(), r = el.getBoundingClientRect(), head = el.classList.contains('sp-it') ? (el.closest('.sp-ig')?.querySelector('.sp-ig-h')?.offsetHeight || 0) : 0; // under the sticky layer heading counts as hidden
    if (r.top < b.top + head) box.scrollTop -= b.top + head - r.top + 4; else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4; }
  // a row clicked: that piece picked (Shift, ⌘ or Ctrl: in or out of the set), as a click on the map does, and brought into view
  function pickItem(id, ev) {
    const pl = PL(), el = pl?.elements.find(e => e.id === id); if (!el) return; const V = T.viewOf(pl);
    if (!T.editable(V, el)) { const L = T.LAYERS.find(x => x.id === T.layerOf(el.kind)); ctx.toast('The ' + L.label + ' layer is ' + (V.hidden.includes(L.id) ? 'hidden on the map: show it' : 'locked: unlock it') + ' to pick ' + ED.labelOf(el) + '.'); return; }
    if (ev?.shiftKey || ev?.metaKey || ev?.ctrlKey) toggleSel(id); else if (ed.sel !== id || sels().length > 1) { pickOne(id); ed.shape = null; draw(); panel(); }
    showPiece(el);
  }
  function foldItems(gid, open) { (ed.fold ||= {})[gid] = !open; paintItems(true); }
  // renaming in place: Enter or leaving the box keeps it, Esc puts it back; an empty name gives the piece its label back.
  // One undo step, the same as the Name box under Selected.
  function startRename(id) {
    const box = itBox(); if (!box) return; if (itRen != null) endRename(true);
    const row = itRow(box, id), el = PL()?.elements.find(e => e.id === id); if (!row || !el) return;
    itRen = id; row.classList.add('ren'); const b = row.querySelector('.sp-it-b'), sw = b.querySelector('.sp-it-sw').cloneNode(true);
    const w = document.createElement('div'); w.className = 'sp-it-e'; const inp = document.createElement('input');
    Object.assign(inp, { type: 'text', className: 'sp-it-in', maxLength: 40, value: ED.labelOf(el), placeholder: ED.labelOf({ ...el, name: '' }), spellcheck: false, autocomplete: 'off' }); inp.setAttribute('aria-label', 'New name for ' + ED.labelOf(el));
    w.append(sw, inp); b.hidden = true; row.insertBefore(w, b);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endRename(e.key === 'Enter', true); } });
    inp.addEventListener('blur', () => { if (itRen === id) endRename(true); });
    inp.focus({ preventScroll: true }); inp.select(); keepInView(box, row);
  }
  function endRename(keep, refocus) {
    const id = itRen; if (id == null) return; itRen = null; const box = itBox(), row = box && itRow(box, id), inp = row?.querySelector('.sp-it-in'), v = inp ? T.cleanName(inp.value) : null;
    const el = PL()?.elements.find(e => e.id === id);
    if (row) { row.classList.remove('ren'); row.querySelector('.sp-it-e')?.remove(); const b = row.querySelector('.sp-it-b'); if (b) b.hidden = false; }
    if (keep && el && v != null && v !== (el.name || '') && !(!el.name && v === ED.labelOf(el))) { change(x => { const t = x.elements.find(q => q.id === id); if (t) t.name = v; }); const n = row?.querySelector('.sp-it-n'); if (n) n.textContent = ED.labelOf(el); }
    if (itDirty || keep) paintItems(true);
    if (refocus && box) { const b = box.querySelector('[data-pick="' + CSS.escape(String(id)) + '"]'); if (b) { b.focus({ preventScroll: true }); keepInView(box, b.closest('.sp-it')); } }
  }
  // the keys in Items: ↑ ↓ Home End move through the rows and layer headings, ← folds a layer (on a row: to its
  // heading), → unfolds; Enter picks the row (on the piece already picked, renames it), F2 renames; ← → on the tabs switch
  function popNav(e) {
    if (popKind !== 'layers') return false; const k = e.key, t = e.target, stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (t.dataset?.ltab) { if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') { stop(); setTab(k === 'Home' ? 'layers' : k === 'End' ? 'items' : t.dataset.ltab === 'items' ? 'layers' : 'items', true); return true; }
      const box = itBox(); if (box && k === 'ArrowDown') { stop(); const a = box.querySelector('[data-nav][tabindex="0"]') || box.querySelector('[data-nav]'); a?.focus({ preventScroll: true }); if (a) keepInView(box, a.closest('.sp-it') || a); return true; } return !!box; }
    const box = itBox(); if (!box || !box.contains(t)) return false; stop();
    const navs = itNavs(box), cur = t.closest('.sp-ig-h')?.querySelector('[data-nav]') || t.closest('.sp-it')?.querySelector('[data-nav]') || t, i = navs.indexOf(cur);
    if (cur.dataset.fold && (k === 'ArrowLeft' || k === 'ArrowRight')) { if ((cur.getAttribute('aria-expanded') === 'true') === (k === 'ArrowLeft')) foldItems(cur.dataset.fold, k === 'ArrowRight'); return true; }
    if (k === 'ArrowLeft' && cur.dataset.pick != null) { cur.closest('.sp-ig')?.querySelector('[data-fold]')?.focus({ preventScroll: true }); return true; }
    if (k === 'ArrowUp' && i <= 0) { pop.querySelector('[data-ltab][aria-selected="true"]')?.focus({ preventScroll: true }); return true; }
    const to = k === 'Home' ? 0 : k === 'End' ? navs.length - 1 : k === 'ArrowDown' ? Math.min(navs.length - 1, i + 1) : k === 'ArrowUp' ? i - 1 : -1;
    if (to >= 0 && navs[to]) { navs[to].focus({ preventScroll: true }); keepInView(box, navs[to].closest('.sp-it') || navs[to]); }
    return true;
  }
  pop.addEventListener('click', e => {
    const tb = e.target.closest('[data-ltab]'); if (tb) { setTab(tb.dataset.ltab, true); return; }
    if (!itBox()?.contains(e.target)) return; const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.f) flipLayer(b); else if (b.dataset.fold) foldItems(b.dataset.fold, b.getAttribute('aria-expanded') !== 'true'); else if (b.dataset.ren != null) startRename(b.dataset.ren); else if (b.dataset.pick != null) pickItem(b.dataset.pick, e);
  });
  pop.addEventListener('dblclick', e => { const b = itBox()?.contains(e.target) && e.target.closest('[data-pick]'); if (b) { e.preventDefault(); startRename(b.dataset.pick); } });
  pop.addEventListener('keydown', e => { const b = itBox()?.contains(e.target) && e.target.closest('[data-pick]'); if (!b || e.altKey || e.metaKey || e.ctrlKey) return; const id = b.dataset.pick;
    if (e.key === 'F2' || e.key === 'Enter' && sels().length === 1 && sels()[0] === id) { e.preventDefault(); e.stopPropagation(); startRename(id); } });
  pop.addEventListener('focusin', e => { const box = itBox(); if (!box || !e.target.matches?.('[data-nav]') || !box.contains(e.target)) return; for (const n of itNavs(box)) n.tabIndex = n === e.target ? 0 : -1; });
  // a press in the list holds back a rebuild until the click lands (see paintItems)
  pop.addEventListener('pointerdown', e => { if (itBox()?.contains(e.target)) itPress = true; });
  document.addEventListener('pointerup', () => { if (itPress) setTimeout(() => { itPress = false; if (itDirty && itRen == null) paintItems(true); }, 0); }, true);
  // hovering a row outlines its piece on the map (a mouse only; a short wait so sweeping down the list doesn't redraw for every row)
  const hoverItem = id => { clearTimeout(hovT); hovT = setTimeout(() => { if (!ed || ed.hov === id) return; ed.hov = id; draw(); }, id ? 60 : 0); };
  pop.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const r = itBox()?.contains(e.target) && e.target.closest('.sp-it'); hoverItem(r && !r.closest('.sp-ig.off') ? r.dataset.id : null); });
  pop.addEventListener('pointerleave', () => hoverItem(null));
  // a click outside closes the pop-over; with Items open, a click on the map doesn't (the list follows what you pick there)
  document.addEventListener('pointerdown', e => { if (popKind && !pop.contains(e.target) && !strip.contains(e.target) && !(popKind === 'layers' && layTab === 'items' && map.getCanvasContainer().contains(e.target))) closePops(); }, true);

  // ----- right-click (a long press on touch) while a plan is open: what can be done right there -----
  // On a piece: it's picked, then Duplicate, Copy, Delete, Turn 90°, Edit shape and Add point here (buildings and the
  // other pieces whose outline can be edited), Pin or Let it move (plans laid out by the engine), Fit selection and Change
  // with AI. On a set: what works on all of them. On open ground: Add here (the Add palette's pieces, placed where you
  // clicked, then settled in the nearest clear spot), Measure from here, Fit plan, Paste. Editing actions turn Edit on.
  // Arrows, Home and End move through it, → opens Add here, ← or Esc closes; a click elsewhere or a map move closes it.
  const MOD = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
  const cm = document.createElement('div'); cm.className = 'sp-cm'; cm.hidden = true; cm.setAttribute('role', 'menu'); cm.setAttribute('aria-label', 'Plan actions');
  const cmSub = document.createElement('div'); cmSub.className = 'sp-cm sp-cm-sub'; cmSub.hidden = true; cmSub.setAttribute('role', 'menu'); cmSub.setAttribute('aria-label', 'Add here');
  document.body.append(cm, cmSub);
  let cmFt = null, cmEl = null, cmBack = null, cmFor = null, lpAt = 0, clip = null; // cmFor: the New Option button the menu is open from
  const ensureEdit = () => { if (ed && !ed.editing) { ed.editing = true; draw(); panel(); } };
  function openMenu(point, lngLat, o = {}) {
    const pl = ed && PL(); if (!pl || pl.ring.length < 3 || ctx.view !== 'map' || !inLayoutStage()) return; // (the plan changes only in the Layout stage)
    closePops(); closeMenu(); if (drag) { if (drag.type !== 'box' && drag.moved) { const x = pl.elements.find(q => q.id === drag.id); if (x) Object.assign(x, drag.orig); } drag = null; boxEl.hidden = true; }
    const ft = ftAt(pl, lngLat), h = o.sel ? null : hit(pl, { point, lngLat }), V = T.viewOf(pl);
    let el = o.sel ? pl.elements.find(x => x.id === ed.sel) : h?.el || (h?.h != null ? pl.elements.find(x => x.id === ed.sel) : null);
    if (el && !T.editable(V, el)) el = null;
    if (el && !sels().includes(el.id)) { pickOne(el.id); if (ed.shape !== el.id) ed.shape = null; draw(); panel(); }
    const set = el ? sels() : [], items = [], it = (id, label, key = '', x = {}) => items.push({ id, label, key, ...x }), sep = () => items.push(0), rc = !!pl.recipe;
    let head = '';
    if (set.length > 1) { const pins = set.every(id => pl.elements.find(x => x.id === id)?.pinned); head = plural(set.length, 'piece') + ' selected';
      if (set.some(id => pl.elements.find(x => x.id === id)?.kind === 'building')) { it('use', 'Change use', '', { sub: 1 }); sep(); }
      it('dup', 'Duplicate', MOD + 'D'); it('copy', 'Copy', MOD + 'C'); it('del', 'Delete', 'Del'); if (rc) it('pin', pins ? 'Let them move' : 'Pin them', '', { tip: pins ? 'Re-fitting may move them again' : 'Re-fitting keeps them where they are' }); sep(); it('fitsel', 'Fit selection', 'F'); }
    else if (el) { const nm = ED.labelOf(el), kl = SP.KINDS[el.kind]?.label || ''; head = nm + (kl && !nm.toLowerCase().includes(kl.toLowerCase()) ? ' · ' + kl.toLowerCase() : '');
      if (el.kind === 'building') { it('use', 'Change use', '', { sub: 1 }); sep(); } // retail, office, restaurant…: its parking need follows
      it('dup', 'Duplicate', MOD + 'D'); it('copy', 'Copy', MOD + 'C'); it('del', 'Delete', 'Del'); it('turn', T.isEntrance(el) ? 'Turn 15°' : 'Turn 90°', 'R');
      if (el.kind === 'parking') { sep(); it('stalldir', 'Stall direction', '', { tip: 'Turn the stalls 90° inside the same outline' }); it('faceb', 'Face the building', '', { tip: 'Turn the stalls toward the nearest building face' }); }
      if (SHAPEABLE.includes(el.kind) || T.routeable(el)) { sep(); it('shape', ed.shape === el.id ? 'Done shaping' : T.routeable(el) ? 'Bend it (edit shape)' : 'Edit shape'); it('addpt', 'Add point here', 'Double-click'); }
      if (rc) { sep(); it('pin', el.pinned ? 'Let it move' : 'Pin it', '', { tip: el.pinned ? 'Re-fitting may move it again' : 'Re-fitting keeps it where it is' }); }
      sep(); it('fitsel', 'Fit selection', 'F'); if (card.querySelector('#spChg')) it('ai', 'Change with AI…');
      if (el.kind === 'green') { sep(); it('add', 'Add here', '', { sub: 1 }); it('paste', 'Paste here', MOD + 'V', clip ? {} : { off: 'Copy a piece first' }); } } // a lawn is open land: you can add or paste onto it too
    else { head = 'Here'; it('add', 'Add here', '', { sub: 1 }); it('measure', 'Measure from here', 'M'); sep(); it('fitplan', 'Fit plan', '⇧F'); it('paste', 'Paste', MOD + 'V', clip ? {} : { off: 'Copy a piece first' }); }
    cm.innerHTML = '<div class="sp-cm-h">' + esc(head) + '</div>' + items.map(x => !x ? '<hr>' : '<button type="button" role="menuitem" data-c="' + x.id + '"' + (x.sub ? ' aria-haspopup="menu" aria-expanded="false"' : '') + (x.off ? ' aria-disabled="true"' : '') + (x.tip || x.off ? ' title="' + esc(x.tip || x.off) + '"' : '') + '><span>' + esc(x.label) + (x.off ? '<em>' + esc(x.off) + '</em>' : '') + '</span>' +
      (x.sub ? '<i aria-hidden="true">›</i>' : x.key ? '<kbd>' + esc(x.key) + '</kbd>' : '') + '</button>').join('').replace(/^(<div[^>]*>.*?<\/div>)<hr>|<hr>$/g, '$1');
    cmFt = ft; cmEl = el; cmBack = document.activeElement !== document.body ? document.activeElement : null;
    cm.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => { if (!b.getAttribute('aria-disabled')) menuAct(b.dataset.c, b); }; if (b.hasAttribute('aria-haspopup')) b.onpointerenter = () => openSub(b); else b.onpointerenter = () => closeSub(); });
    const r = map.getContainer().getBoundingClientRect(); cm.hidden = false; const w = cm.offsetWidth, hh = cm.offsetHeight;
    let x = r.left + point.x + 2, y = r.top + point.y + 2; if (x + w > innerWidth - 8) x = Math.max(8, x - w - 4); if (y + hh > innerHeight - 8) y = Math.max(8, innerHeight - hh - 8);
    Object.assign(cm.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px' });
    if (o.keys) cm.querySelector('[data-c]:not([aria-disabled])')?.focus({ preventScroll: true }); else cm.focus?.({ preventScroll: true });
  }
  cm.tabIndex = -1;
  function openSub(b) {
    if (!cmSub.hidden && cmSub.dataset.for === b.dataset.c) return; closeSub(); cmSub.dataset.for = b.dataset.c;
    if (b.dataset.c === 'use') { // the selected buildings' use: the current one ticked
      const pl = PL(), bs = sels().map(id => pl.elements.find(x => x.id === id)).filter(x => x?.kind === 'building'), u0 = SP.normalizeProgram(pl.program).use, cur = new Set(bs.map(x => x.use || u0));
      cmSub.setAttribute('aria-label', 'Change use');
      cmSub.innerHTML = '<div class="sp-cm-h">Use</div>' + Object.entries(SP.USES).map(([k, u]) => '<button type="button" role="menuitemradio" aria-checked="' + (cur.size === 1 && cur.has(k)) + '" data-uk="' + k + '"><span>' + esc(u.label) + '</span>' + (cur.size === 1 && cur.has(k) ? '<i aria-hidden="true">✓</i>' : '') + '</button>').join('');
      cmSub.querySelectorAll('[data-uk]').forEach(t => t.onclick = () => { closeMenu(); setUse(bs.map(x => x.id), t.dataset.uk); });
    } else {
      cmSub.setAttribute('aria-label', 'Add here'); cmSub.innerHTML = '<div class="sp-cm-h">Add here</div><div class="sp-ad">' + addTiles() + '</div>';
      cmSub.querySelectorAll('[data-ak]').forEach(t => t.onclick = () => { const at = cmFt; closeMenu(); addPiece(t.dataset.ak, at); });
    }
    cmSub.hidden = false; b.setAttribute('aria-expanded', 'true');
    const a = b.getBoundingClientRect(), w = cmSub.offsetWidth, h = cmSub.offsetHeight; let x = a.right + 4, y = a.top - 6; if (x + w > innerWidth - 8) x = Math.max(8, a.left - w - 4); if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    Object.assign(cmSub.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px' });
  }
  function closeSub() { if (cmSub.hidden) return; cmSub.hidden = true; cmSub.innerHTML = ''; delete cmSub.dataset.for; cm.querySelectorAll('[aria-haspopup]').forEach(x => x.setAttribute('aria-expanded', 'false')); }
  // a building's use (or several at once): one undo step, then the parking and the rest re-fit to the new need
  function setUse(ids, use) {
    const pl = PL(); if (!pl || !ids.length || !SP.USES[use]) return; ensureEdit();
    change(x => { for (const q of x.elements) if (ids.includes(q.id) && q.kind === 'building') { q.use = use; if (!SP.USES[use].garage) delete q.units; q.pinned = true; } });
    draw(); panel(); const lbl = ids.length > 1 ? plural(ids.length, 'building') : ED.labelOf(pl.elements.find(q => q.id === ids[0]));
    ctx.toast(lbl + ' is now ' + SP.USES[use].label.toLowerCase() + '.'); refitSoon('Changed', lbl);
  }
  function closeMenu(refocus) { if (cm.hidden) return; closeSub(); cm.hidden = true; cm.innerHTML = ''; cm.setAttribute('aria-label', 'Plan actions'); cm.classList.remove('sp-cm-opt');
    if (cmFor) { cmFor.setAttribute('aria-expanded', 'false'); if (!cmBack?.isConnected) cmBack = [...card.querySelectorAll('[data-newopt]')].find(x => x.offsetParent) || null; cmFor = null; } // (the panel was drawn again under it)
    if (refocus && cmBack?.isConnected) try { cmBack.focus({ preventScroll: true }); } catch (e) {} cmBack = null; }
  function menuAct(id, b) {
    const pl = PL(), ft = cmFt, el = cmEl; if (!pl) return;
    if (id === 'add' || id === 'use') { openSub(b); cmSub.querySelector('[data-ak], [aria-checked="true"], [data-uk]')?.focus({ preventScroll: true }); return; }
    closeMenu();
    if (id === 'dup') { ensureEdit(); dupSel(); } else if (id === 'copy') copySel(); else if (id === 'del') { ensureEdit(); delEls(sels()); }
    else if (id === 'turn' && el) { ensureEdit(); turnEl(el); }
    else if (id === 'stalldir' && el) stallDir(el); else if (id === 'faceb' && el) faceB(el);
    else if (id === 'shape' && el) { ensureEdit(); if (ed.shape === el.id) { ed.shape = null; draw(); panel(); } else shapeOn(el); }
    else if (id === 'addpt' && el) addPointAt(el, ft);
    else if (id === 'pin') { const ids = sels(), all = ids.every(i => pl.elements.find(x => x.id === i)?.pinned); change(x => { for (const q of x.elements) if (ids.includes(q.id)) { if (all) delete q.pinned; else q.pinned = true; } }); ctx.toast(all ? 'Re-fitting may move ' + (ids.length > 1 ? 'them' : 'it') + ' again.' : 'Pinned: re-fitting keeps ' + (ids.length > 1 ? 'them' : 'it') + ' where ' + (ids.length > 1 ? 'they are.' : 'it is.')); }
    else if (id === 'fitsel') fitSel(); else if (id === 'fitplan') planFit();
    else if (id === 'ai') { const ta = card.querySelector('#spChg'); if (!ta) return; if (phone() && card.classList.contains('min')) { card.classList.remove('min'); card.classList.add('half'); } ta.scrollIntoView({ block: 'center' }); ta.focus(); }
    else if (id === 'measure') { startMeasure('dist'); if (ed.mode === 'measure' && ft) { ed.meas.pts.push(ft.map(v => +v.toFixed(2))); drawD(); paintMode(); } }
    else if (id === 'paste') pasteAt(ft);
  }
  // Edit shape from the menu: as the Selected box's button does, the outline becomes points to drag (one undo step)
  // a drive or an entrance becomes a route instead: its centre line's points, its width and its Curve (T.routeOf)
  function shapeOn(el) { const ring = PL()?.ring || []; change(() => {
    if (T.routeable(el)) { if (!el.path) { const r = T.routeOf(el, ring); for (const k of Object.keys(el)) delete el[k]; Object.assign(el, r); } }
    else if (!el.poly) { const o = T.asOutline(el); Object.assign(el, o.set); for (const k of o.drop) delete el[k]; } // (parking keeps its stalls running the way they did)
    el.pinned = true; }); ed.shape = el.id; draw(); panel(); }
  // keys while the menu is open: arrows and Home/End move, → and ← open and close Add here, Esc closes, Tab leaves
  function menuKey(e) {
    const k = e.key, inSub = !cmSub.hidden && cmSub.contains(document.activeElement), stop = () => { e.preventDefault(); e.stopPropagation(); };
    const parent = () => cm.querySelector('[aria-expanded="true"]') || cm.querySelector('[aria-haspopup]');
    if (k === 'Escape') { stop(); if (inSub) { const pb = parent(); closeSub(); pb?.focus({ preventScroll: true }); } else closeMenu(true); return; }
    if (k === 'Tab') { stop(); closeMenu(true); return; }
    if (inSub && k === 'ArrowLeft') { stop(); const pb = parent(); closeSub(); pb?.focus({ preventScroll: true }); return; }
    if (!inSub && k === 'ArrowRight' && document.activeElement?.hasAttribute('aria-haspopup')) { stop(); menuAct(document.activeElement.dataset.c, document.activeElement); return; }
    if (/^(ArrowUp|ArrowDown|Home|End)$/.test(k) || inSub && k === 'ArrowRight') { stepFocus(inSub ? cmSub : cm, e); return; }
    if (k === 'Enter' || k === ' ') return; // the focused item's own click
    stop();
  }
  // the menu key / Shift+F10: the menu for what's picked (at its middle on screen), else for the middle of the view
  function menuForSelection() {
    const pl = PL(); if (!pl || pl.ring.length < 3) return; const set = sels(), F = SP.frame(pl.origin), m = map.getContainer().getBoundingClientRect(), f = freeRect();
    const b = set.length ? T.bboxOf(pl.elements.filter(e => set.includes(e.id))) : null, ll = b ? F.toLL([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]) : map.unproject([(f.l + f.r) / 2 - m.left, (f.t + f.b) / 2 - m.top]).toArray();
    const q = map.project(ll); openMenu(q, { lng: ll[0], lat: ll[1] }, { sel: set.length > 0, keys: true });
  }
  // ----- + New Option (the last button in the option row): a menu, in the right-click menu's box and with its keys —
  // Blank site (first: a new option on this lot and its street sides, nothing laid out, the Build box ready), Copy of this
  // option (its layouts included), and set apart, Clear this option and start over (one undo step, no question asked:
  // the toast's Undo is the way back). The site / design split is lib/siteplan.mjs's (SP.blankOf, SP.clearDesign).
  const optMenuFor = b => !cm.hidden && cmFor === b;
  function openOptMenu(b) {
    const p = P(), pl = PL(); if (!p || !pl) return;
    closePops(); closeMenu();
    const drawn = pl.ring.length >= 3, nm = pl.name, items = [
      { id: 'blank', label: 'Blank site', sub: drawn ? 'This lot and its street sides, nothing laid out' : 'The project’s site, nothing laid out' },
      { id: 'copy', label: 'Copy of ' + nm, sub: 'Its layouts included', off: drawn ? '' : 'Draw the site first' }, 0,
      { id: 'clear', label: 'Clear ' + nm + ' and start over', sub: 'Keeps the site · Undo brings it back', off: designed(pl) ? '' : 'Nothing laid out yet' },
      { id: 'delete', label: 'Delete ' + nm, sub: (shared === true ? 'For the team too · ' : '') + 'Undo brings it back', danger: true }];
    cm.innerHTML = '<div class="sp-cm-h">New option</div>' + items.map(x => !x ? '<hr><div class="sp-cm-h">' + esc(nm) + '</div>' : '<button type="button" role="menuitem" data-o="' + x.id + '"' + (x.danger ? ' class="sp-cm-danger"' : '') + (x.off ? ' aria-disabled="true"' : '') + '><span><b>' + esc(x.label) + '</b><em>' + esc(x.off || x.sub) + '</em></span></button>').join('');
    cm.setAttribute('aria-label', 'Options'); cm.classList.add('sp-cm-opt');
    cm.querySelectorAll('[data-o]').forEach(x => { x.onclick = () => { if (x.getAttribute('aria-disabled')) return; const id = x.dataset.o; closeMenu(); if (id === 'blank') newBlank(); else if (id === 'copy') copyOption(); else if (id === 'clear') clearOption(); else delOpen(); }; });
    cmFor = b; cmBack = b; cmFt = null; cmEl = null; b.setAttribute('aria-expanded', 'true');
    cm.hidden = false; const a = b.getBoundingClientRect(), w = cm.offsetWidth, h = cm.offsetHeight, nav = document.getElementById('mnav')?.getBoundingClientRect(); // under the button, else over it; never off the screen or over the phone's tab bar
    const floor = (nav?.height && nav.top > innerHeight / 2 ? nav.top : innerHeight) - 8;
    let x = Math.max(8, Math.min(a.left, innerWidth - w - 8)), y = a.bottom + 4; if (y + h > floor) y = a.top - h - 4 >= 8 ? a.top - h - 4 : Math.max(8, floor - h);
    Object.assign(cm.style, { left: Math.round(x) + 'px', top: Math.round(y) + 'px' });
    cm.querySelector('[data-o]:not([aria-disabled])')?.focus({ preventScroll: true }); // Blank site: Enter takes the default
  }
  // anything to clear: pieces other than easements, or a build's layouts, recipe or zones
  const designed = pl => SP.hasDesign(pl) || !!(pl.lastRun || pl.recipe || pl.variant || pl.zones?.length || ed?.variants?.length);
  // the timers that would act on the option after it's cleared or put back: a re-fit after an edit, new layouts after a setting, the money
  function stopPending() { clearTimeout(refitTimer); clearTimeout(autoT); autoSeq++; clearTimeout(solveTimer); solveMark = null; solveLabel = ''; clearTimeout(finT); }
  // the editor's memory of the option's last build (its layouts, the request, the AI's note and ideas, a change under way): gone
  const RUN_STATE = ['variants', 'aiNote', 'aiSummary', 'sortBy', 'ask', 'runMeta', 'ideas', 'readAs', 'aiPick', 'reviewCleared', 'pickedByUser', 'reviewing', 'solveBar', 'solveLater', 'refitNote', 'chg', 'chgNote', 'chgDone', 'confirm', 'runSrc', 'nudged', 'shape', 'flash', 'refitting', 'updBusy', 'shownSel', 'ovOpen'];
  function freshRun() { for (const k of RUN_STATE) delete ed[k]; ed.variants = null; ed.sel = null; ed.multi = []; ed.editing = false; ed.buildOpen = true; }
  // the Build box ready for a request: focused on a computer; on a phone in view (the keyboard comes up only when it's tapped)
  function readyBuild() {
    const sec = card.querySelector('#spAiSec'), ta = card.querySelector('#spAsk'); if (!sec) return;
    if (phone()) { if (!card.classList.contains('half') && !card.classList.contains('full')) { card.classList.remove('min'); card.classList.add('half'); } requestAnimationFrame(() => jump('spAiSec')); return; } // (as its chip does: clear of the header; the map fits the site again once the sheet is up)
    if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) {} } sec.scrollIntoView({ block: 'nearest' });
  }
  function newBlank() {
    const p = P(), pl = PL(); if (!p || !pl || ed.draftPlan) return; if (ed.run) { ctx.toast(WAIT + '.'); return; }
    if (pl.ring.length < 3) { addOption(p); return; } // no site drawn on this one yet: the project's site (its newest drawn option's, else its parcels'), or draw one
    const c = SP.blankOf(pl, { id: uid(), name: nextName(p) }); p.plans.push(c); save(p); openReady(p, c, pl.name);
  }
  function openReady(p, c, from) { open(p.id, c.id); readyBuild(); if (from) ctx.toast(c.name + ': the same site as ' + from + ', nothing laid out yet. Say what to build.'); }
  function copyOption() { // the copy keeps the layouts, not the request in the Build box, nor the renderings (the pictures are the original's)
    const p = P(), pl = PL(); if (!p || !pl || ed.draftPlan || pl.ring.length < 3) return; if (ed.run) { ctx.toast(WAIT + '.'); return; }
    const c = { ...clone(pl), id: uid(), name: nextName(p), created: new Date().toISOString() }; delete c.renders; if (c.lastRun) c.lastRun = { ...c.lastRun, ask: '' };
    p.plans.push(c); save(p); open(p.id, c.id); ctx.toast('Copied ' + pl.name + ' as ' + c.name + '.');
  }
  function clearOption() {
    const p = P(), pl = PL(); if (!p || !pl || ed.draftPlan) return; if (ed.run) { ctx.toast(WAIT + '.'); return; }
    if (!designed(pl)) { ctx.toast('Nothing is laid out on ' + pl.name + ' yet.'); readyBuild(); return; }
    stopPending(); const step = { _full: SP.undoState(pl) }; ed.undo.push(step); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = [];
    SP.clearDesign(pl); freshRun(); save(p); draw(); panel(); readyBuild();
    ctx.toast('Cleared ' + pl.name + '.', { ms: 10000, action: { label: 'Undo', run: () => { if (ed && PL() === pl && ed.undo[ed.undo.length - 1] === step) undo(true); } } }); // (longer than most: it's the way back, with no question first)
  }
  // ----- deleting an option (New Option's menu, Delete This Option at the foot of the panel, Delete on the project page):
  // no question first. The message's Undo (8 seconds) puts it back exactly where it was; its pictures on this device go
  // only once Undo can't happen any more (or the page is closed). From the editor the next option opens, or after the last
  // one the project page, where New Option starts again from the same site (p.keptSite).
  const delPending = new Map(); // option id → { t (the timer), keys (its pictures) }
  const dropImages = keys => { for (const k of keys) rdel(k); };
  function flushDeletes() { for (const d of delPending.values()) { clearTimeout(d.t); dropImages(d.keys); } delPending.clear(); }
  window.addEventListener('pagehide', flushDeletes);
  function delOpen() { const p = P(), pl = PL(); if (!p || !pl || ed.draftPlan) return; if (ed.run) { ctx.toast(WAIT + '.'); return; } deleteOption(p, pl); }
  function deleteOption(p, pl) {
    if (ed?.run && ed.pid === p.id) { ctx.toast(WAIT + '.'); return; }
    const wasOpen = ed?.pid === p.id && ed.plid === pl.id, r = PJ.removeOption(p, pl.id); if (!r) return;
    if (pl.ring.length >= 3 && !p.plans.some(x => x.ring.length >= 3)) p.keptSite = SP.blankOf(pl, {}); // the site, for the next New Option
    if (away?.plid === pl.id) hideAway(); if (resume?.plid === pl.id) clearResume(); // the "Editing … · Return to plan" banner would lead nowhere
    save(p);
    if (wasOpen) { if (r.next) open(p.id, r.next.id); else { ctx.closeCard(); cur = p.id; ptab.set(p.id, 'options'); ctx.setView('projects'); show(p.id, 'options'); } }
    const d = { t: setTimeout(() => { delPending.delete(pl.id); dropImages(r.keys); }, 12000), keys: r.keys }; delPending.set(pl.id, d); // (well after the message has gone)
    ctx.toast('Deleted ' + pl.name + ' from ' + p.name + (shared === true ? ' (for the team too)' : '') + '.', { ms: 8000, action: { label: 'Undo', run: () => undoDelete(p.id, r, wasOpen) } });
  }
  function undoDelete(pid, r, reopen) {
    const p = db.projects.find(x => x.id === pid), d = delPending.get(r.plan.id); if (!p) { ctx.toast('The project has gone, so ' + r.plan.name + ' can’t come back.'); return; }
    if (d) { clearTimeout(d.t); delPending.delete(r.plan.id); }
    if (!PJ.restoreOption(p, r.plan, r.index)) return; save(p);
    if (reopen) open(p.id, r.plan.id); ctx.toast(r.plan.name + ' is back.');
  }
  // Copy (⌘C, or the menu): the piece or the set, with what's attached, kept for Paste; Paste puts copies centred where
  // you right-clicked (⌘V: the middle of the view), settled in the nearest clear spot, picked. One undo step.
  function copySel() { const pl = PL(), ids = sels(); if (!pl || !ids.length) return; if (ownPiece(pl, ids)) return; clip = clone(T.withAttached(pl, ids)); const lead = pl.elements.find(e => e.id === ids[0]);
    ctx.toast('Copied ' + (ids.length > 1 ? plural(ids.length, 'piece') : ED.labelOf(lead)) + ' · right-click open ground to paste it there (' + MOD + 'V pastes in the middle of the view).'); }
  function pasteAt(ft) {
    const pl = PL(); if (!pl || !clip?.length) return; ensureEdit(); const at = ft || addAt(pl).at, copies = T.copiesAt(clip, at, uid), lead = copies.find(c => ['building', 'garage'].includes(c.kind)) || copies[0];
    let how = 'clear'; change(x => { how = placeClear(x, lead, copies.filter(c => c !== lead)); x.elements.push(...copies); for (const c of copies) makeRoom(c); });
    ed.sel = lead.id; ed.multi = copies.length > 1 ? copies.map(c => c.id) : []; ed.shape = null; draw(); panel(); noRoom(how); if (how === 'clear') autoRefit('Pasted', copies.length > 1 ? plural(copies.length, 'piece') : ED.labelOf(lead));
  }
  map.on('contextmenu', e => { if (!ed || !(PL()?.ring.length >= 3)) return; e.preventDefault(); if (ed.mode && ed.mode !== 'measure') return; openMenu(e.point, e.lngLat); }); // drawing: right-click does nothing (the generic map menu stays away too)
  { let lp = 0, at = null; // a long press on touch screens
    map.on('touchstart', e => { clearTimeout(lp); if (!ed || ed.mode || e.points.length !== 1 || !(PL()?.ring.length >= 3)) return; at = e.point; const ll = e.lngLat; lp = setTimeout(() => { if (!cm.hidden && performance.now() - lpAt < 600) return; if (drag && (drag.moved || !['move', 'set', 'box'].includes(drag.type))) return; /* a finger resting on a handle before it drags: no menu */ lpAt = performance.now(); openMenu(at, ll); }, 550); });
    map.on('touchmove', e => { if (at && Math.hypot(e.point.x - at.x, e.point.y - at.y) > 10) clearTimeout(lp); });
    map.on('touchend', () => clearTimeout(lp)); }
  document.addEventListener('pointerdown', e => { if (!cm.hidden && !cm.contains(e.target) && !cmSub.contains(e.target) && !cmFor?.contains(e.target)) closeMenu(); }, true); // (New Option's own button closes it with its click)
  for (const ev of ['movestart', 'zoomstart', 'rotatestart']) map.on(ev, e => { if (e.originalEvent) closeMenu(); }); // your own pan or zoom; not the map resizing as the panel redraws
  window.addEventListener('blur', () => closeMenu()); window.addEventListener('resize', () => closeMenu());
  ctx.planOpen = () => !!ed && ctx.view === 'map'; // the map's own right-click menu stays away while a plan is open (app.js)

  // ----- the save status in the header, beside Undo and Redo: an icon (synced with the team, saved on this device, or a
  // failed sync that's a button to retry); the words are in its tooltip and label -----
  const saveSt = { kind: 'local', at: 0 };
  const SV = { synced: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.6-1.4A4.6 4.6 0 0 0 7 18.5z"/><path d="M9.5 13.5l2 2 3.5-3.8"/>',
    local: '<rect x="4" y="5" width="16" height="10.5" rx="1.2"/><path d="M2.5 19h19"/>', failed: '<path d="M12 4 21.5 20h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".4" fill="currentColor"/>' };
  function paintSave() {
    const el = ed && card.querySelector('#spSave'); if (!el) return;
    const k = saveSt.kind === 'failed' ? 'failed' : saveSt.kind === 'synced' ? 'synced' : saveSt.at ? 'local' : '';
    const say = k === 'failed' ? 'Sync failed: saved on this device only. Retry' : k === 'synced' ? 'Synced with team ' + T.ago(Date.now() - saveSt.at) : k === 'local' ? 'Saved on this device' : '';
    if (el.dataset.k !== k) { el.dataset.k = k; const ic = k ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SV[k] + '</svg>' : '';
      el.innerHTML = k === 'failed' ? '<button type="button" class="sp-sv bad" data-retry>' + ic + '</button>' : k ? '<span class="sp-sv ' + k + '" role="img">' + ic + '</span>' : '';
      const r = el.querySelector('[data-retry]'); if (r) r.onclick = () => { saveSt.kind = 'local'; paintSave(); sync(); }; }
    const ic = el.firstElementChild; if (ic) { ic.title = say; ic.setAttribute('aria-label', say); }
  }
  setInterval(() => { if (ed && saveSt.kind === 'synced') paintSave(); }, 30000);

  // keys while a plan is open on the map. Never while typing in a field (or with a list open); a focused button keeps
  // Enter and Space. Tools: V select, E edit, A add, M measure (Shift: an area), F fit the selection (Shift: the plan),
  // G grid, ⌘D / Ctrl+D duplicate, ⌘C / ⌘V copy and paste; with Edit on, arrows nudge, R turns, Delete removes (the
  // whole set when several are picked). The menu key or Shift+F10 opens the right-click menu for the selection.
  document.addEventListener('keydown', e => {
    const pl = ed && PL(), typing = /^(TEXTAREA)$/.test(e.target.tagName) || e.target.tagName === 'INPUT' && !/^(checkbox|radio|button|range)$/.test(e.target.type) || e.target.isContentEditable;
    if (document.querySelector('.xdlg.on, .lbox')) return; // a dialog over the plan (Export, a photo) has the keys, Esc included
    if (!cm.hidden) { menuKey(e); return; } // the right-click menu has them while it's open
    if (popKind && pop.contains(e.target) && /^(Arrow|Home$|End$)/.test(e.key) && e.target.type !== 'checkbox' && e.target.type !== 'text') { if (!popNav(e)) stepFocus(pop, e); return; } // the Add tiles, Layers, Items: arrows step through, never nudge (a name being typed keeps them)
    if (pl && ctx.view === 'map' && !typing && (e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); undo(e.key.toLowerCase() === 'z' ? !e.shiftKey : false, true); return; } // undo and redo work whatever button was last clicked
    if (pl && ctx.view === 'map' && e.key === 'Escape' && card.classList.contains('sp-mode') && e.target.tagName !== 'SELECT') { escStep(e, typing); return; }
    if (!pl || ctx.view !== 'map' || typing || e.target.tagName === 'SELECT' || e.isComposing) return;
    if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return; // the button's own
    if (document.querySelector('#settingsSheet:not([hidden]), .app.sel-open, #layers.on')) return;
    const act = document.activeElement || e.target; // the focused control too: a text box keeps its keys even when the event comes from elsewhere
    if (act !== e.target && (act.tagName === 'TEXTAREA' || act.tagName === 'SELECT' || act.tagName === 'INPUT' && !/^(checkbox|radio|button|range)$/.test(act.type) || act.isContentEditable)) return;
    if (/^Arrow/.test(e.key) && (act.type === 'range' || act.closest?.('[role=radiogroup],[role=tablist]'))) return; // a slider, radio group or tab list steps with the arrows, not the piece
    const used = () => { e.preventDefault(); e.stopPropagation(); };
    const k = e.key, el = pl.elements.find(x => x.id === ed.sel), mod = e.metaKey || e.ctrlKey, set = sels();
    if (!inLayoutStage() && (mod && /^[dv]$/i.test(k) || !mod && /^[eErR]$/.test(k))) return; // the plan changes only in the Layout stage
    if (mod && k.toLowerCase() === 'd') { if (set.length) { used(); dupSel(); } return; } // nothing selected: the browser keeps its shortcut
    if (mod && k.toLowerCase() === 'c' && !e.shiftKey) { if (set.length && !String(getSelection?.() || '')) { used(); copySel(); } return; } // text picked on the page: the browser copies that
    if (mod && k.toLowerCase() === 'v' && !e.shiftKey) { if (clip && pl.ring.length >= 3) { used(); pasteAt(null); } return; }
    if (k === 'ContextMenu' || k === 'F10' && e.shiftKey && !mod) { used(); menuForSelection(); return; }
    if (mod || e.altKey) return;
    // drawing and measuring: Enter finishes, Backspace takes the last point back
    if (ed.mode === 'draw' || ed.mode === 'drawpiece' || ed.mode === 'measure') {
      if (k === 'Enter') { used(); if (ed.mode === 'draw') finishDraw(); else if (ed.mode === 'drawpiece') finishPiece(); else finishMeasure(); return; }
      if (k === 'Backspace' || k === 'Delete') { used(); const L = ed.mode === 'measure' ? ed.meas.pts : ed.draft; if (ed.mode === 'measure' && ed.meas.done) ed.meas.done = false; L.pop(); drawD(); paintMode(); if (ed.mode === 'draw') panel(); return; }
    }
    const tool = { v: 'select', V: 'select', e: 'edit', E: 'edit', a: 'add', m: 'dist', M: 'marea', f: 'fitsel', F: 'fit', g: 'grid', G: 'grid', u: 'mix', U: 'mix' }[k];
    if (tool && pl.ring.length >= 3) { used(); if (tool === 'edit' && !pl.elements.length) return; runTool(tool); return; }
    if (!el || !ed.editing) return;
    if (!set.every(id => T.editable(T.viewOf(pl), pl.elements.find(x => x.id === id)))) return; // on a hidden or locked layer
    if (k === 'Delete' || k === 'Backspace') { used(); delEls(set); return; }
    const step = e.shiftKey ? 10 : 1, a = frameAngle(pl) * Math.PI / 180, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
    if (mv) { used(); const dx = step * (mv[0] * Math.cos(a) - mv[1] * Math.sin(a)), dy = step * (mv[0] * Math.sin(a) + mv[1] * Math.cos(a));
      if (set.length > 1) { change(x => { const before = clone(x.elements.filter(q => set.includes(q.id))); x.elements = T.moveSet(x, set, dx, dy).elements; ed.nudged = [...(ed.nudged || []), ...before].slice(-24); }, true); refitSoon('Moved', plural(set.length, 'piece')); return; } // the set, each with what's attached
      const pl0 = PL(), att = pl0 ? SP.attachedTo(pl0, el) : []; change(() => { ed.nudged = [...(ed.nudged || []), clone(el), ...att.map(clone)].slice(-12); for (const t of [el, ...att]) { SP.moveBy(t, dx, dy); t.pinned = true; } }, true); refitSoon('Moved', ED.labelOf(el)); return; } // what belongs to it moves too; a burst of nudges re-fits once, after the last
    if ((k === 'r' || k === 'R') && set.length === 1) { used(); turnEl(el, (T.isEntrance(el) ? 15 : 90) * (e.shiftKey ? -1 : 1)); }
  }, true);

  // Esc steps back one thing at a time and never closes the plan (× or Done does): a pop-over from the tool strip →
  // measuring → the question about replacing your edits → a tool → the selection (all of a set) → Edit Layout.
  // A pop-over that's open (Layers, a menu, Filters) closes first; in a text box, Esc just leaves the box.
  function escStep(e, typing) {
    if (document.querySelector('#layers.on, .fpop:not([hidden]), details.vmenu[open], .msheet.on, .rpop:not([hidden]), .app.sel-open, #settingsSheet:not([hidden]), .xdlg.on')) return;
    if (typing && !card.contains(e.target)) return; // the assistant's box and other fields handle their own Esc
    e.preventDefault(); e.stopPropagation();
    if (typing) { e.target.blur(); return; }
    if (popKind) { closePops(); return; }
    if (ed.mode === 'measure') { leaveMode(); return; }
    if (ed.confirm) { ed.confirm = null; panel(); return; }
    if (ed.mode === 'draw' && PL()?.ring.length < 3) { if (ed.draft.length) { ed.draft = []; draw(); panel(); } return; } // no site yet: Esc clears the corners, drawing goes on (there's nothing to go back to)
    if (ed.mode) { leaveMode(); return; }
    if (ed.shape) { ed.shape = null; draw(); panel(); return; } // shaping ends; the piece stays picked
    if (ed.sel || ed.multi?.length) { pickOne(null); draw(); panel(); return; }
    if (ed.editing) { ed.editing = false; draw(); panel(); return; } // the mode chip on the map goes away
    if (ed.mix) setMix(false); // last: the development mix view
  }

  // ---------- the panel ----------
  // building blocks: a switch (a checkbox with role=switch), a field (its label above, the unit as a suffix in the box),
  // the chevron on what folds, and an (i) button that opens a short note in place of a paragraph
  const CHEV = '<i class="sp-chev" aria-hidden="true"></i>';
  const tog = (attrs, label, on, o = {}) => '<label class="sp-toggle' + (o.cls ? ' ' + o.cls : '') + '"' + (o.tip ? ' title="' + esc(o.tip) + '"' : '') + '><input type="checkbox" role="switch" ' + attrs + (on ? ' checked' : '') + '><span class="sp-tk" aria-hidden="true"></span><span class="sp-tl">' + label + '</span></label>';
  const fld = (label, ctl, o = {}) => '<label class="sp-f' + (o.wide ? ' w2' : '') + '"' + (o.tip ? ' title="' + esc(o.tip) + '"' : '') + '><span class="sp-fl">' + label + (o.hint ? ' <small>' + o.hint + '</small>' : '') + '</span>' + ctl + '</label>'; // a hint sits with the label, so the boxes in a row line up
  const numCtl = (attrs, v, step, unit = '', ph = '') => '<span class="sp-ctl"><input type="number" inputmode="decimal" step="' + step + '" ' + attrs + ' value="' + (v ?? '') + '"' + (ph ? ' placeholder="' + ph + '"' : '') + (unit ? ' style="--u:' + (unit.length + 2) + 'ch"' : '') + '>' + (unit ? '<span class="sp-u">' + unit + '</span>' : '') + '</span>';
  const selCtl = (attrs, opts, v) => '<select ' + attrs + '>' + opts.map(([o, t]) => '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
  let infoN = 0;
  const infoBtn = (text, label = 'More about this') => { const id = 'spI' + (++infoN); return '<button type="button" class="sp-i" data-info="' + id + '" aria-expanded="false" aria-controls="' + id + '" aria-label="' + esc(label) + '" title="' + esc(text) + '"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4"/><circle cx="8" cy="4.9" r=".35" fill="currentColor"/></svg></button><span class="sp-ipop" id="' + id + '" role="note" hidden>' + esc(text) + '</span>'; };
  card.addEventListener('click', e => { const b = e.target.closest('[data-info]'); if (!b || !card.contains(b)) return; const t = card.querySelector('#' + CSS.escape(b.dataset.info)); if (!t) return; t.hidden = !t.hidden; b.setAttribute('aria-expanded', String(!t.hidden)); });
  // parking for what was asked for: the engine's Phase 1 figure (m.p1: stalls = everything provided, like m.spaces; need,
  // like m.required); a layout saved before it had one falls back to Phase 1's pieces, else the whole site
  const parkOf = (m, m1) => ({ need: m?.p1?.need ?? (m1 || m)?.required ?? 0, stalls: m?.p1?.stalls ?? (m1 || m)?.spaces ?? 0 });
  const twoPhase = (m, m1) => !!m1 || !!(m?.p1 && (m.p1.need !== m.required || m.p1.stalls !== m.spaces));
  const OK_IC = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  const BAD_IC = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><path d="M8 4.8v3.8"/><circle cx="8" cy="11.2" r=".3" fill="currentColor"/></svg>';
  // the plan's checks, and on a neighbourhood with subdivision streets the street rules it breaks (a block or cul-de-sac
  // too long, junctions too close: warnings, kept while its drives are as they were: a street bent, moved, added or
  // deleted by hand, in place or not, gets its warnings again)
  const netSig = pl => pl.elements.filter(e => e.kind === 'drive').map(e => e.id + ':' + (e.name || '') + ':' + (e.width || '') + ':' + (e.path || e.poly || [e.x, e.y, e.w, e.d, e.rot]).join(';')).join('|');
  let netMemo = null; const checkAll = pl => { const base = GC(pl), code = pl.params?.code, homes = code ? pl.elements.filter(e => e.kind === 'building' && e.use === 'sfr') : []; if (!pl.recipe?.net && !homes.length) return base; // (homes on parallel streets under a rule sheet: its checks too)
    const k = netSig(pl) + '|' + (code?.updated || '') + '|' + pl.elements.length + '|' + homes.map(h => Math.round(h.x) + ',' + Math.round(h.y)).join(';'); if (netMemo?.k !== k) { let w; try { w = pl.recipe?.net ? netRules(pl) : codeRules(pl); } catch (e) { w = []; } netMemo = { k, w }; } return base.concat(netMemo.w); }; // (a rule sheet's checks read the lots and homes too)
  // the dark summary under the header: which layout is on the map, then Phase 1 first, parking for what was asked for,
  // coverage and the money, and whether it passes. A kicker only for a real status (building) or the first step.
  function overview(pl, prog) {
    if (!SP.hasDesign(pl) && ed.run?.kind === 'build') return '<div class="kicker">Building…</div><div class="sp-ov-msg"><b>Laying out “' + esc(ed.run.ask) + '”</b><span>' + (holding(ed.run) ? 'The layouts appear once the AI has checked and rated them.' : 'The layouts appear here as soon as they’re drawn.') + '</span></div>';
    if (!SP.hasDesign(pl)) return '<div class="kicker">Step 1 of 3</div><div class="sp-ov-msg"><b>Describe what to build</b><span>Type it under Build, then Build Layouts, or <button type="button" class="sp-link sp-quiet" data-jump="spDrawSec">add pieces by hand</button>.</span></div>';
    const m = GM(pl), issues = checkAll(pl), cl = K.checkLabel(K.checksOf(issues, m), { waller: GON(pl) }), ph = pl.elements.some(e => e.phase === 2);
    const m1 = ph ? GM({ ...pl, elements: pl.elements.filter(e => e.phase !== 2) }) : null, h = K.headline(m, m1, K.askedOf(prog)), pk = parkOf(m, m1), whole = twoPhase(m, m1);
    let f = null; try { f = RUN.finOf(pfRun(P(), pl)); } catch (e) { f = null; }
    const v = pl.variant, neg = x => x != null && x < 0 ? ' class="neg"' : '', d = f ? K.moneyDigits([f.cost, f.value]) : 1, arr = v ? RUN.baseName(v.name) : 'Drawn by hand';
    const st = (k, big, sub, tip, cls = '') => '<div class="sp-ov-s' + cls + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><small>' + k + '</small><b>' + big + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</div>';
    const probs = issues.filter(i => i.level === 'bad' || /^Parking is/.test(i.text)), open = !!ed.ovOpen && cl.level !== 'ok';
    const lines = t => esc(t).split(' · ').map(x => '<span class="ln">' + x + '</span>').join('<span class="sep"> · </span>'); // "1 building · as asked": a line each in a narrow column
    // out of date (the site, street or entrances changed after it was laid out): one icon updates it with the changes,
    // the same as Re-fit Around My Changes in the bar under it; it turns while that runs
    const upd = pl.stale && pl.recipe ? '<button type="button" class="sp-ovupd" id="spOvUpd" aria-label="Update this layout with your changes" title="Update this layout with your changes"' + (ed.updBusy ? ' disabled aria-busy="true"' : '') + '>' + SYNC_IC + '</button>' : '';
    return '<div class="sp-ov-n' + (upd ? ' has-upd' : '') + '"><b>' + esc(v ? numOf(v) : pl.name) + '</b><span title="' + esc(arr) + '">' + esc(arr) + '</span>' + (v?.edited ? '<i>edited</i>' : '') + upd + '</div>' +
      '<div class="sp-ov-g' + (f ? '' : ' n3') + '">' + st(m1 ? 'Phase 1' : h.units ? 'Units' : 'Floor area', esc(h.big), h.fit ? '<em class="neg">Fits ' + esc(h.fit) + '</em>' : lines(h.sub)) +
        st(v || whole ? 'Parking (asked for)' : 'Parking', f0(pk.stalls) + ' / ' + f0(pk.need), (pk.stalls < pk.need ? '<em class="neg">' + f0(pk.need - pk.stalls) + ' short</em>' : 'spaces / needed') + (whole ? '<span class="sp-ov-ws">Whole site ' + f0(m.spaces) + ' / ' + f0(m.required) + '</span>' : ''),
          'Spaces / needed for ' + (whole ? 'Phase 1 (what was asked for); the whole site, with Phase 2, under it' : 'what was asked for'), ' pk') +
        st('Coverage', pct(m.coverage), 'FAR ' + m.far.toFixed(2)) +
        (f ? f.forSale ? st('Margin', '<span' + neg(f.margin) + '>' + K.fmtPct(f.margin) + '</span>', 'cost ' + K.fmtM(f.cost, d), 'From the Pro forma: profit margin on sales, and the total cost with land')
          : st('Yield on cost', '<span' + neg(f.yoc) + '>' + K.fmtPct(f.yoc) + '</span>', '<span' + (f.value < f.cost ? ' class="neg"' : '') + '>' + K.fmtM(f.value, d) + '</span> / ' + K.fmtM(f.cost, d), 'From the Pro forma: yield on cost' + (f.spread != null ? ' (' + K.fmtPct(f.spread) + ' spread over the market cap rate)' : '') + '; under it the stabilized value / total cost with land') : '') + '</div>' +
      (h.p2 ? '<div class="sp-ov-p2">' + esc(h.p2) + '</div>' : '') + ovRange(pl) +
      '<div class="sp-ov-a"><button type="button" class="sp-ovb sp-ck ' + cl.level + '" id="spOvCk"' + (cl.level === 'ok' ? ' aria-disabled="true" title="Inside the lot and setbacks, no overlaps, enough parking"' : ' aria-expanded="' + open + '" aria-controls="spOvProbs" title="Show what to fix"') + '>' + (cl.level === 'ok' ? OK_IC : BAD_IC) + '<span>' + esc(cl.text) + '</span>' + (cl.level === 'ok' ? '' : CHEV) + '</button>' +
        (ed.variants?.length > 1 ? '<button type="button" class="sp-ovb" data-jump="spLayouts">Compare layouts</button>' : '') + '</div>' +
      (open ? '<ul class="sp-ov-probs" id="spOvProbs">' + probs.map(i => '<li>' + (i.id ? '<button type="button" data-issue="' + esc(i.id) + '" title="Select it on the map">' + esc(i.text) + '</button>' : '<span>' + esc(i.text) + '</span>') + '</li>').join('') + '</ul>' : '');
  }
  // a Waller plan's yield as a range over the scenarios (never one precise number while inputs are unresolved)
  function ovRange(pl) {
    if (!GON(pl)) return ''; const sc = scenarios(pl) || {}, yl = ['A', 'B', 'C'].map(k => sc[k]).filter(Boolean), r = G.range(yl, 'leasableSf');
    return '<div class="sp-ov-p2 sp-ov-rg" title="Scenarios A (maximum code envelope) to C (conservative): Numbers has each">Leasable ' + esc(G.rangeText(r, ' sf')) + ' across scenarios A–C' + (sc.busy ? ' (working out the others…)' : '') + '</div>';
  }
  const SYNC_IC = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 6.4A5.4 5.4 0 0 0 3.4 4.6"/><path d="M3.1 1.9v2.9H6"/><path d="M2.8 9.6a5.4 5.4 0 0 0 9.8 1.8"/><path d="M12.9 14.1v-2.9H10"/></svg>';
  const ICO = {
    undo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 3 2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H7"/></svg>',
    redo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 3l3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H9"/></svg>',
    edit: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 13.5l.6-3L10.8 2.8a1.5 1.5 0 0 1 2.1 0l.3.3a1.5 1.5 0 0 1 0 2.1L5.5 12.9z"/><path d="M9.5 4l2.5 2.5"/></svg>',
    done: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>'
  };
  // why the layouts are out of date, in a few words for a card and a sentence for the bar
  const STALE = { site: ['site changed', 'The site changed, so these layouts were made for the old outline.'], street: ['street changed', 'The street side changed, so these layouts were made for a different frontage.'], entrance: ['entrance added', 'An entrance was added, so the other layouts don’t have it.'] };
  const staleOf = v => v?.stale ? STALE[v.stale] || STALE.site : null;
  const staleBar = pl => !pl?.stale ? '' : '<div class="sp-solvebar sp-stale" id="spStale" role="status"><b>Layouts out of date.</b> ' + (STALE[pl.stale] || STALE.site)[1] + ' The layout on the map was not replaced.<span class="btnrow">' +
    (pl.recipe ? '<button type="button" class="btn sm primary" id="spStaleRefit" title="Lay out everything else again for the new site, keeping the pieces you placed">Re-fit Around My Changes</button>' : '') +
    '<button type="button" class="btn sm" id="spStaleNew" title="New layouts for the new site; the layout on the map is replaced (Undo brings it back)">New Layouts</button></span></div>';
  // an option pill's tooltip: what it holds, from the same numbers as the Projects page
  function optTip(p, x) { const { drawn, m, m1 } = info(p, x), a = m1 || m, pk = m && parkOf(m, m1); return drawn && m?.gfa ? [(a.units ? plural(a.units, 'unit') : f0(a.gfa) + ' sq ft') + (m1 ? ' in Phase 1' : ''), f0(pk.stalls) + ' / ' + f0(pk.need) + ' parking', pct(m.coverage) + ' coverage'].join(' · ') : drawn ? 'Nothing laid out yet' : 'No site drawn yet'; }
  // the options as one row that scrolls sideways (never two rows); a long name is cut short, the whole of it in the tooltip
  const WAIT = 'Wait for the build to finish or Cancel it';
  const plansHtml = (p, pl, extra) => { const busy = !!ed?.run, list = ed?.draftPlan ? p.plans.concat(ed.draftPlan) : p.plans; // a build under way: switching options would end it
    return '<div class="sp-plans' + (extra ? ' ' + extra : '') + '" role="group" aria-label="Options">' + list.map(x => '<button type="button" class="chip" aria-pressed="' + (x.id === pl.id) + '" data-plan="' + esc(x.id) + '"' + (busy ? ' disabled title="' + WAIT + '"' : ' title="' + esc(x.name + ': ' + optTip(p, x)) + '"') + '>' + esc(x.name) + '</button>').join('') +
      '<button type="button" class="chip sp-newopt" data-newopt="1" aria-haspopup="menu" aria-expanded="false"' + (busy ? ' disabled title="' + WAIT + '"' : ed?.draftPlan ? ' disabled title="Finish drawing the site first (or Cancel)"' : ' title="Another option on this site, blank or a copy of this one; or clear this one and start over, or delete it"') + '>+ New Option</button></div>'; };
  // to a section by its chip (which opens it if it folds: Settings, Pro forma)
  function jump(id) { card.querySelector('.bnav [data-sec="' + id + '"]')?.click(); }
  // icons for the Site section's buttons and the library picker
  const SI = {
    parcels: IC('<path d="M2.5 2.5h5v5h-5zM8.5 8.5h5v5h-5z"/><path d="M8.5 2.5h5v5M2.5 8.5v5h5" stroke-dasharray="1.5 1.5"/>'), front: IC('<path d="M1.5 12.5h13"/><path d="M5 9.5l3-3 3 3M8 6.5v-4"/>'),
    street: IC('<path d="M3.5 1.5v13M3.5 12.5h11"/><path d="M7 9h4.5M7 5.5h4.5" stroke-dasharray="1.5 1.5"/>'), entr: IC('<path d="M1.5 13.5h13"/><path d="M8 13.5V4M5 7l3-3 3 3"/>'), ring: IC('<circle cx="8" cy="8" r="4.2"/><circle cx="8" cy="8" r="1.4"/><path d="M8 1.5v2.3M8 12.2v2.3M1.5 8h2.3"/>'), redraw: IC('<path d="M2.5 11.5l2-8 8 2-1.5 7.5z" stroke-dasharray="2 1.6"/><path d="M9 13.5l4.5-4.5"/>'),
    find: IC('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/>')
  };
  function panel() {
    const p = P(), pl = PL(); if (!p || !pl) return; if (cmFor) closeMenu(); // the New Option menu names this option: not over a panel drawn again
    if (guardSite(p, pl)) draw(); // the site's jurisdiction (the Waller guardrails) kept up to date on the option
    const sel = pl.elements.find(e => e.id === ed.sel), prog = SP.normalizeProgram(pl.program), noRing = pl.ring.length < 3, drawing = noRing || ed.mode === 'draw', has = pl.elements.length > 0, laid = SP.hasDesign(pl); // (easements alone are the site: nothing laid out yet)
    const parcel = p.parcels.find(x => x.key === pl.parcel), addr = parcel?.label || '', acres = noRing ? '' : (SP.ringArea(pl.ring) / 43560).toFixed(2) + ' acres';
    const selNew = !!sel && sel.id !== ed.shownSel; ed.shownSel = sel?.id || null; // a new piece picked: the card goes to the top, where Selected is
    const scroll = selNew ? 0 : card.classList.contains('sp-mode') ? card.scrollTop : 0;
    const act = document.activeElement, focusId = act && act !== card && card.contains(act) ? act.id : ''; // keep the focus across the redraw
    const sub = addr && addr.trim().toLowerCase() !== p.name.trim().toLowerCase() ? esc(addr) + (acres ? ' · ' + acres : '') : acres;
    const back = fromCard && ctx.cardChild?.() === 'open' ? '<button type="button" class="cback sp-cback" title="Back to ' + esc(fromCard) + '">' + ICO.back + '<span>' + esc(fromCard) + '</span></button>' : '';
    // one list (lib/planview.mjs): the section chips and the sections come from it, in its order, so they can't drift apart
    const HTML = {
      spDrawSite: () => '<div class="bsec sp-draw" id="spDrawSite"><div class="lt">Draw the site</div><p>Click each corner of the site on the map; click the first corner again, double-click or press Enter to finish.' + (ed.draft.length ? ' <b>' + plural(ed.draft.length, 'corner') + ' so far.</b>' : '') + '</p><div class="sp-row"><button type="button" class="btn sm primary" id="spFinish"' + (ed.draft.length < 3 ? ' disabled' : '') + '>Finish</button><button type="button" class="btn sm" id="spClearDraw">Start Over</button>' + (noRing ? '' : '<button type="button" class="btn sm ghost" id="spCancelDraw">Keep the Old Site</button>') + (ed.draftPlan ? '<button type="button" class="btn sm ghost" id="spCancelDraft" title="Throw the drawing away; no option is added">Cancel</button>' : '') + '</div></div>',
      spSel: () => '<div class="bsec" id="spSel">' + selHtml(sel, prog) + '</div>',
      spLayouts: () => '<div class="bsec" id="spLayouts">' + layoutsHead() + '<div id="spVariants">' + variantsHtml() + '</div></div>',
      spChgSec: () => '<div class="bsec sp-ai" id="spChgSec"><label class="lt" for="spChg">Change with AI</label><textarea id="spChg" rows="2" placeholder="e.g. make Building A two stories · remove Bldg 3 · all the apartments 3 stories · no 3-story homes">' + esc(ed.chg || '') + '</textarea>' +
        (sel ? '<div class="rnote">About <b>' + esc(ED.labelOf(sel)) + '</b> (selected), or name any piece as it’s labelled.</div>' : '') +
        '<div class="sp-go2"><button type="button" class="btn askai" id="spChgGo">Make Changes</button>' + (pl.recipe ? tog('id="spChgFit"', 'Re-fit the rest of the site', ed.chgFit, { tip: 'Lay the rest of the site out again around the changes; off, only those pieces change' }) : '') + '</div>' +
        chgHtml(pl) + '</div>',
      spAiSec: () => buildHtml(pl),
      spAskSec: () => askHtml(p, pl),
      spNums: () => '<div class="bsec" id="spNums"></div>',
      spPfSec: () => '<div id="spPf">' + pfHtml(p, pl) + '</div>',
      spSiteSec: () => siteHtml(p, pl),
      spDrawSec: () => '<div class="bsec" id="spDrawSec"><div class="lt">Add to the plan' + infoBtn('A piece goes in the middle of the view, clear of the rest; parking under it gives way. Edit Layout turns on so you can drag it into place.', 'About adding pieces') + '</div>' + lotHtml(pl) +
        '<div class="sp-addg">' + ADD_GROUPS.map(([g, ks]) => '<div class="sp-add-g" role="group" aria-label="' + esc(g) + '"><div class="sp-sub">' + esc(g) + '</div><div class="sp-add-r">' + ks.map(k => '<button type="button" class="sp-add" data-add="' + k + '" style="--ac:' + addAccent(k) + '" title="Add ' + esc(ADD_LABEL[k] || SP.KINDS[k]?.label || ADD_SHORT[k]) + '">' + ADD_ICON[k] + '<span>' + esc(ADD_SHORT[k]) + '</span></button>').join('') + '</div></div>').join('') + '</div>' +
        '<label class="sp-f sp-lib"><span class="sp-fl">From the building library <small>' + (BUILDING_TYPES.length + TL.list().length) + ' types</small></span><span class="sp-libw">' + SI.find + '<select id="spLib"><option value="">Pick a building type to add…</option>' + typeOptions('', teamTypes()) + '</select></span></label>' + teamHtml() + '</div>',
      spParams: () => paramsHtml(pl, prog),
      spRender: () => renderHtml(p, pl),
      spExport: () => '<div class="bsec" id="spExport"><div class="lt">Export</div><div class="sp-g2 sp-exp"><button type="button" class="btn askai" id="spPdf" title="A conceptual site plan sheet: the plan to scale with title block, site data, program and parking, parcels, notes and legend">Site Plan PDF</button>' +
        '<select id="spSheet" aria-label="Sheet size"><option value="tabloid">11 × 17 sheet</option><option value="archd">24 × 36 sheet</option></select>' +
        '<button type="button" class="btn" id="spDxf" title="Opens in AutoCAD, CADCraft, LibreCAD and most CAD programs">CAD (DXF)</button><button type="button" class="btn" id="spGeo" title="The plan as map shapes (GeoJSON)">Map File (GeoJSON)</button><button type="button" class="btn" id="spSum" title="The site and its numbers as text, for an email or a note">Copy Summary</button>' + (GON(pl) ? '<button type="button" class="btn" id="spLandCsv" title="The Waller land-use reconciliation, scenarios, unresolved risks and required plan content, with the concept label (opens in Excel)">Land Use (CSV)</button>' : '') + '</div></div>'
    };
    const stage = stageNow(), inLayout = stage === 'layout';
    HTML.spSiteSec = () => siteHtml(p, pl, stage); HTML.spWaysSec = () => waysHtml(pl); HTML.spPlanSet = () => planSetHtml(p, pl);
    const secs = planSections({ drawing, selected: !!sel, layouts: !!ed.variants || holding(ed.run), laidOut: laid, stage }).map(x => ({ ...x, html: HTML[x.id] }));
    const editBtn = has && !noRing && inLayout ? '<button type="button" class="btn sm sp-edit' + (ed.editing ? ' on' : '') + '" aria-pressed="' + !!ed.editing + '" id="spEdit" title="Move, resize and turn pieces of the plan; only the piece you move changes (E)">' + ICO.edit + '<span>' + (ed.editing ? 'Stop Editing' : 'Edit Layout') + '</span></button>' : '';
    // the header: Projects › the project (with Undo, Redo, the save status and ×), then the option's name and its address
    // with Edit Layout and Done. A long project name is cut short, the whole of it in the tooltip.
    card.innerHTML = '<div class="top sp-top"><div class="sp-head">' + back +
        '<nav class="sp-crumb" aria-label="Where you are"><button type="button" class="sp-cr" data-crumb="all">Projects</button><span aria-hidden="true">›</span><button type="button" class="sp-cr sp-crp" data-crumb="project" title="Open the project page: ' + esc(p.name) + '">' + esc(p.name) + '</button></nav>' +
        '<div class="sp-htools"><span class="sp-save" id="spSave"></span><button type="button" class="sp-ib" id="spUndo"' + (ed.undo.length ? '' : ' disabled') + ' aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)">' + ICO.undo + '</button><button type="button" class="sp-ib" id="spRedo"' + (ed.redo.length ? '' : ' disabled') + ' aria-label="Redo" title="Redo (⇧⌘Z / Ctrl+Y)">' + ICO.redo + '</button>' + xBtn() + '</div>' +
        '<div class="sp-ttl"><h2><input id="spPlanName" class="sp-title" value="' + esc(pl.name) + '" aria-label="Option name" title="' + esc(pl.name) + ' (click to rename)" maxlength="60" spellcheck="false"></h2>' + (sub ? '<div class="bsub" title="' + sub + '">' + sub + '</div>' : '') + '</div>' +
        '<div class="sp-hact">' + editBtn + '<button type="button" class="btn sm primary sp-done" id="spDone" title="Close the plan (it’s saved as you go)">' + ICO.done + '<span>Done</span></button></div></div>' +
      plansHtml(p, pl) + stagesHtml(pl, stage) + (ed.run ? runHtml(ed.run) : '') +
      ctx.cardNav(secs.map(x => [x.id, x.label])) + '</div>' +
      (noRing || !SP.hasDesign(pl) && ed.run?.kind !== 'build' ? '' : '<div class="bover" id="spOver">' + overview(pl, prog) + '</div>') + plansHtml(p, pl, 'sp-plans-ph') +
      '<div class="sp-body">' + guardBanner(pl) + confirmHtml(pl) + (inLayout ? staleBar(pl) : '') + (drawing ? '' : stageHeadHtml(p, pl, stage)) + secs.map(x => x.html()).join('') +
      (drawing ? '' : '<div class="sp-foot"><button type="button" class="btn sm ghost sp-del" id="spDelPlan">Delete This Option</button></div>') + '</div>';
    card.classList.add('open', 'sp-mode');
    const $ = q => card.querySelector(q), on = (q, fn) => { const el = $(q); if (el) el.onclick = fn; };
    card.scrollTop = scroll;
    if (selNew && phone() && !card.classList.contains('half') && !card.classList.contains('full')) { sheetQuiet = true; card.classList.remove('min'); card.classList.add('half'); } // phones: the sheet comes up to show it
    if (focusId) { const f = card.querySelector('#' + CSS.escape(focusId)); if (f && f !== document.activeElement) try { f.focus({ preventScroll: true }); } catch (e) {} }
    on('.x', closePlan); on('#spDone', closePlan); on('.sp-cback', closePlan);
    card.querySelectorAll('[data-crumb]').forEach(b => b.onclick = () => { const to = b.dataset.crumb === 'project' ? p.id : null; cur = to; ctx.setView('projects'); show(to); }); // cur first: the page change and the project are one history entry
    card.querySelectorAll('[data-reffiles]').forEach(b => b.onclick = () => { cur = p.id; ctx.setView('projects'); show(p.id, 'files'); }); // the project's reference files (its Files tab)
    { const nm = $('#spPlanName'), chips = () => card.querySelectorAll('[data-plan="' + CSS.escape(pl.id) + '"]');
      nm.oninput = () => { const v = nm.value.trim(); chips().forEach(c => { c.textContent = v || pl.name; }); }; // the option's chip says what you're typing
      nm.onchange = () => { const v = nm.value.trim(); if (!v) { nm.value = pl.name; chips().forEach(c => { c.textContent = pl.name; }); return; } change(x => { x.name = v; }); }; // the whole panel: the option buttons show the new name
      nm.onblur = () => { if (!nm.value.trim()) { nm.value = pl.name; chips().forEach(c => { c.textContent = pl.name; }); } }; // blank: the name it had comes back
      nm.onkeydown = e => { if (e.key === 'Enter') nm.blur(); }; }
    card.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { if (b.dataset.plan === pl.id) return; if (ed.run) { ctx.toast(WAIT + '.'); return; } open(p.id, b.dataset.plan); });
    card.querySelectorAll('.sp-plans').forEach(r => { const b = r.querySelector('[aria-pressed="true"]'), d = b ? b.getBoundingClientRect().right - r.getBoundingClientRect().right : 0; if (d > 0) r.scrollLeft += d + 16; }); // the open option in view in its row
    card.querySelectorAll('[data-newopt]').forEach(b => b.onclick = () => { if (ed.run) { ctx.toast(WAIT + '.'); return; } if (ed.draftPlan) return; if (optMenuFor(b)) closeMenu(true); else openOptMenu(b); });
    card.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => jump(b.dataset.jump));
    card.querySelectorAll('.bnav [data-sec]').forEach(b => b.addEventListener('click', () => { const d = card.querySelector('#' + b.dataset.sec); if (d?.tagName === 'DETAILS' && !d.open) d.open = true; }, true)); // a folded section's chip opens it (before the scroll to it)
    const wireOver = () => { on('#spOvUpd', updateNow); card.querySelectorAll('#spOver [data-issue]').forEach(b => b.onclick = () => { ed.sel = b.dataset.issue; draw(); panel(); }); const ck = card.querySelector('#spOvCk'); if (ck) ck.onclick = () => { if (ck.getAttribute('aria-disabled')) return; ed.ovOpen = !ed.ovOpen; card.querySelector('#spOver').innerHTML = overview(pl, prog); wireOver(); card.querySelector('#spOvCk')?.focus(); }; card.querySelectorAll('#spOver [data-jump]').forEach(b => b.onclick = () => jump(b.dataset.jump)); };
    wireOver();
    on('#spUndo', () => undo(true, true)); on('#spRedo', () => undo(false, true));
    on('#spFinish', finishDraw); on('#spClearDraw', () => { ed.mode = 'draw'; ed.draft = []; draw(); panel(); }); on('#spCancelDraw', () => { ed.mode = null; ed.draft = []; draw(); panel(); });
    on('#spCancelDraft', () => { const pid = ed.pid; ctx.closeCard(); ctx.setView('projects'); show(pid); ctx.toast('Drawing cancelled: nothing was added.'); });
    wireStages(p, pl, stage);
    if (drawing) { nums(); lockRun(); paintMode(); paintSave(); spyWatch(); return; }
    wireBuild(pl); wireAsk();
    const chg = $('#spChg'); if (chg) { chg.oninput = e => { ed.chg = e.target.value; }; chg.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aiChange(); }; }
    on('#spChgGo', aiChange); const cf = $('#spChgFit'); if (cf) cf.onchange = () => { ed.chgFit = cf.checked; }; wireChg();
    wireVariants();
    on('#spStaleRefit', () => refitNow(true)); on('#spStaleNew', () => resolve({ force: true, src: '#spStaleNew' }));
    on('#spLot', startLot);
    card.querySelectorAll('[data-add]').forEach(b => { b.onclick = () => { ed.editing = true; addEl(b.dataset.add); }; dragToAdd(b, b.dataset.add); }); // adding a piece is editing
    const lib = $('#spLib'); if (lib) lib.onchange = () => { const t = anyType(lib.value); if (t) { ed.editing = true; addType(t); } }; wireTeam();
    on('#spEdit', () => { ed.editing = !ed.editing; draw(); panel(); });
    on('#spFront', () => { ed.mode = ed.mode === 'front' ? null : 'front'; panel(); });
    on('#spStreet', () => { ed.mode = ed.mode === 'street' ? null : 'street'; panel(); });
    on('#spEntr', () => { ed.mode = ed.mode === 'entrance' ? null : 'entrance'; panel(); }); on('#spRing', () => { ed.mode = ed.mode === 'roundabout' ? null : 'roundabout'; if (ed.mode) ed.editing = true; draw(); panel(); }); // the pill on the map says what to do
    on('#spRedraw', () => { ed.mode = 'draw'; ed.draft = []; ed.sel = null; draw(); panel(); });
    on('#spParcels', () => { ed.mode = ed.mode === 'parcels' ? null : 'parcels'; ed.sel = null; draw(); panel(); });
    card.querySelectorAll('[data-rmp]').forEach(b => b.onclick = () => { const keys = (pl.parcels || []).filter(k => k !== b.dataset.rmp); if (keys.length) setParcels(keys); });
    wireParams(pl); wireRules(); wirePf(p, pl);
    wireSel(sel);
    on('#spPdf', () => exportPdf(p, pl, card.querySelector('#spSheet').value));
    wireRender(p, pl);
    on('#spDxf', () => ctx.saveFile(fileName(p, pl) + '.dxf', SP.toDXF(G.effective(pl), p.name + ' - ' + pl.name + (GON(pl) ? '. ' + G.LABEL : '')), 'application/dxf'));
    on('#spGeo', () => ctx.saveFile(fileName(p, pl) + '.geojson', JSON.stringify(geojson(p, pl), null, 1), 'application/geo+json'));
    on('#spLandCsv', () => ctx.saveFile(fileName(p, pl) + '-land-use.csv', G.csv(pl, scenYields(pl)), 'text/csv'));
    on('#spSum', async () => { const s = summary(p, pl); try { await navigator.clipboard.writeText(s); ctx.toast('Summary copied.'); } catch (e) { prompt('Copy the summary', s); } });
    card.querySelectorAll('details.bsec').forEach(d => d.addEventListener('toggle', tailRoom));
    on('#spDelPlan', delOpen);
    nums(); tailRoom(); lockRun(); paintMode(); wireConfirm(); paintSave(); requestAnimationFrame(spyWatch);
  }
  // ----- the stages (lib/planstages.mjs): Site › Layout › Pro forma › Renderings & plans, each confirmed before the next -----
  // A bar of four steps under the option chips; the panel shows only the open stage's sections, with the stage's name, what
  // it's for and its Confirm button at the top. The stage is kept for this visit (ed.stage); an option opens at its first
  // stage not confirmed. The plan can be changed only in Layout: Edit Layout, Add, the right-click menu and the
  // shortcuts that change pieces are off in the other stages.
  function stageNow() { const pl = PL(); if (!ed || !pl) return 'site'; const s = ed.stage && STG.reachable(pl, ed.stage) ? ed.stage : STG.current(pl); return s; }
  const inLayoutStage = () => stageNow() === 'layout';
  const stageWhen = c => c.at ? new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (c.by ? ' by ' + c.by : '') : '';
  function stagesHtml(pl, stage) {
    const st = STG.status(pl);
    return '<nav class="sp-stages" aria-label="Stages">' + STG.STAGES.map(x => { const c = st[x.id], on = x.id === stage, lock = c.state === 'locked';
      const tip = lock ? 'Confirm the ' + STG.STAGES[x.n - 2].label.toLowerCase() + ' first' : c.state === 'done' ? 'Confirmed' + (stageWhen(c) ? ' ' + stageWhen(c) : '') : c.state === 'stale' ? 'Changed since it was confirmed: confirm it again' : x.about;
      return '<button type="button" class="sp-stg ' + c.state + (on ? ' on' : '') + '" data-stage="' + x.id + '"' + (on ? ' aria-current="step"' : '') + (lock ? ' aria-disabled="true"' : '') + ' title="' + esc(tip) + '">' +
        '<span class="sp-stn" aria-hidden="true">' + (c.state === 'done' && x.id !== 'deliver' ? '✓' : x.n) + '</span><span class="sp-stl">' + esc(x.label) + '</span></button>'; }).join('') + '</nav>';
  }
  function stageHeadHtml(p, pl, stage) {
    const S0 = STG.stageById(stage), c = STG.status(pl)[stage], next = STG.STAGES[S0.n];
    let pfOk = true; if (stage === 'proforma') { try { pfOk = !!pfRun(p, pl); } catch (e) { pfOk = false; } }
    const why = STG.blocker(pl, stage, { pfOk }), say = c.state === 'done' ? 'Confirmed' + (stageWhen(c) ? ' ' + esc(stageWhen(c)) : c.implied ? ' (laid out before stages)' : '') : c.state === 'stale' ? 'Changed since it was confirmed' : '';
    const act = stage === 'deliver' ? '' : c.state === 'done'
      ? '<button type="button" class="btn sm primary" id="spStageNext">Go to ' + esc(next.label) + ' ›</button><button type="button" class="btn sm ghost" id="spStageReopen" title="Take the confirmation back to change the ' + esc(S0.label.toLowerCase()) + '">Reopen</button>'
      : '<button type="button" class="btn sm primary" id="spStageOk"' + (why ? ' disabled title="' + esc(why) + '"' : ' title="Confirm the ' + esc(S0.label.toLowerCase()) + ' and go on to ' + esc(next.label.toLowerCase()) + '"') + '>' + esc(S0.confirm) + ' ›</button>';
    return '<div class="sp-stagehd" id="spStageHd"><div class="sp-sth-t"><span class="sp-sth-n">Step ' + S0.n + ' of 4</span><b>' + esc(S0.label) + '</b>' + (say ? '<span class="sp-sth-s ' + c.state + '">' + say + '</span>' : '') + '</div>' +
      '<p class="rnote">' + esc(S0.about) + (why && c.state !== 'done' ? ' <b>' + esc(why) + '</b>' : '') + (stage === 'site' && pl.frontGuess && c.state !== 'done' ? ' <b>The street side is a guess: set it with Street Side before confirming.</b>' : '') + '</p>' +
      (act ? '<div class="sp-row">' + act + '</div>' : '') + '</div>';
  }
  function goStage(id) {
    const pl = PL(); if (!pl) return; if (!STG.reachable(pl, id)) { const S0 = STG.stageById(id); ctx.toast('Confirm the ' + STG.STAGES[S0.n - 2].label.toLowerCase() + ' first.'); return; }
    if (ed.run && id !== 'layout') { ctx.toast(WAIT + '.'); return; }
    ed.stage = id; if (id !== 'layout') { if (ed.mode && ed.mode !== 'draw') leaveMode(); ed.editing = false; ed.shape = null; ed.sel = null; ed.multi = []; closePops(); }
    if (id !== 'site' && ['front', 'street', 'parcels'].includes(ed.mode)) ed.mode = null;
    card.scrollTop = 0; draw(); panel(); paintTools();
  }
  function wireStages(p, pl, stage) {
    card.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => { if (b.dataset.stage !== stage) goStage(b.dataset.stage); });
    const $ = q => card.querySelector(q), next = STG.STAGES[STG.stageById(stage).n]?.id;
    if ($('#spStageOk')) $('#spStageOk').onclick = () => {
      const was = stage; change(x => { STG.confirm(x, was, { by: get(NAME_KEY) }); });
      ctx.toast(STG.stageById(was).label + ' confirmed.' + (was === 'site' && !SP.hasDesign(PL()) ? ' Start from the blank site: add buildings, start it as a parking lot, or have the AI lay it out.' : ''));
      goStage(next);
    };
    if ($('#spStageNext')) $('#spStageNext').onclick = () => goStage(next);
    if ($('#spStageReopen')) $('#spStageReopen').onclick = () => { change(x => { STG.reopen(x, stage); }); ctx.toast(STG.stageById(stage).label + ' reopened: confirm it again when it’s ready.'); };
    on2('#spMakeSet', () => { const s0 = psState(p); s0.plid = pl.id; cur = p.id; ctx.setView('projects'); show(p.id, 'plans'); });
  }
  const on2 = (q, fn) => { const el = card.querySelector(q); if (el) el.onclick = fn; };
  // Layout › Ways in: the driveways in from the street and roundabouts (they were with the site's tools)
  function waysHtml(pl) {
    const b = (id, ic, label, tip, pressed) => '<button type="button" class="btn sp-stb" id="' + id + '" aria-pressed="' + pressed + '" title="' + esc(tip) + '">' + SI[ic] + '<span>' + label + '</span></button>';
    return '<div class="bsec" id="spWaysSec"><div class="lt">Ways in</div><div class="sp-g2">' +
      b('spEntr', 'entr', 'Add Entrance', 'A driveway in from the street: click the lot line where it should come in; it runs straight in to the nearest drive', ed.mode === 'entrance') +
      b('spRing', 'ring', 'Add Roundabout', 'A ring with a planted island where streets meet: click a junction (the small circles); the streets are cut back to it and the homes in its way make way', ed.mode === 'roundabout') + '</div></div>';
  }
  // Renderings & plans › Plan set: made on the project page from a confirmed option
  function planSetHtml(p, pl) {
    const n = (pl.sets || []).length;
    return '<div class="bsec" id="spPlanSet"><div class="lt">Plan set</div><p class="rnote">A full schematic design set from this option on the Finishes Solutions title block: site and civil, landscape, floor plans, elevations, sections, structural, MEP, life safety and the renderings.' + (n ? ' This option has ' + plural(n, 'issue') + ' so far.' : '') + '</p>' +
      '<div class="sp-row"><button type="button" class="btn askai" id="spMakeSet">Make a Plan Set ›</button></div></div>';
  }
  // Layout › Add: on a site with nothing laid out, Start as a Parking Lot (lib/planstages.mjs parkingLot): rows over the
  // paved part of the site and a drive round them; buildings added after cut the stalls under them
  function lotHtml(pl) {
    if (pl.elements.some(e => e.kind === 'parking' || e.kind === 'building')) return '';
    return '<div class="sp-lot"><button type="button" class="btn sm" id="spLot" title="Fill the site inside its paving setbacks with parking rows and a drive; then add buildings and the stalls under them give way">' + ADD_ICON.parking + '<span>Start as a Parking Lot</span></button><span class="rnote">then drop buildings in: the stalls under them give way</span></div>';
  }
  function startLot() {
    const pl = PL(); if (!pl || !inLayoutStage()) return; const r = STG.parkingLot(pl, { newId: uid }); if (r.error) { ctx.toast(r.error); return; }
    change(x => { x.elements.push(...r.elements); }); ed.editing = true; ed.sel = null; draw(); panel();
    ctx.toast('Parking lot: ' + plural(GM(PL()).spaces, 'space') + '. Add a building and the stalls under it give way.', { action: { label: 'Undo', run: () => { if (ed) undo(true); } } });
  }
  // A layout you've changed is never replaced without asking (Build Layouts, Use this layout, New layouts from these
  // settings): the question sits at the top of the panel, with Replace my edits, Save my edits as a new option first
  // (then replace), or Cancel. Replacing is one undo step, as always.
  function askReplace(go) {
    const pl = PL(); if (!pl || !pl.elements.length || !dirty(pl)) { go(); return; }
    ed.confirm = { go }; panel(); const el = card.querySelector('#spConfirm'), top = card.querySelector(':scope>.top'); if (!el) return;
    const d = el.getBoundingClientRect().top - (top ? top.getBoundingClientRect().bottom : card.getBoundingClientRect().top) - 8; if (d < 0 || d > card.clientHeight * 0.5) card.scrollTop += d; // just under the header
    el.querySelector('button')?.focus({ preventScroll: true });
  }
  function confirmHtml(pl) {
    if (!ed.confirm) return ''; const what = pl.variant ? numOf(pl.variant) : pl.name;
    return '<div class="sp-confirm" id="spConfirm" role="alertdialog" aria-labelledby="spConfirmT" aria-describedby="spConfirmD"><p><b id="spConfirmT">Your edits to ' + esc(what) + ' will be replaced.</b> <span id="spConfirmD">Undo brings them back.</span></p>' +
      '<div class="btnrow"><button type="button" class="btn sm primary" data-cf="go">Replace my edits</button><button type="button" class="btn sm" data-cf="keep">Save my edits as a new option first</button><button type="button" class="btn sm ghost" data-cf="x">Cancel</button></div></div>';
  }
  function wireConfirm() {
    card.querySelectorAll('[data-cf]').forEach(b => b.onclick = () => { const c = ed.confirm; ed.confirm = null; if (b.dataset.cf === 'x' || !c) { panel(); return; }
      if (b.dataset.cf === 'keep') keepEdits(); panel(); c.go(); });
  }
  // the option as it is now, kept as a new option in the project (this one goes on to be replaced)
  function keepEdits() {
    const p = P(), pl = PL(); if (!p || !pl) return; const now = new Date().toISOString(), c = { ...clone(pl), id: uid(), name: nextName(p) + ' · my edits', created: now, updated: now };
    p.plans.push(c); save(p); ctx.toast('Your edits are kept as ' + c.name + '.', { action: { label: 'Open ' + c.name.split(' · ')[0], run: () => { if (db.projects.some(x => x.id === p.id)) open(p.id, c.id); } } });
  }
  // Build: the request box with suggestions sized to this site, how hard the AI works (Low, Medium, High, Ultra: lib/planask.mjs
  // EFFORTS, with a line saying what the picked one does), then Build Layouts.
  // Phase 2 is set under Settings; a note here says which way and goes there. A suggestion only fills the box; Enter or
  // Build Layouts runs it. Once there are layouts it folds to the request with Edit request and New request; the chevron
  // opens or folds it.
  // one line under Build: how many facts from the project's reference files the AI uses, and the way to them
  function refNote() {
    const p = P(), n = SF.confirmed(p), k = (p?.files || []).length, go = t => ' <button type="button" class="lnk" data-reffiles="1">' + t + '</button>';
    return '<div class="rnote sp-refs">' + (n ? 'The AI also uses ' + plural(n, 'confirmed fact') + ' from this project’s reference files.' + go('Reference files') : k ? 'This project’s reference files have facts still to check: only confirmed ones go to the AI.' + go('Check them') : 'A survey or floor plans to go by?' + go('Add reference files') + ' for the AI to use.') + '</div>';
  }
  function buildHtml(pl) {
    const off = aiOff(), lvl = effortNow(), building = ed.run?.kind === 'build', asked = building ? ed.run.ask : ed.runMeta?.ask || '';
    const why = off ? '<div class="rnote sp-aioff" id="spAiOff">AI isn’t set up on this site</div>' : ''; // the one line that says so (no note repeating it)
    const note = ed.aiNote && !/^AI isn’t set up/.test(ed.aiNote) ? '<div class="rnote sp-ainote" id="spAiNote">' + esc(ed.aiNote) + '</div>' : '';
    const ideas = '<div id="spIdeas">' + ideasHtml() + '</div>';
    const fold = o => '<button type="button" class="sp-tgl sp-tgl-i" data-bfold="' + (o ? 1 : 0) + '" aria-expanded="' + o + '" aria-label="' + (o ? 'Fold the request box away' : 'Open the request box') + '" title="' + (o ? 'Fold the request box away (the last request stays)' : 'Open the request box') + '">' + CHEV + '</button>';
    if (!ed.buildOpen && asked && (ed.variants || building))
      return '<div class="bsec sp-ai sp-built" id="spAiSec"><div class="sp-ai-h"><div class="lt">Build with AI</div>' + fold(false) + '</div><div class="sp-built-l">' + (building ? 'Building from ' : 'Built from ') + '<q>' + esc(asked) + '</q>' + effOn(building ? ed.run.effort : ed.runMeta?.effort) + '</div>' +
        '<div class="sp-row"><button type="button" class="btn sm" data-bedit="1">Edit request</button><button type="button" class="btn sm" data-bnew="1">New request</button></div>' + readHtml(asked) + ideas + note + why + refNote() + '</div>';
    const acres = SP.ringArea(pl.ring) / 43560, sugs = RUN.presets(acres, SP.edgeLen(pl.ring, pl.front ?? SP.longestEdge(pl.ring)), { aiOff: off }), lo = RUN.leftoverOf(RUN.fillParams(pl.params, { ask: ed.ask || '' }));
    return '<div class="bsec sp-ai" id="spAiSec"><div class="sp-ai-h"><label class="lt" for="spAsk">Build with AI</label>' + (asked && ed.variants ? fold(true) : '') + '</div>' +
      '<textarea id="spAsk" rows="2" placeholder="What should go here? e.g. ' + esc(sugs[0]?.text || '25,000 sf retail strip') + '">' + esc(ed.ask || '') + '</textarea>' +
      '<div class="sp-sugs" role="group" aria-label="Suggestions for this ' + acres.toFixed(1) + '-acre site">' + sugs.map(x => '<button type="button" class="chip" data-sug="' + esc(x.text) + '" title="Put this in the box; then Build Layouts (or Enter)">' + esc(x.text) + '</button>').join('') + '</div>' +
      '<div class="sp-runopts"><span class="sp-effl" id="spEffL">AI effort</span>' +
        '<button type="button" class="sp-fillnote" data-jump="spParams" title="The land what you ask for doesn’t need gets more of the program (more homes, more shops, a bigger building) unless your request or Settings asks to hold it for later. Change it under Settings.">Leftover land <b>' + ({ fill: 'Filled', phase: 'Phase 2', hold: 'Held' })[lo] + '</b>' + CHEV + '</button></div>' +
      '<div class="sp-effort" role="radiogroup" aria-labelledby="spEffL" aria-describedby="spEffHint">' + ASK.EFFORTS.map(e => { const on = e.id === lvl, dis = off && e.id !== 'low';
        return '<button type="button" role="radio" data-eff="' + e.id + '" class="sp-eff' + (e.id === 'ultra' ? ' sp-eff-ultra' + (ed.effShine ? ' sp-shine' : '') : '') + '" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) + '"' +
          (dis ? ' disabled title="AI isn’t set up on this site"' : ' title="' + esc(e.label + ' · ' + e.time + ': ' + (off ? 'Layouts in seconds, read from your words.' : e.tip)) + '"') + '><b>' + (e.id === 'ultra' ? SPARK : '') + e.label + '</b><small>' + e.time + '</small></button>'; }).join('') + '</div>' +
      '<div class="rnote sp-effhint" id="spEffHint">' + esc(off ? 'Layouts in seconds, read from your words.' : ASK.effortOf(lvl).tip) + '</div>' +
      '<div class="bacts sp-go"><button class="btn askai" id="spGo"><span>Build Layouts</span>' + (off ? '<small>From your words (AI off)</small>' : '') + '</button><button class="btn" id="spBest"' + (off ? ' disabled title="AI isn’t set up on this site"' : ' title="The AI reads what the app knows about this site and its surroundings and suggests what to build"') + '>What Should Go Here?</button></div>' +
      why + (asked && ed.variants ? readHtml(asked) : '') + ideas + note + refNote() + '</div>';
  }
  // what the last request was read as: the program as chips, anything named in it that the program doesn't have, and Edit
  function readHtml(asked) {
    const R = ed.readAs; if (!R?.chips?.length || R.ask !== asked) return '';
    const tip = R.by === 'ai' ? 'The program the AI made from your request' : 'The program read from your words (without the AI)';
    return '<div class="sp-readas" title="' + tip + '"><span class="sp-ra-l">Read as</span>' + R.chips.map(c => '<span class="sp-rc">' + esc(c) + '</span>').join('') +
      (R.miss || []).map(m => '<span class="sp-rc miss" title="Your request names this, but the program that was laid out doesn’t have it' + (R.by === 'ai' ? '' : ' (without the AI, only sizes, counts, stories and the use are read from the words)') + '">Not understood: ' + esc(m) + '</span>').join('') +
      '<button type="button" class="btn sm ghost sp-ra-e" data-raedit="1" title="Put the request back in the box">Edit</button></div>' +
      (R.assumed?.length ? '<div class="rnote sp-assumed">Assumed: ' + R.assumed.map(esc).join(' · ') + '</div>' : '') + plannedHtml(R.plan);
  }
  // the plan the AI made before placing anything (Medium and up): its idea, what goes where, the ways in, parking, the
  // pond and the arithmetic; for Ultra the other plans it drafted and why it picked this one. Folded to one line.
  function plannedHtml(S0) {
    if (!S0?.concept && !S0?.placement?.length) return '';
    const W = { front: 'Front', middle: 'Middle', back: 'Back', 'left side': 'Left side', 'right side': 'Right side', corner: 'Corner', throughout: 'Throughout' }, li = (k, v) => v ? '<li><b>' + esc(k) + ':</b> ' + v + '</li>' : '';
    const pl = (S0.placement || []).map(q => li(W[q.where] || q.where, esc(q.what) + (q.why ? ' <span class="sp-pf-why">· ' + esc(q.why) + '</span>' : ''))).join('');
    const e = S0.entrances || {}, k = S0.parking || {}, w = S0.stormwater || {}, n = S0.numbers || {};
    const more = li('Ways in', e.count ? e.count + (e.where ? ' · ' + esc(e.where) : '') : '') + li('Parking', esc(k.approach || '') + (k.spaces ? ' (about ' + k.spaces.toLocaleString('en-US') + ' spaces)' : '')) +
      li('Stormwater', w.type ? esc(w.type) + (w.where ? ' at the ' + esc(w.where) : '') + (w.why ? ' · ' + esc(w.why) : '') : '') + li('The numbers', esc(n.check || '') + (n.fits === false ? ' <b>(tight: something has to give)</b>' : ''));
    const alts = S0.alts?.length ? '<p class="rnote">Also drafted: ' + S0.alts.map(esc).join(' · ') + (S0.why ? '. Picked this one: ' + esc(S0.why) : '') + '</p>' : '';
    const rej = S0.rejected?.length ? '<p class="rnote">Considered and set aside: ' + S0.rejected.map(esc).join(' · ') + '</p>' : '', risk = S0.risks?.length ? '<p class="rnote">To check: ' + S0.risks.map(esc).join(' · ') + '</p>' : '';
    return '<details class="sp-planned"><summary title="How the AI planned the site before anything was placed"><span class="sp-ra-l">Planned first</span> ' + esc(S0.name || 'The plan') + '</summary>' +
      (S0.concept ? '<p>' + esc(S0.concept) + '</p>' : '') + '<ul>' + pl + more + '</ul>' + alts + rej + risk + '</details>';
  }
  // a suggestion, an idea's request or the last request into the box, the caret at the end; a suggestion lights Build up
  function fillAsk(text, pulse) {
    ed.ask = text; ed.buildOpen = true; panel();
    const ta = card.querySelector('#spAsk'); if (!ta) return; ta.value = text; ta.scrollIntoView({ block: 'nearest' });
    try { ta.focus({ preventScroll: true }); ta.setSelectionRange(text.length, text.length); } catch (e) {}
    const g = card.querySelector('#spGo'); if (pulse && g) { g.classList.remove('sp-pulse'); void g.offsetWidth; g.classList.add('sp-pulse'); }
  }
  function wireBuild(pl) {
    const $ = q => card.querySelector(q), each = (q, fn) => card.querySelectorAll(q).forEach(b => b.onclick = () => fn(b));
    const ta = $('#spAsk'); if (ta) { ta.oninput = () => { ed.ask = ta.value; $('#spGo')?.classList.remove('sp-pulse'); }; ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!ed.run) build(); } }; } // Enter (or ⌘/Ctrl+Enter) builds; Shift+Enter is a new line
    each('#spGo', () => build()); each('#spBest', () => bestUse());
    each('[data-sug]', b => fillAsk(b.dataset.sug, true));
    each('[data-bedit],[data-raedit]', () => fillAsk(ed.runMeta?.ask || ed.readAs?.ask || ed.ask || ''));
    each('[data-bnew]', () => fillAsk(''));
    each('[data-bfold]', b => { ed.buildOpen = b.dataset.bfold !== '1'; panel(); card.querySelector('[data-bfold]')?.focus({ preventScroll: true }); });
    each('[data-eff]', b => pickEffort(b.dataset.eff));
    const eg = $('.sp-effort'); if (eg) eg.onkeydown = e => { // arrows step through the levels (and pick, as radio buttons do)
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key], all = [...eg.querySelectorAll('[data-eff]:not(:disabled)')]; if (!d || !all.length) return;
      e.preventDefault(); const i = all.findIndex(x => x.getAttribute('aria-checked') === 'true'); pickEffort(all[(i + d + all.length) % all.length].dataset.eff); };
    each('[data-ideas]', b => { ed.ideasOpen = b.dataset.ideas === 'open'; panel(); card.querySelector('[data-ideas]')?.focus({ preventScroll: true }); });
    each('[data-ideaedit]', b => { const it = ed.ideas?.list?.[+b.dataset.ideaedit]; if (it) fillAsk(it.request); });
    each('[data-idea]', b => { const i = +b.dataset.idea, it = ed.ideas?.list?.[i]; if (!it || ed.run) return; ed.ask = it.request; ed.ideas = { ...ed.ideas, used: i }; ed.runSrc = '[data-idea="' + i + '"]'; build(); });
  }
  // room under the last sections, so a chip near the end (Add) can still bring its section to the top of the card
  function tailRoom() {
    const f = card.querySelector('.sp-foot'), d = card.querySelector('#spDrawSec'), top = card.querySelector(':scope>.top'); if (!f || !d || !top) return;
    f.style.paddingBottom = ''; const need = d.offsetTop - top.offsetHeight - 8 + card.clientHeight - card.scrollHeight;
    if (need > 0) f.style.paddingBottom = Math.ceil(need) + 'px';
  }
  // the site: its tools as a grid of equal buttons, the parcels it's made of, and one line when something needs doing
  function siteHtml(p, pl, stage) {
    const sure = STG.status(pl).site.state === 'done'; // confirmed: the site's tools wait for Reopen
    const keys = pl.parcels || (pl.parcel ? [pl.parcel] : []), recs = keys.map(k => p.parcels.find(x => x.key === k)).filter(Boolean), on = ed.mode === 'parcels', F = SP.frame(pl.origin);
    // the parcels that make up the site: the ones whose outline lies in the site's (a parcel across a road, or with no outline, is left out)
    const rings = g => g ? (g.type === 'Polygon' ? [g.coordinates[0]] : (g.coordinates || []).map(q => q[0])) : [], near = q => pl.ring.some((a, k) => SP.segDist(q, a, pl.ring[(k + 1) % pl.ring.length]) < 8);
    const part = r => rings(r.geometry).some(rg => { const ft = rg.map(F.toFt); return SP.inRing(SP.centroid(ft), pl.ring) || ft.filter(q => SP.inRing(q, pl.ring) || near(q)).length >= ft.length / 2; });
    const why = r => !r.geometry ? 'no outline' : pl.src === 'drawn' ? 'outside the drawn site' : 'more than ' + SP.BRIDGE_FT + ' ft from the rest', used = recs.filter(r => r.geometry && part(r)), out = recs.filter(r => !used.includes(r)), noGeom = recs.filter(r => !r.geometry).length, left = out.length - noGeom;
    const head = pl.src === 'drawn' && !used.length ? ' · drawn on the map' : used.length ? ' · ' + plural(used.length, 'parcel') : '';
    const b = (id, ic, label, tip, pressed) => '<button type="button" class="btn sp-stb" id="' + id + '"' + (pressed == null ? '' : ' aria-pressed="' + pressed + '"') + ' title="' + esc(tip) + '">' + SI[ic] + '<span>' + label + '</span></button>';
    return '<div class="bsec" id="spSiteSec"><div class="lt">Site<span class="src">' + (SP.ringArea(pl.ring) / 43560).toFixed(2) + ' ac' + head + '</span></div>' +
      (sure ? '<div class="rnote sp-1l">The site is confirmed. Reopen it (above) to change its parcels, street side or outline.</div>' : '<div class="sp-g2">' + b('spParcels', 'parcels', on ? 'Done With Parcels' : 'Change Parcels', 'Click parcels on the map to add them to the site (up to ' + MAXP + ') or take them out', on) +
        b('spFront', 'front', 'Street Side', 'Then click the lot line along the street; front setbacks and drives follow it', ed.mode === 'front') + b('spStreet', 'street', 'Side Street', 'A second street along the lot (a corner lot): click its lot line to add it, or again to remove it', ed.mode === 'street') +
        (stage === 'site' ? '' : b('spEntr', 'entr', 'Add Entrance', 'A driveway in from the street: click the lot line where it should come in; it runs straight in to the nearest drive', ed.mode === 'entrance') + b('spRing', 'ring', 'Add Roundabout', 'A ring with a planted island where streets meet: click a junction (the small circles); the streets are cut back to it and the homes in its way make way', ed.mode === 'roundabout')) + b('spRedraw', 'redraw', 'Redraw Site', 'Draw the site’s outline again, corner by corner') + '</div>') +
      (recs.length > 1 ? '<div class="sp-parcels">' + recs.map(r => { const off = out.includes(r); return '<span class="chip' + (off ? ' sp-off' : '') + '" title="' + esc(off ? r.label + ': not part of the site (' + why(r) + ')' : r.label) + '"><span>' + esc(r.label) + (r.acres ? ' · ' + r.acres.toFixed(2) + ' ac' : '') + '</span><button type="button" class="sp-x" data-rmp="' + esc(r.key) + '" aria-label="Remove ' + esc(r.label) + ' from the site">×</button></span>'; }).join('') + '</div>' : '') +
      (pl.src !== 'drawn' && left > 0 ? '<div class="rnote sp-warn">' + (left === 1 ? 'A parcel is' : left + ' parcels are') + ' more than ' + SP.BRIDGE_FT + ' ft from the rest, so ' + (left === 1 ? 'it’s' : 'they’re') + ' left out of the site.</div>' : '') +
      (pl.src !== 'drawn' && noGeom ? '<div class="rnote sp-warn">' + noGeom + ' of the parcels ' + (noGeom === 1 ? 'has' : 'have') + ' no outline from the county and ' + (noGeom === 1 ? 'is' : 'are') + ' left out.</div>' : '') +
      (on ? '<div class="rnote sp-1l">Click parcels on the map to add or take them out.' + infoBtn('Gaps between parcels (up to ' + SP.BRIDGE_FT + ' ft) are filled in as part of the site; where the map shows a road in the gap, the road is kept as a no-build area.', 'About adding parcels') + '</div>' : '') +
      (pl.frontGuess ? '<div class="rnote sp-warn sp-1l">The street side (orange line) is a guess: set it with Street Side.</div>' : '') + '</div>';
  }
  const fileName = (p, pl) => (p.name + ' ' + pl.name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'site-plan';

  // ---------- site parameters (like TestFit's) ----------
  // New layouts from these settings and how the plan updates first, then Program, Setbacks and Parking (changed most),
  // Buildings, Stormwater, Trash, the unit or home mix and the Look: each group a small-caps row over a two-column grid of
  // fields, the label above the box and the unit inside it
  // the homes as asked (single-family, alone or in a mix): one home's size, how many floor plans, the smallest lot. The
  // engine builds the homes from that many house plans in the size range, each lot at least that big (and the place's
  // own lot rules, when stricter); empty: the stories mix decides
  function homeSpecHtml(prog, on) {
    if (!on) return ''; const hp = SP.homeProgram(prog, (prog.zones || []).find(z => z.use === 'sfr')), num = (k, label, v, step, unit, hint) => fld(label, numCtl('min="0" data-k="hs-' + k + '"', v ?? '', step, unit), { hint });
    return '<div class="sp-sub">Homes</div><div class="sp-fg">' + num('homeSfMin', 'Smallest home', hp.homeSfMin, 50, 'sf', 'e.g. 1,600') + num('homeSfMax', 'Largest home', hp.homeSfMax, 50, 'sf', 'e.g. 2,100') +
      num('floorPlans', 'Floor plans', hp.floorPlans, 1, '', 'different house plans') + num('minLotSf', 'Smallest lot', hp.minLotSf, 100, 'sf', 'e.g. 6,600') + '</div>';
  }
  function paramsHtml(pl, prog) {
    const sb = { ...SP.SETBACKS, ...(pl.setbacks || {}) }, pp = { ...PARAMS, ...(pl.params || {}), style: { ...PARAMS.style, ...(pl.params?.style || {}) } }, u = prog.use, fuelZ = prog.zones?.find(z => z.use === 'fuel');
    const sw = (k, label, on, tip, cls) => tog('data-sw="' + k + '"', label, on, { tip, cls });
    const num = (k, label, v, step, unit, o = {}) => fld(label, numCtl('min="0" data-k="' + k + '"', v, step, unit, o.ph), o);
    const pick = (k, label, v, opts) => fld(label, selCtl('data-st="' + k + '"', opts, v));
    const grp = (t, body, extra = '') => '<div class="sp-sub">' + t + extra + '</div><div class="sp-fg">' + body + '</div>';
    const mixL = prog.mix || SP.UNIT_MIX, mix = u === 'multifamily' ? '<div class="sp-sub">Unit mix</div><table class="sp-mix"><tr><th>Type</th><th>SF</th><th>%</th><th>Beds</th><th><span class="vh">Remove</span></th></tr>' + mixL.map((t, i) =>
      '<tr><td><input data-mix="' + i + ':name" value="' + esc(t.name) + '" aria-label="Unit type name"></td><td><input type="number" min="250" step="10" data-mix="' + i + ':sf" value="' + t.sf + '" aria-label="' + esc(t.name) + ' square feet"></td><td><input type="number" min="0" max="100" step="1" data-mix="' + i + ':pct" value="' + t.pct + '" aria-label="' + esc(t.name) + ' share (%)"></td><td><input type="number" min="0" max="6" step="1" data-mix="' + i + ':beds" value="' + (t.beds ?? 1) + '" aria-label="' + esc(t.name) + ' bedrooms"></td><td><button type="button" class="sp-x" data-mixdel="' + i + '" title="Remove" aria-label="Remove this unit type">×</button></td></tr>').join('') +
      '</table><div class="sp-mix-f"><span class="rnote">Average ' + f0(prog.unitSf) + ' sf · ' + mixL.reduce((s, t) => s + +t.pct, 0) + '%</span><button type="button" class="btn sm ghost" id="spMixAdd">+ Add a Type</button></div>' : '';
    const homes = u === 'sfr' ? grp('Home mix', [1, 2, 3].map(n => { const t = (prog.homeMix || SP.HOME_MIX).find(h => h.stories === n), T = SP.HOME_TYPES[n];
      return fld(n + '-story homes', numCtl('min="0" max="100" data-home="' + n + '"', t?.pct ?? 0, 5, '%'), { hint: f0(T.sf) + ' sf · ' + T.lotW + ' ft lot' }); }).join('') + num('lotD', 'Lot depth', prog.lotD, 5, 'ft')) : '';
    // only the settings the plan's uses (its zones too) read: the building shape for shops, offices and apartments, the
    // apartment bars' depth, length and spacing for apartments, curving streets for single-family homes
    const uses = SP.usesOf(prog), has = list => list.some(x => uses.includes(x)), only = { sfr: uses.length === 1 && uses[0] === 'sfr' };
    const bldg = (has(SP.FORM_USES) ? pick('form', 'Building shape', pp.form || 'bar', FORMS.map(([k, t]) => [k, t + (k === 'U' ? ' (apartments, offices)' : k === 'tower' ? ' (4+ floors)' : '')])) : '') + (has(['sfr']) ? pick('streets', 'Neighbourhood streets', pp.streets || 'curved', [['curved', 'Like a subdivision, and gentle curves (best first)'], ['network', 'Like a subdivision: loops and cul-de-sacs'], ['wave', 'Parallel, gently curving'], ['straight', 'Straight']]) + '<div class="sp-hint w2">Subdivision streets follow the site: a loop road one lot in from the edge or a main street, curved local streets meeting it at T’s, cul-de-sacs where land is left. They follow the place’s rule sheet (Street rules, below), else typical values (blocks up to 1,400 ft, cul-de-sacs up to 800 ft).</div>' + namesHtml(pl) : '') +
      (has(['multifamily']) ? num('pp-bldgDepth', 'Apartment depth', pp.bldgDepth, 1, 'ft') + num('pp-maxLen', 'Longest building', pp.maxLen, 10, 'ft') + num('pp-bldgGap', 'Space between', pp.bldgGap, 1, 'ft') : '');
    // names: the community's and each part's (no re-solve: they change the labels, not the layout)
    const parts = SP.partsOf({ ...pl, program: prog }, false), nmIn = (k, label, v, ph) => fld(label, '<input type="text" maxlength="60" data-nm="' + k + '" value="' + esc(v || '') + '" placeholder="' + esc(ph) + '">', { wide: true });
    const names = grp('Names', nmIn('community', 'Community name', prog.community, 'e.g. Beacon Hill') + parts.map(q => nmIn(q.i, q.word + ' name', q.name, parts.length > 1 ? q.word : 'e.g. The Reserve at Beacon Hill')).join(''), infoBtn('The community’s name goes on the map, the monument sign and the PDF sheet; each part’s name over its zone and in Numbers. Suggest Names asks the AI for names that fit the place.', 'About names')) +
      '<div class="sp-prm-a"><button type="button" class="btn sm" id="spNameAsk">Suggest Names</button></div>' + (ed.nameChoices?.length ? '<div class="sp-names" role="group" aria-label="Suggested names">' + ed.nameChoices.map((c, i) => '<button type="button" class="btn sm ghost" data-nmc="' + i + '" title="' + esc(c.why || '') + '">' + esc([c.community, ...c.parts.map(x => x.name)].filter((v, j, a) => a.indexOf(v) === j).join(' · ')) + '</button>').join('') + (ed.nameNote ? '<div class="rnote">' + esc(ed.nameNote) + '</div>' : '') + '</div>' : '');
    // the way in: a boulevard (two lanes and a planted median) for homes, apartments and mixed plans, its monument sign, and where entrances may go
    const er = SP.entryRules({ params: pp }), entry = has(['multifamily', 'townhomes', 'duplex', 'sfr']) || prog.zones ? grp('Entrance', fld('Entry', selCtl('data-ps="entry.style"', [['auto', 'Boulevard where it fits'], ['boulevard', 'Always a boulevard'], ['narrow', 'Driveway with a small median'], ['driveway', 'Plain driveway']], er.style)) +
      num('ps-entry.lane', 'Lane width', er.lane, 1, 'ft', { hint: 'each way' }) + num('ps-entry.median', 'Median', er.median, 1, 'ft') + fld('Monument sign', selCtl('data-ps="entry.sign"', [['median', 'In the median'], ['both', 'Both corners'], ['one', 'One corner'], ['none', 'None']], er.sign)) +
      num('ps-entry.corner', 'Corner clearance', er.corner, 10, 'ft') + num('ps-entry.spacing', 'Driveway spacing', er.spacing, 10, 'ft') + num('ps-entry.cross', 'First cross street', er.cross, 10, 'ft', { hint: 'in from the street' }), infoBtn('Typical starting values; the city’s or county’s rules set the real ones. Boulevard where it fits: a full boulevard unless it would cost more than 2% of the homes or floor area (the notes say what it would cost).', 'About entrances')) : '';
    // a mixed site of several uses: pods (each use its own piece and street direction) or bands from the street back; the
    // row only where pods can be laid (homes or apartments among two or more built uses, 15 acres and up, no garage,
    // warehouse, storage, fuel or food trucks)
    const mixed = prog.zones && wantPods({ ring: pl.ring, params: { ...(pl.params || {}), mixStyle: 'pods' } }, prog) ? grp('Mixed sites', pick('mixStyle', 'Layout style', pp.mixStyle || 'auto', [['auto', 'Pods and bands (best first)'], ['pods', 'Pods round a loop road'], ['bands', 'Bands from the street back']]), infoBtn('Pods give each use its own piece of the site and its own street direction, placed as the request says (retail at the corner, homes round the lake); bands stack the uses from the street back. Pods are tried on mixed sites of 40 acres or more, or when the request places a use at a corner, along a road, beside, between or round another.', 'About the layout styles')) : '';
    const look = grp('Look', sw('trees', 'Trees', pp.trees !== false, 'Trees on the plan, the map and the PDF') + pick('ponds', 'Ponds and pools', pp.style.ponds, [['organic', 'Natural curves'], ['rounded', 'Rounded rectangles'], ['square', 'Rectangles']]) +
      pick('islands', 'Parking row ends', pp.style.islands, [['rounded', 'Rounded islands'], ['square', 'Square']]) + pick('corners', 'Drive corners', pp.style.corners, [['curved', 'Curved'], ['square', 'Square']]));
    return '<details class="bsec sp-prog" id="spParams"' + (ed.progOpen ? ' open' : '') + '><summary class="lt">Site parameters</summary>' +
      '<div class="sp-prm-a"><button type="button" class="btn sm" id="spResolve"' + (pl.recipe || ed.variants ? '' : ' disabled') + ' title="Lays the layouts out again with these settings. It replaces the layout on the map, including any changes you made by hand (Undo brings them back).">New Layouts From These Settings</button></div>' +
      '<div class="sp-tgs">' + sw('auto', 'Update layouts as I change settings', ed.autoSolve !== false, 'New layouts each time a setting changes, never over a layout you’ve edited') + sw('refit', 'Re-fit the site after each edit', pl.view?.autoRefit !== false, 'After you move, resize or add a piece, the rest of the site is laid out again around it') + '</div>' +
      (ed.solveBar ? '<div class="sp-solvebar" id="spSolveBar" role="status"><b>Settings changed.</b> The layout on the map has your edits, so it wasn’t replaced.<span class="btnrow">' + (pl.recipe ? '<button type="button" class="btn sm primary" id="spRefitMine" title="Lay out everything else again with these settings, keeping the pieces you placed">Re-fit around my changes</button>' : '') + '<button type="button" class="btn sm" id="spNewLay" title="New layouts from these settings; the layout on the map, with your changes, is replaced (Undo brings it back)">New layouts (replaces your edits)</button></span></div>' : '') +
      names + guardParams(pl) +
      grp('Program', fld('Use', '<select id="spUse">' + Object.entries(SP.USES).map(([k, x]) => '<option value="' + k + '"' + (k === u ? ' selected' : '') + '>' + x.label + '</option>').join('') + '</select>') +
        (u === 'storage' ? storageFields(prog) : u === 'foodtrucks' ? foodTruckFields(prog) : u === 'fuel' ? fuelFields(prog) : u === 'multifamily' ? num('perUnit', 'Parking', prog.perUnit, 0.05, '/ unit') + num('floors', 'Floors', prog.floors, 1) + num('eff', 'Efficiency', prog.eff, 0.01, '', { hint: 'net ÷ gross' })
          : SP.USES[u]?.garage ? num('perUnit', 'Parking', prog.perUnit, 0.25, '/ home') : num('ratio', 'Parking', prog.ratio, 0.1, '/ 1k sf') + num('floors', 'Floors', prog.floors, 1) + num('depth', 'Building depth', prog.depth, 5, 'ft')) +
        (u === 'foodtrucks' || u === 'fuel' ? '' : fld('Leftover land', selCtl('data-lo="1" title="The land what you asked for doesn’t need: filled with more of the program (more homes, longer shop rows, more buildings) as one plan, the default; the same marked Phase 2; or held for later as Future development"', RUN.LEFTOVER, RUN.leftoverOf(RUN.fillParams(pl.params, { ask: ed.runMeta?.ask || pl.lastRun?.ask || '' }))))), // (a food truck park is sized by its trucks; what applies: what you set, else what your words asked, else filled)
        infoBtn('Typical suburban numbers to start with. Check the city’s or county’s rules (Houston has no zoning but has building lines and parking rules).', 'About these numbers')) +
      (u !== 'fuel' && fuelZ ? grp('Gas station', fuelFields(prog, fuelZ), infoBtn('The gas station goes on its own outparcel at the front corner (one end of the frontage on an inside lot), sized for its pumps, store and car wash; the rest of the plan is laid out behind and beside it, with a cross-access drive between them where one fits.', 'About the gas station')) : '') +
      grp('Setbacks', sw('buildOn', 'Building setbacks', sb.buildOn !== false) + sw('paveOn', 'Landscape buffer', sb.paveOn !== false) +
        [['front', 'paveFront', 'Front'], ['side', 'paveSide', 'Side'], ['rear', 'paveRear', 'Rear']].map(([k, b, l]) => num('sb-' + k, l + ' setback', sb[k], 1, 'ft') + num('sb-' + b, l + ' buffer', sb[b] ?? sb.paving, 1, 'ft')).join('')) +
      (only.sfr ? '' : grp('Parking', num('pp-stallW', 'Stall width', pp.stallW, 0.5, 'ft') + num('pp-stallD', 'Stall depth', pp.stallD, 0.5, 'ft') + num('pp-aisle', 'Drive aisle', pp.aisle, 1, 'ft'))) +
      (bldg ? grp('Buildings', bldg) : '') + entry + rulesHtml(pl, prog, has(['sfr']) || !!pl.recipe?.net) + mixed +
      stormHtml(pl, prog, pp, uses) + mix + storageMixes(prog) + homes + homeSpecHtml(prog, has(['sfr'])) + look + '</details>';
  }
  // ----- street rules by location (lib/rulesheet.mjs): the place's rule sheet, read by the AI from the codes, shared with
  // the team (src/rulesheets.js), each value with its source; Unsure values and Waller defaults standing in wait for a person
  // to confirm, and layouts can be built meanwhile (they say so). Never a compliance claim.
  const whoName = () => get(NAME_KEY) || 'someone on this device', day = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const jurOf = (p, f = factsOf(p)) => f?.county ? RSL.jurisdictionOf(f, p.rules?.etj ? { city: p.rules.etj.city, decided: p.rules.etj.decided } : null) : null;
  const sheetOf = (p, pl) => { const k = pl.params?.code?.key || p.rules?.key || jurOf(p)?.key; return k ? RS.get(k) : null; }; // the sheet the plan follows, else the one for its place
  function rulesHtml(pl, prog, full) {
    const p = P(), code = pl.params?.code, sh = sheetOf(p, pl), jur = jurOf(p), busy = !!ed.rulesBusy, rs = RS.status(), use = code ? sh && sh.key === code.key ? sh : null : null, team = !code && sh && !RSL.old(sh) ? sh : null;
    const fl = use ? RSL.flagged(use) : code?.flagged || [], who = (code?.name || jur?.name || 'This place');
    const head = code ? esc(code.name) + ' · read ' + day(use?.at || code.at) + (use?.by ? ' by ' + esc(use.by) : '') + ' · ' + (fl.length ? plural(fl.length, 'value') + ' to confirm' : 'every value read or confirmed') : 'No rule sheet: typical values' + (jur ? ' (' + esc(jur.name) + ')' : '');
    const btn = busy ? '<span class="rnote loading">Reading ' + esc(who.replace(/^City of /, '')) + '’s rules…</span><button type="button" class="btn sm ghost" id="spRulesStop">Cancel</button>'
      : aiOff() ? '<span class="rnote">AI isn’t set up on this site: Waller County’s rules can be used as defaults.</span><button type="button" class="btn sm" id="spRulesWaller">Use Waller Defaults</button>'
      : '<button type="button" class="btn sm" id="spRulesRead" title="The AI reads the subdivision rules and the drainage criteria for this place, each value with its source (a minute or two)">' + (code || sh ? 'Refresh' : 'Read the Local Rules') + '</button>';
    const notice = team ? '<div class="sp-pin"><span class="rnote">The team has a ' + esc(team.name) + ' rule sheet' + (!p.rules?.key && team.kind === 'county' ? ' (whether this site is in a city’s ETJ hasn’t been checked: Read the Local Rules does)' : '') + '.</span><button type="button" class="btn sm" id="spRulesUse">Use It</button></div>' : use && Date.parse(use.updated) > Date.parse(code.updated || 0) ? '<div class="sp-pin"><span class="rnote">The team updated these rules.</span><button type="button" class="btn sm" id="spRulesUse">Use the Update</button></div>' : '';
    const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
    const chip = (k, x) => !x ? '' : x.ok ? '<span class="sp-rchip ok">' + (x.from === 'hand' ? 'Edited' : '✓ Confirmed') + ' by ' + esc(x.ok.by || 'someone') + '</span>' : x.from === 'waller' && use.key !== RSL.WALLER.key ? '<span class="sp-rchip">Waller default</span><button type="button" class="btn sm ghost" data-rok="' + k + '">Confirm</button>' : !x.sure ? '<span class="sp-rchip">Unsure</span><button type="button" class="btn sm ghost" data-rok="' + k + '">Confirm</button>' : '';
    const ctl = (f, v) => f.choice ? '<select data-rk="' + f.k + '" aria-label="' + esc(f.label) + '">' + f.choice.map(c => '<option value="' + c + '"' + (c === v ? ' selected' : '') + '>' + RSL.valueText(f.k, c) + '</option>').join('') + '</select>' : numCtl('min="' + f.lo + '" max="' + f.hi + '" data-rk="' + f.k + '" aria-label="' + esc(f.label) + '"', v, f.unit === 'ac-ft/ac' ? 0.01 : f.unit === 'sf' ? 100 : 1, f.unit);
    const rows = use ? RSL.FIELDS.filter(f => full || f.k === 'detention').map(f => { const x = use.values[f.k]; return '<div class="sp-rrow"><span class="sp-rl">' + esc(f.label) + '</span>' + ctl(f, x?.v) + '<span class="sp-rs">' + (x?.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" title="' + esc([x.cite, x.quote && '“' + x.quote + '”'].filter(Boolean).join(' · ')) + '">' + esc(host(x.url)) + '</a>' : x?.was?.url ? '<span title="' + esc(x.was.cite || '') + '">was ' + esc(host(x.was.url)) + '</span>' : '') + chip(f.k, x) + '</span></div>'; }).join('')
      : code ? '<div class="rnote">' + esc(RSL.rulesLine(code)) + ' The sheet itself isn’t on this device yet.</div>' : '';
    const e = use?.etj, etj = use && use.kind !== 'city' && e ? '<div class="rnote">' + (e.decided === 'in' ? 'In ' + esc(e.city) + '’s ETJ' : e.decided === 'out' ? 'Not in a city’s ETJ' : 'ETJ not settled') + ' (the AI’s reading' + (e.why ? ': ' + esc(e.why) : '') + '; confirm)</div>' : '';
    const where = rs.shared ? 'Shared with your team' : rs.shared === false ? 'On this device only' : 'Saved on this device; sharing with the team…';
    return '<div class="sp-rules" id="spRules"><div class="sp-sub">Street rules' + infoBtn('The AI reads this place’s subdivision rules and drainage criteria (the city’s, the county’s, a city’s ETJ, a drainage district’s), each value with its source. Values it isn’t sure of, and Waller County defaults standing in for rules it couldn’t find, are marked for someone to confirm. The street layouts, the entries, the sidewalks and the detention follow the sheet; the checks say what a plan breaks. It is the AI’s reading of the code, not a compliance check.', 'About street rules') + '</div>' +
      '<div class="rnote sp-1l" title="' + head.replace(/<[^>]+>/g, '') + '">' + head + '</div>' + notice + '<div class="sp-prm-a">' + btn + (code && !busy ? '<button type="button" class="btn sm ghost" id="spRulesOff" title="Lay out with typical values instead of this sheet">Use Typical Values</button>' : '') + '</div>' + etj + rows +
      (use || code ? '<div class="rnote">The AI’s reading of the code, not a compliance check: confirm with the engineer and ' + (code?.kind === 'county' ? 'the county' : 'the city') + '. ' + where + '.</div>' : '') + '</div>';
  }
  function rulesRefresh() { const box = card.querySelector('#spRules'), pl = PL(); if (!box || !pl) return; const prog = SP.normalizeProgram(pl.program); box.outerHTML = rulesHtml(pl, prog, SP.usesOf(prog).includes('sfr') || !!pl.recipe?.net); wireRules(); }
  // a sheet put on the plan (its numbers: the worker has no network), laid out again with it unless the layout has hand edits
  // (a value confirmed, or the same numbers again: the plan's snapshot only, nothing laid out again)
  const codeNums = c => c ? JSON.stringify([c.key, c.streetRules, c.entry, c.storm, c.sidewalk]) : '';
  function applySheet(sh, quiet) { const pl = PL(); if (!pl || !sh) return; const c0 = pl.params?.code, c1 = RSL.codeParams(sh); change(x => { x.params = { ...(x.params || {}), code: c1 }; }); if (!quiet) ctx.toast('Street rules: ' + sh.name + (RSL.flagged(sh).length ? ' (' + plural(RSL.flagged(sh).length, 'value') + ' to confirm)' : '') + '.'); if ((pl.recipe || ed.variants) && codeNums(c0) !== codeNums(c1)) resolveSoon('Street rules'); else rulesRefresh(); }
  async function readRules(refresh) {
    const p = P(), pl = PL(); if (!p || !pl || ed.rulesBusy) return; let f = factsOf(p);
    if (!f?.county) { try { await gatherSite(p); } catch (e) { /* said below */ } f = factsOf(p) || { county: siteInfo(p, pl).county }; }
    if (!f?.county) { ctx.toast('The site’s county isn’t known yet: open the project page’s Jurisdiction box, then try again.'); return; }
    const k0 = p.rules?.key || jurOf(p, f)?.key, have = !refresh && k0 && RS.get(k0); if (have && !RSL.old(have)) { applySheet(have); return; }
    const e0 = ed, ac = new AbortController(); ed.rulesBusy = ac; rulesRefresh(); const sp = siteSpot(p);
    try {
      const d = await post({ mode: 'rules', jurisdiction: { county: f.county, city: f.place?.name || null, districts: (f.water || []).map(w => w.name + (w.type ? ' (' + w.type + ')' : '')), address: siteInfo(p, pl).address, lat: sp?.c?.[1] ?? null, lon: sp?.c?.[0] ?? null }, known: RS.list().map(x => x.key), refresh: !!refresh }, ac.signal);
      if (ed !== e0) return; const was = !d.cached && d.sheet?.key ? RS.get(d.sheet.key) : null, m = was && RSL.merge(was, d.sheet), kept = was && m === was; // (read again: the team's edits, confirmations and values read before kept; a failed read changes nothing)
      const sh = d.cached ? RS.get(d.key) : kept ? was : RS.save(m || d.sheet); if (!sh) throw new Error('no sheet');
      p.rules = { key: sh.key, etj: d.etj || sh.etj || null }; save(p); ed.rulesBusy = null; applySheet(sh);
      if (kept) ctx.toast('The AI couldn’t read the code just now, so the team’s ' + sh.name + ' sheet stays as it was.'); else if (sh.src === 'waller') ctx.toast('The local code couldn’t be found or read, so Waller County’s rules stand in (each marked for you to confirm).'); else if (was) ctx.toast('Read again: values edited or confirmed by the team, and those read before that the AI couldn’t find this time, kept.');
    } catch (e) { if (ed !== e0) return; ed.rulesBusy = null; if (e.name !== 'AbortError') ctx.toast(e.status === 503 ? 'AI isn’t set up on this site: use Waller County’s rules as defaults.' : 'Couldn’t read the rules just now: try again.'); rulesRefresh(); }
  }
  function wireRules() {
    const $ = q => card.querySelector('#spRules ' + q), p = P();
    const keep = (sh, how) => { const s2 = RS.save(sh); if (!s2) { ctx.toast('That value isn’t one the sheet takes.'); return; } if (how) ctx.toast(how); applySheet(s2, true); };
    $('#spRulesRead')?.addEventListener('click', () => readRules(!!PL()?.params?.code || !!sheetOf(P(), PL())));
    $('#spRulesStop')?.addEventListener('click', () => { ed.rulesBusy?.abort(); ed.rulesBusy = null; rulesRefresh(); });
    $('#spRulesUse')?.addEventListener('click', () => applySheet(sheetOf(P(), PL())));
    $('#spRulesOff')?.addEventListener('click', () => { change(x => { const { code, ...q } = x.params || {}; x.params = q; }); ctx.toast('Typical street rules.'); if (PL().recipe || ed.variants) resolveSoon('Typical street rules'); });
    // (the team's own sheet for the place, read or edited: kept, not replaced by the defaults)
    $('#spRulesWaller')?.addEventListener('click', () => { const pl = PL(), j = jurOf(p) || { key: RSL.WALLER.key, name: RSL.WALLER.name, kind: 'county' }, fresh = j.key === RSL.WALLER.key ? { ...RSL.WALLER, by: whoName() } : RSL.standIn({ key: j.key, name: j.name, kind: j.kind, by: whoName() }), was = RS.get(j.key), m = RSL.merge(was, fresh), sh = was && m === was ? was : RS.save(m); if (!sh) return; p.rules = { key: sh.key, etj: null }; save(p); applySheet(sh); });
    card.querySelectorAll('#spRules [data-rok]').forEach(b => b.onclick = () => { const sh = sheetOf(P(), PL()); if (sh) keep(RSL.confirm(sh, b.dataset.rok, whoName())); });
    card.querySelectorAll('#spRules [data-rk]').forEach(i => i.onchange = () => { const sh = sheetOf(P(), PL()), f = RSL.FIELDS.find(x => x.k === i.dataset.rk); if (!sh || !f) return; const v = f.choice ? i.value : +i.value, s2 = RSL.edit(sh, f.k, v, whoName()); if (!s2) { ctx.toast(f.label + ' takes ' + f.lo + '–' + f.hi + ' ' + f.unit + '.'); rulesRefresh(); return; } keep(s2, f.label + ': ' + RSL.valueText(f.k, s2.values[f.k].v) + ' (shared with the team).'); });
  }
  // a plan opened with no rule sheet when the team has one for its place: used before its first layout, else offered
  // (only once this site's place is settled: read here, so its ETJ was looked at, or inside a city; a county's sheet for a site
  // that may be in a city's ETJ is offered instead)
  function autoRules(p, pl) { if (!pl || pl.params?.code || pl.recipe || ed.variants?.length || !p.rules?.key && jurOf(p)?.kind !== 'city') return; const sh = sheetOf(p, pl); if (sh && !RSL.old(sh)) pl.params = { ...(pl.params || {}), code: RSL.codeParams(sh) }; }
  // ----- street names (lib/streetnames.mjs): off by default; on, every street named from a theme (the AI, else a plain list),
  // never two alike or like the streets nearby on the map
  const chainsMemo = pl => { const k = netSig(pl) + '#' + pl.elements.filter(e => e.kind === 'drive' && e.street).map(e => e.id + ':' + e.street).join('|'); if (ed.chMemo?.k !== k) { let c = []; try { c = pl.recipe?.net ? chainsOf(pl) : []; } catch (e) { c = []; } ed.chMemo = { k, c }; } return ed.chMemo.c; };
  function namesHtml(pl) {
    if (!pl.recipe?.net || !chainsMemo(pl).length) return ''; const on = SNm.namesOn(pl) || !!ed.namingSt, th = pl.params?.streetNames?.theme || '';
    return tog('data-snm="on"', 'Street names', on, { tip: 'Every street named, the boulevard and collectors grander (Parkway, Boulevard), the locals Lane or Way, cul-de-sacs Court or Circle', cls: 'w2' }) +
      fld('Theme', '<input type="text" maxlength="80" data-snm="theme" value="' + esc(th) + '" placeholder="e.g. golf, Texas rivers">', { wide: true }) + '<div class="sp-prm-a w2"><button type="button" class="btn sm" id="spNameSt"' + (ed.namingSt ? ' disabled' : '') + ' title="Name every street again from the theme">' + (ed.namingSt ? 'Naming…' : 'Name the Streets') + '</button></div>' +
      '<div class="sp-hint w2">Checked against the streets nearby on the map; the county’s 911 list should be checked too.</div>';
  }
  // the road names on the map within about a mile of the site (avoided: 911 refuses duplicates)
  function nearRoads(pl) {
    const s = map.getStyle()?.sources || {}, src = Object.keys(s).find(id => s[id].type === 'vector' && /maptiler|openmaptiles|planet/i.test(id + (s[id].url || ''))), F = SP.frame(pl.origin), c = SP.centroid(pl.ring), out = new Set();
    try { for (const q of src ? map.querySourceFeatures(src, { sourceLayer: 'transportation_name' }) : []) { const nm = q.properties?.name, g = q.geometry; if (!nm) continue; for (const ln of g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []) if (ln.some(ll => { const f = F.toFt(ll); return Math.hypot(f[0] - c[0], f[1] - c[1]) < 6500; })) out.add(String(nm).slice(0, 40)); } } catch (e) { /* no names in the tiles */ }
    return [...out].slice(0, 120);
  }
  // the names for a plan's streets (all: every street again but those named in hold, else the ones not named yet): the AI's
  // from the theme, else the plain list. { names: Map, count, note } or null
  async function streetNamesOf(p, pl, all, hold = []) {
    const ch = chainsMemo(pl); if (!ch.length) return null; const keep = new Map(ch.filter(c => c.name && (!all || hold.includes(c.name))).map(c => [c.key, c.name])), todo = ch.filter(c => !keep.has(c.key) && !((c.role === 'boulevard' || c.role === 'entry') && c.L < 400));
    const n0 = nearRoads(pl), avoid = pl.nearRoads = n0.length ? n0 : pl.nearRoads || [], theme = pl.params?.streetNames?.theme || ''; if (!todo.length) return { names: keep, count: 0, note: '' };
    try { if (aiOff()) throw Object.assign(new Error('AI off'), { status: 503 }); const d = await post({ mode: 'streetNames', theme, community: SP.normalizeProgram(pl.program).community || '', site: siteInfo(p, pl), streets: todo.map(c => ({ id: c.key, kind: c.role, lengthFt: c.L })), avoid, current: [...keep.values()] }); return { names: SNm.namesFor(todo, d.names || [], { avoid, keep }), count: todo.length, note: '' }; }
    catch (e) { return { names: SNm.namesFor(todo, null, { avoid, keep }), count: todo.length, note: (e.status === 503 ? 'AI isn’t set up on this site' : 'The AI didn’t answer') + ', so these are plain names.' }; }
  }
  const namedSay = (x, theme) => (x.count ? 'Named ' + plural(x.count, 'street') + (theme ? ' (' + theme + ')' : '') + '.' : 'Street names on.') + (x.note ? ' ' + x.note : '') + ' Checked against the streets nearby on the map; check the county’s 911 list too.';
  async function nameStreets(all) {
    const p = P(), pl = PL(); if (!pl || ed.namingSt) return; const e0 = ed; ed.namingSt = true; panel(); const x = await streetNamesOf(p, pl, all); if (ed !== e0) return; ed.namingSt = false; if (PL() !== pl || !x) { panel(); return; }
    change(y => { const r = SNm.applyNames(y, x.names); y.elements = r.elements; y.recipe = r.recipe; y.params = { ...(y.params || {}), streetNames: { ...(y.params?.streetNames || {}), on: true } }; });
    ctx.toast(namedSay(x, pl.params?.streetNames?.theme || ''));
  }

  // self storage's own settings: the climate-controlled building, the drive-up rows, RV / boat stalls, the fence; blank
  // sizes mean "as the site allows"
  function storageFields(prog) {
    const st = prog.storage || {}, sto = (k, label, v, step, unit, o = {}) => fld(label, numCtl('min="0" data-sto="' + k + '"', v, step, unit, o.ph), o);
    return fld('Parking', numCtl('min="0" data-k="ratio"', prog.ratio, 0.05, '/ 1k sf'), { hint: '~1 per 100 units' }) + fld('Climate floors', numCtl('min="1" max="6" data-k="floors"', prog.floors, 1)) +
      sto('climateSf', 'Climate-controlled', st.climateSf, 1000, 'sf', { ph: 'auto', hint: '0 = drive-up only' }) + sto('driveSf', 'Drive-up', st.driveSf, 1000, 'sf', { ph: 'as fits' }) +
      sto('rowD', 'Drive-up row depth', st.rowD, 5, 'ft', { hint: 'back to back' }) + sto('aisle', 'Drive aisle', st.aisle, 1, 'ft') + sto('rv', 'RV / boat spaces', st.rv, 1, '', { hint: '12 × 40 ft' }) +
      tog('data-sto="fence"', 'Fence and keypad gate', st.fence !== false, { tip: 'A security fence round the drive-up yard, from the climate building to the back, with a gate at each drive' });
  }
  // a food truck park's own settings: trucks (blank: as many as fit), the pavilion, the bar, the playground, parking a truck
  function foodTruckFields(prog) {
    const f = prog.foodtrucks || {}, ftn = (k, label, v, step, unit, o = {}) => fld(label, numCtl('min="0" data-ftp="' + k + '"', v, step, unit, o.ph), o);
    return ftn('trucks', 'Food trucks', f.trucks, 1, '', { ph: 'as fit', hint: '15 × 35 ft stalls' }) + ftn('perTruck', 'Parking', f.perTruck, 0.5, '/ truck') + ftn('pavilionSf', 'Pavilion', f.pavilionSf, 250, 'sf', { hint: '~' + f0((f.pavilionSf || 0) / SP.FOODTRUCK.seatSf) + ' seats · 0 = none' }) +
      ftn('barSf', 'Bar', f.barSf, 250, 'sf', { hint: 'with a beer garden patio' }) + fld('Bar parking', numCtl('min="0" data-k="ratio"', prog.ratio, 0.5, '/ 1k sf')) + ftn('restroomSf', 'Restrooms', f.restroomSf, 50, 'sf') +
      tog('data-ftp="bar"', 'Bar or beer garden', f.bar !== false, { tip: 'A bar building with its patio at the front of the gathering area' }) + tog('data-ftp="playground"', 'Playground', f.playground !== false, { tip: 'A playground on the lawn, away from the bar' });
  }
  // a gas station's own settings: the pumps (MPDs, two fueling positions each), the store, which street the canopy runs
  // along, a car wash, air / vacuum stalls
  // (in a mixed plan: the gas station zone's, without the parking ratio, which is the store's usual 4 per 1,000 sf)
  function fuelFields(prog, zone = null) {
    const fu = (zone ? zone.fuel : prog.fuel) || {}, fsel = (k, label, v, opts, o = {}) => fld(label, selCtl('data-fuel="' + k + '"', opts, String(v)), o);
    return fsel('pumps', 'Pumps', fu.pumps ?? SP.FUEL.pumps, SP.PUMPS.map(n => [String(n), n + ' · ' + 2 * n + ' fueling positions'])) + fld('Store', numCtl('min="1500" max="12000" data-fuel="storeSf"', fu.storeSf, 250, 'sf'), { hint: '3,000–6,000 typical' }) +
      (zone ? '' : fld('Parking', numCtl('min="0" data-k="ratio"', prog.ratio, 0.5, '/ 1k sf'), { hint: 'store only' })) + fsel('canopy', 'Canopy along', fu.canopy || 'auto', [['auto', 'Auto (the busier street)'], ['front', 'The front street'], ['side', 'The side street']], { tip: 'The canopy runs along a street, between it and the store. Auto: the front, unless only the side street fits it.' }) +
      fsel('islands', 'Pump islands', fu.islands || 'along', ISLANDS, { tip: 'Along the street: cars pull through the pumps side to side. Across the street: cars pull in toward the store, with the islands pointing at it.' }) +
      tog('data-fuel="wash"', 'Car wash', !!fu.wash, { tip: 'A car wash tunnel beside the store, with its stacking lane round the back' }) + tog('data-fuel="vac"', 'Air / vacuum stalls', fu.vac !== false, { tip: 'Three stalls with air and vacuums beside a drive lane' });
  }
  // the two storage unit mixes (by count): sizes can be added, changed or removed; the averages set the unit counts
  function storageMixes(prog) {
    if (prog.use !== 'storage') return '';
    const st = prog.storage || {}, one = (k, title, list) => '<div class="sp-sub">' + title + '</div><table class="sp-mix"><tr><th>Size</th><th>SF</th><th>%</th><th><span class="vh">Remove</span></th></tr>' + list.map((t, i) =>
      '<tr><td><input data-smix="' + k + ':' + i + ':name" value="' + esc(t.name) + '" aria-label="Unit size name"></td><td><input type="number" min="10" step="5" data-smix="' + k + ':' + i + ':sf" value="' + t.sf + '" aria-label="' + esc(t.name) + ' square feet"></td><td><input type="number" min="0" max="100" step="1" data-smix="' + k + ':' + i + ':pct" value="' + t.pct + '" aria-label="' + esc(t.name) + ' share (%)"></td><td><button type="button" class="sp-x" data-smixdel="' + k + ':' + i + '" title="Remove" aria-label="Remove this size">×</button></td></tr>').join('') +
      '</table><div class="sp-mix-f">' + (m => '<span class="rnote' + (m.warn ? ' sp-warn' : '') + '">' + esc(m.text) + '</span>')(K.mixFoot(list, k === 'drive' ? 200 : 100)) + '<button type="button" class="btn sm ghost" data-smixadd="' + k + '">+ Add a Size</button></div>';
    return one('climate', 'Climate-controlled units', st.climateMix || SP.STORAGE_MIX.climate) + one('drive', 'Drive-up units', st.driveMix || SP.STORAGE_MIX.drive);
  }
  // stormwater (detention, retention, underground or none) and trash enclosures
  function stormHtml(pl, prog, pp, uses = SP.usesOf(prog)) {
    const gOn = GON(pl), R = gOn ? G.rulesOf(pl) : null, st = { ...SP.STORM, ...(pp.code?.storm || {}), ...(pp.storm || {}) }, tr = pp.trash || {}, sn = pl.elements?.length ? SP.stormOf(G.effective(pl)) : null; // (the rule sheet's detention rate, unless set here)
    const sel = (attr, label, v, opts) => fld(label, selCtl(attr, opts, v ?? ''));
    const pnum = (k, label, v, step, unit, ph = '') => fld(label, numCtl('min="0" data-k="' + k + '"', v, step, unit, ph));
    const need = sn ? (sn.mode === 'none' ? 'No storage on site' : 'Needs about ' + sn.volume.toFixed(1) + ' ac-ft' + (sn.mode === 'underground' ? ', all in vaults under the parking' : ' · pond ' + (sn.pond / 43560).toFixed(2) + ' ac' + (sn.vault > 0.05 ? ' · ' + sn.vault.toFixed(1) + ' ac-ft more underground' : ''))) : '';
    return '<div class="sp-sub">Stormwater' + infoBtn((sn && sn.mode !== 'none' ? 'Sized for ' + sn.acres.toFixed(1) + ' developed acres. ' : '') + (gOn ? 'Waller guardrails: ' + R.det.why + ' (' + R.det.rate.toFixed(2) + ' ac-ft/ac). Acre-feet are volume: the pond’s footprint comes from it, the storage depth and side slopes (under Waller guardrails), 1 ft of freeboard, a 15 ft maintenance bench and an allowance for the outfall structure. A higher Storage here (a drainage study) wins.' : ((pp.code?.storm ? 'Storage follows the ' + pp.code.name + ' rule sheet (Settings › Street rules) unless set here. ' : 'Storage: Waller County’s default (0.55 ac-ft/ac until its rate is read) unless a rule sheet or this box says otherwise. ') + 'The county’s or city’s drainage rules set the real number.')), 'About stormwater') + '</div><div class="sp-fg">' +
        sel('data-pr="storm"', 'Method', prog.storm, [['', 'Detention pond'], ['retention', 'Retention (wet) pond'], ['underground', 'Underground vaults'], ['none', 'None (regional)']]) +
        (gOn ? fld('Storage', numCtl('min="0" data-k="ps-storm.rate"', pp.storm?.rate ?? '', 0.05, 'ac-ft/ac', R.det.rate.toFixed(2)), { hint: 'at least ' + R.det.rate.toFixed(2) }) + '</div>'
          : pnum('ps-storm.rate', 'Storage', st.rate, 0.05, 'ac-ft/ac') + pnum('ps-storm.depth', 'Pond depth', st.depth, 0.5, 'ft') + pnum('detentionPct', 'Pond size', prog.detentionPct, 1, '%', 'auto') + '</div>') +
        (need ? '<div class="rnote sp-1l" title="' + esc(need) + '">' + esc(need) + '</div>' : '') +
      (uses.every(x => SP.CART_USES.includes(x)) ? '' : // (homes roll carts to the curb: no enclosures to set)
      '<div class="sp-sub">Trash' + infoBtn('Homes roll carts to the curb. Apartments: a double enclosure (trash and recycling) per about 50 units, a compactor from 200. Shops and offices: one per about 25,000 sf, none more than about 250 ft away. Add or move them under Add.', 'About trash enclosures') + '</div><div class="sp-fg">' +
        sel('data-ps="trash.mode"', 'Enclosures', tr.mode || (SP.normalizeProgram(pl.program).trash ? 'commercial' : 'none'), [['none', 'None (add by hand)'], ['commercial', 'Shops, restaurants, offices'], ['auto', 'Every building by the rules']]) +
        (uses.includes('multifamily') ? pnum('ps-trash.perUnits', 'Apartments each', tr.perUnits ?? 50, 5, 'units') : '') + (uses.some(x => SP.PER_SF_TRASH(x)) ? pnum('ps-trash.perSf', 'Commercial each', tr.perSf ?? 25000, 1000, 'sf') : '') + '</div>');
  }
  // Suggest Names: two or three sets from the AI that fit the place (its creeks, roads, town and county); with no AI, from
  // the street and town names (ED.localNames), and it says so
  async function suggestNames(btn) {
    const p = P(), pl = PL(); if (!pl) return; btn.disabled = true; btn.textContent = 'Finding names…';
    const parts = SP.partsOf(pl).map(q => ({ part: q.i, use: q.use, label: q.word, acres: q.acres, units: q.units || null })), cur = SP.normalizeProgram(pl.program);
    try { if (aiOff()) throw Object.assign(new Error('AI off'), { status: 503 });
      const d = await post({ mode: 'names', site: siteInfo(p, pl), facts: await factsFor(pl), parts, current: { community: cur.community, parts: SP.partsOf(pl, false).filter(q => q.name).map(q => ({ part: q.i, name: q.name })) }, theme: '' });
      ed.nameChoices = d.choices || []; ed.nameNote = ''; }
    catch (e) { ed.nameChoices = ED.localNames(pl, siteInfo(p, pl)).choices; ed.nameNote = 'The AI didn’t answer, so these come from the street and town names.'; }
    if (PL() === pl) panel();
  }
  function wireParams(pl) {
    if (!card.querySelector('#spParams')) return; // (not in this stage)
    const $ = s => card.querySelector(s), after = i => { if (ed.autoSolve !== false && (pl.recipe || ed.variants)) resolveSoon(i && settingLabel(i)); };
    $('.sp-prog').ontoggle = e => { ed.progOpen = e.target.open; };
    $('#spUse').onchange = e => { change(x => { x.program = { ...x.program, use: e.target.value, custom: null, ratio: null, perUnit: null, floors: null, depth: null, truck: null, mix: null, homeMix: null, storage: null, foodtrucks: null, fuel: null }; }); after(e.target); };
    card.querySelectorAll('.sp-prog input[data-k]').forEach(i => i.onchange = () => { change(x => { const k = i.dataset.k, v = i.value === '' ? null : +i.value;
      if (k.startsWith('sb-')) x.setbacks = { ...SP.SETBACKS, ...(x.setbacks || {}), [k.slice(3)]: v ?? SP.SETBACKS[k.slice(3)] ?? x.setbacks?.paving };
      else if (k.startsWith('pp-')) x.params = { ...(x.params || {}), [k.slice(3)]: v };
      else if (k.startsWith('ps-')) { const [g, f] = k.slice(3).split('.'); x.params = { ...(x.params || {}), [g]: { ...(x.params?.[g] || {}), [f]: v } }; }
      else if (k.startsWith('hs-')) { const f = k.slice(3); x.program = { ...x.program, [f]: v, ...(x.program.zones ? { zones: x.program.zones.map(z => SP.USES[z.use] && ['sfr', 'townhomes', 'duplex'].includes(z.use) ? { ...z, [f]: null } : z) } : {}) }; } // (the homes' size, plans and smallest lot: the program's, for every home zone)
      else x.program = { ...x.program, [k]: v }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-sw]').forEach(i => i.onchange = () => { const k = i.dataset.sw;
      if (k === 'auto') { ed.autoSolve = i.checked; return; }
      if (k === 'refit') { setView(v => { v.autoRefit = i.checked; }); return; } // how hand edits behave, not a setting of the layout
      change(x => { if (k === 'trees') x.params = { ...(x.params || {}), [k]: i.checked }; else x.setbacks = { ...SP.SETBACKS, ...(x.setbacks || {}), [k]: i.checked }; }); if (k !== 'trees') after(i); });
    card.querySelectorAll('.sp-prog [data-lo]').forEach(i => i.onchange = () => { change(x => { x.params = { ...(x.params || {}), fill: RUN.leftoverParam(i.value), fillBy: 'you' }; }); after(i); }); // Leftover land: what you set stands over the words and the AI
    card.querySelectorAll('.sp-prog [data-pr]').forEach(i => i.onchange = () => { change(x => { x.program = { ...x.program, [i.dataset.pr]: i.value || null }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-ps]').forEach(i => i.onchange = () => { const [g, f] = i.dataset.ps.split('.'); change(x => { x.params = { ...(x.params || {}), [g]: { ...(x.params?.[g] || {}), [f]: i.value } }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-st]').forEach(i => i.onchange = () => { change(x => { x.params = ['form', 'streets', 'mixStyle'].includes(i.dataset.st) ? { ...(x.params || {}), [i.dataset.st]: i.value } : { ...(x.params || {}), style: { ...(x.params?.style || {}), [i.dataset.st]: i.value } }; }); after(i); });
    const mixOf = x => clone(SP.normalizeProgram(x.program).mix || SP.UNIT_MIX);
    card.querySelectorAll('[data-mix]').forEach(i => i.onchange = () => { const [n, f] = i.dataset.mix.split(':'); change(x => { const m = mixOf(x); m[+n][f] = f === 'name' ? i.value : +i.value; x.program = { ...x.program, mix: m }; }); after(i); });
    card.querySelectorAll('[data-mixdel]').forEach(b => b.onclick = () => { change(x => { const m = mixOf(x); m.splice(+b.dataset.mixdel, 1); x.program = { ...x.program, mix: m }; }); after(); });
    const stoSet = (x, k, v) => { const p = x.program || {}; x.program = { ...p, gfa: null, storage: { ...(p.storage || {}), ...(SP.normalizeProgram(p).storage || {}), [k]: v } }; }; // (a total size no longer splits once the parts are set)
    card.querySelectorAll('.sp-prog [data-sto]').forEach(i => i.onchange = () => { change(x => stoSet(x, i.dataset.sto, i.type === 'checkbox' ? i.checked : i.value === '' ? null : +i.value)); after(i); });
    card.querySelectorAll('.sp-prog [data-ftp]').forEach(i => i.onchange = () => { change(x => { const p = x.program || {}; x.program = { ...p, foodtrucks: { ...(SP.normalizeProgram(p).foodtrucks || {}), [i.dataset.ftp]: i.type === 'checkbox' ? i.checked : i.value === '' ? null : +i.value } }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-fuel]').forEach(i => i.onchange = () => { const k = i.dataset.fuel, v = i.type === 'checkbox' ? i.checked : k === 'canopy' || k === 'islands' ? i.value : i.value === '' ? null : +i.value;
      change(x => { const p = x.program || {}, P = SP.normalizeProgram(p), fz = P.zones?.find(z => z.use === 'fuel');
        if (fz && P.use !== 'fuel') x.program = { ...P, zones: P.zones.map(z => z === fz ? { ...z, gfa: null, fuel: { ...z.fuel, [k]: v } } : z) }; // (a mixed plan's gas station zone)
        else x.program = { ...p, gfa: null, fuel: { ...(P.fuel || {}), ...(p.fuel || {}), [k]: v } }; }); after(i); }); // (the store's size is the program's floor area)
    const sMix = (x, k) => clone(SP.normalizeProgram(x.program).storage?.[k + 'Mix'] || SP.STORAGE_MIX[k]);
    card.querySelectorAll('[data-smix]').forEach(i => i.onchange = () => { const [k, n, f] = i.dataset.smix.split(':'); change(x => { const m = sMix(x, k); m[+n][f] = f === 'name' ? i.value : +i.value; stoSet(x, k + 'Mix', m); }); });
    card.querySelectorAll('[data-smixdel]').forEach(b => b.onclick = () => { const [k, n] = b.dataset.smixdel.split(':'); change(x => { const m = sMix(x, k); m.splice(+n, 1); stoSet(x, k + 'Mix', m); }); });
    card.querySelectorAll('[data-smixadd]').forEach(b => b.onclick = () => { const k = b.dataset.smixadd; change(x => { const m = sMix(x, k); m.push({ name: '10×' + (k === 'drive' ? 40 : 30), sf: k === 'drive' ? 400 : 300, pct: 0 }); stoSet(x, k + 'Mix', m); }); });
    const add = $('#spMixAdd'); if (add) add.onclick = () => change(x => { const m = mixOf(x); m.push({ name: 'New', sf: 900, pct: 0, beds: 2 }); x.program = { ...x.program, mix: m }; });
    card.querySelectorAll('[data-home]').forEach(i => i.onchange = () => { change(x => { const m = clone(SP.normalizeProgram(x.program).homeMix || SP.HOME_MIX), t = m.find(h => h.stories === +i.dataset.home); if (t) t.pct = +i.value; else m.push({ stories: +i.dataset.home, pct: +i.value }); x.program = { ...x.program, homeMix: m }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-gd]').forEach(i => i.onchange = () => { const k = i.dataset.gd, v = i.tagName === 'SELECT' ? i.value : i.value === '' ? null : +i.value; // the Waller guardrails' settings
      change(x => { x.params = { ...(x.params || {}), guard: { ...(x.params?.guard || {}), [k]: v } }; }); if (k !== 'mode' || GON(PL()) || pl.laidAs) after(i); });
    // names: typed, or a suggested set picked (one undo step); the labels change, the layout doesn't
    card.querySelectorAll('.sp-prog [data-nm]').forEach(i => i.onchange = () => { const k = i.dataset.nm; change(x => { x.program = SP.withNames(x.program, k === 'community' ? { community: i.value } : { parts: [{ part: +k, name: i.value }] }); }); });
    card.querySelectorAll('.sp-prog [data-nmc]').forEach(b => b.onclick = () => { const c = ed.nameChoices?.[+b.dataset.nmc]; if (!c) return; change(x => { x.program = SP.withNames(x.program, { community: c.community, parts: c.parts }); }); ctx.toast('Named the community ' + c.community + '.', { action: { label: 'Undo', run: () => { if (ed) undo(true); } } }); });
    const na = $('#spNameAsk'); if (na) na.onclick = () => suggestNames(na);
    // street names: on names the streets not named yet (off hides them, kept for next time); the theme for the next naming
    $('[data-snm="on"]')?.addEventListener('change', ev => { const sn = x => ({ ...(x.params?.streetNames || {}) }); if (ev.target.checked && chainsMemo(PL()).some(c => !c.name && !((c.role === 'boulevard' || c.role === 'entry') && c.L < 400))) nameStreets(false); else change(x => { x.params = { ...(x.params || {}), streetNames: { ...sn(x), on: ev.target.checked } }; }); });
    $('[data-snm="theme"]')?.addEventListener('change', ev => change(x => { x.params = { ...(x.params || {}), streetNames: { ...(x.params?.streetNames || {}), theme: ev.target.value.trim().slice(0, 80) } }; }, true));
    const ns = $('#spNameSt'); if (ns) ns.onclick = () => nameStreets(true);
    const rs = $('#spResolve'); if (rs) rs.onclick = () => askReplace(() => resolve({ force: true }));
    const rm = $('#spRefitMine'); if (rm) rm.onclick = () => { ed.solveBar = false; refitNow(true); };
    const nl = $('#spNewLay'); if (nl) nl.onclick = () => resolve({ force: true, src: '#spNewLay' });
  }
  // a setting as words for the toast after new layouts: "Front setback 35 ft", "Floors 4", "Trees off"
  function settingLabel(i) {
    const lab = i.closest('label'), fl = lab?.querySelector('.sp-fl, .sp-tl'), t = ((fl?.firstChild?.nodeType === 3 ? fl.firstChild.textContent : fl?.textContent) || '').replace(/\s+/g, ' ').trim(), unit = lab?.querySelector('.sp-u')?.textContent || ''; // the label, not its hint ("12 × 40 ft")
    const v = i.type === 'checkbox' ? (i.checked ? 'on' : 'off') : i.tagName === 'SELECT' ? i.selectedOptions[0]?.textContent || i.value : i.value === '' ? (i.placeholder || 'blank') : i.min !== '' && +i.value < +i.min ? i.min : i.value; // blank: as the box says (auto); below its minimum: the minimum it's read as
    return (t || 'Setting') + ' ' + v + (i.type === 'number' && unit && i.value !== '' ? (unit === '%' ? '%' : ' ' + unit) : '');
  }
  // re-fit: everything not pinned is laid out again around the pinned pieces
  let refitTimer = 0;
  // a local edit: the piece stays where it was put and parking under it gives way (whole stalls); nothing else moves.
  // Laying out everything else again is the Re-fit Plan button's job, never automatic.
  // delete a piece; the rest of a parking row it was part of stays as it is now (it doesn't grow back over the gap)
  function dropEl(x, el) { const k = el.ext && JSON.stringify(el.ext); x.elements = SP.isRing(el) ? SP.dropRing(x, x.elements.find(y => y.id === el.id) || el) : SP.isLoop(el) ? SP.dropLoop(x, x.elements.find(y => y.id === el.id) || el) : el.kind === 'sign' ? SP.dropSign(x, x.elements.find(y => y.id === el.id)) : x.elements.filter(y => y.id !== el.id); /* (an entrance's sign: it remembers it's gone) */ if (k) for (const y of x.elements) if (y.ext && JSON.stringify(y.ext) === k) delete y.ext;
    if (el.kind === 'building' && el.use === 'sfr') for (const l of x.elements) if (l.kind === 'lot' && Math.abs(l.x - el.x) < 250 && Math.abs(l.y - el.y) < 250 && SP.inRing([el.x, el.y], SP.shapeOf(l))) l.vacant = true; } // (a home deleted from its lot: the lot stays, vacant, and re-fits leave its place empty)
  // left: where it was (and what moved with it); parking it had cut there grows back
  // (a park, lawn or open space: the homes under it make way too, with their lots and driveways)
  // (a roundabout or a drop-off loop joins the streets again where it lands: free, Alt-dragged, it stays where it was put)
  function makeRoom(el, left = [], free = false) {
    if (SP.isRing(el) || SP.isLoop(el)) { const pl = PL(); if (!pl) return; const r = SP.reseat(pl, el, { free }); pl.elements = r.elements; const t = [r.why, r.note].filter(Boolean).join(' '); if (t) ctx.toast(t); return; }
    const pl = PL(); if (!pl || !el || ['parking', 'lot', 'trail', 'keepout'].includes(el.kind) || el.kind === 'green' && !SP.isPark(el)) return;
    if (SP.isPark(el)) { const gone = SP.homesUnder(pl, el, 4); if (gone.size) pl.elements = pl.elements.filter(x => !gone.has(x)); pl.elements = SP.trimLots(pl.elements, el); } // (the lots of the homes that stay come back off it)
    const pad = el.kind === 'building' || el.kind === 'garage' ? 5 : 1, spare = pl.spareRows = (pl.spareRows || []).slice(-40); // rows cut away whole, kept to grow back
    pl.elements = SP.cutRows(pl.elements, SP.outline(el), pad, spare);
    for (const o of left) pl.elements = SP.regrowRows(pl.elements, SP.outline(o), 5, spare);
  }
  // after an edit in the Selected box or a nudge (verb, name: what the toast says, e.g. "Moved", "Building A"): the
  // piece makes room locally first, then the rest re-fits round it (autoRefit)
  function refitSoon(verb, name) { clearTimeout(refitTimer); clearTimeout(autoT); refitTimer = setTimeout(() => { const pl = PL(), el = pl?.elements.find(x => x.id === ed.sel); if (!el) return; makeRoom(el, ed.nudged || []); for (const o of pl.elements.filter(x => x !== el && (ed.multi || []).includes(x.id) && (SP.isRing(x) || SP.isLoop(x)))) makeRoom(o); /* (a roundabout nudged with others joins the streets again too) */ ed.nudged = null; pl.updated = new Date().toISOString(); save(P()); draw(); panel(); autoRefit(verb || 'Changed', name || ED.labelOf(el), 100); }, 250); }
  // the layout card's update icon: Re-fit Around My Changes, the icon turning (and the others locked out) until it's done
  async function updateNow() {
    if (!ed || ed.updBusy || ed.run) return; const e0 = ed, pl = PL();
    ed.updBusy = true; panel();
    try { await refitNow(true); } finally { if (ed === e0) { ed.updBusy = false; if (PL() === pl) panel(); } }
  }
  // a re-fit in the worker; null when nothing re-fits round the pieces placed (refitNo: why, when the layout says, e.g.
  // a gas station's canopy with no room for its lanes where it was put)
  let refitNo = '';
  async function refitOf(...args) { const r = await laid('refit', ...args); refitNo = r && !r.elements?.length ? r.why || '' : ''; return r?.elements?.length ? r : null; }
  // Re-fit Plan (the button, Re-fit around my changes): everything not pinned laid out again around the pinned pieces;
  // one undo step
  async function refitNow(asked) {
    const pl = PL(); if (!pl?.recipe) return; clearTimeout(autoT); autoSeq++; ed.refitting = false;
    let r = null; ctx.toast('Re-fitting the plan around the pieces you placed…'); try { r = await refitOf(pl); } catch (err) { console.warn('refit', err); } if (PL() !== pl) return;
    if (!r) { if (asked) ctx.toast('Couldn’t re-fit the plan around that; it stays as you left it.' + (refitNo ? ' ' + refitNo : '')); return; }
    ed.undo.push(snapshot()); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = []; useRefit(pl, r);
    if (asked) ctx.toast(r.fresh ? 'The site was laid out afresh round the pieces you placed (new streets).' : 'Re-fitted around the pieces you placed.', { action: { label: 'Undo', run: () => { if (ed && PL() === pl) undo(true); } } });
  }
  function useRefit(pl, r) {
    pl.elements = r.elements; pl.spareRows = []; if (r.recipe) pl.recipe = clone(r.recipe); if (r.zones) pl.zones = clone(r.zones); markEdited(pl); ed.solveBar = false; ed.refitNote = (r.notes || []).join(' '); pl.stale = null; { const cv = ed.variants?.find(v => v.key === pl.variant?.key); if (cv) delete cv.stale; }
    if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null; ed.multi = (ed.multi || []).filter(id => pl.elements.some(x => x.id === id)); if (ed.multi.length < 2) ed.multi = [];
    pl.updated = new Date().toISOString(); save(P()); draw(); panel();
  }
  // Auto re-fit (on unless turned off in the plan's settings, pl.view.autoRefit): a moment after an edit ends (a drag let
  // go, a turn, an add, a delete, a copy, a number in the Selected box, the last of a burst of nudges) the rest of the site
  // is laid out again round the pinned pieces, in the worker, keeping the program the plan has now. It joins the edit's
  // own undo step (the snapshot taken before the edit; nothing new is pushed), so one Undo puts back the plan as it was.
  // Never mid-drag, during a build, or on a plan drawn by hand (no recipe: the local make-room is all). If the re-fit
  // would lose more than 5% of the floor area or units, or add problems, the edit stays as it is and a toast offers it.
  let autoT = 0, autoSeq = 0;
  function autoRefit(verb, name, wait = 350) {
    clearTimeout(autoT); const pl = PL(); if (!ed || !pl?.recipe || !T.viewOf(pl).autoRefit) return;
    const e0 = ed; autoT = setTimeout(() => runAuto(e0, pl, verb + ' ' + name), wait);
  }
  async function runAuto(e0, pl, what) {
    if (ed !== e0 || PL() !== pl || drag || ed.run && !ed.run.applied) return;
    const mark = ed.undo.length, top = ed.undo[mark - 1], was = JSON.stringify(pl.elements), seq = ++autoSeq; ed.refitting = true; paintMode();
    let r = null; try { r = await refitOf(pl, { amount: 'current' }); } catch (err) { console.warn('auto re-fit', err); }
    if (seq !== autoSeq) return; if (ed === e0) { ed.refitting = false; paintMode(); }
    const same = () => ed === e0 && PL() === pl && ed.undo.length === mark && ed.undo[mark - 1] === top && JSON.stringify(pl.elements) === was && !drag && !(ed.run && !ed.run.applied);
    if (!r && refitNo && same()) { ctx.toast('Kept your change; the rest of the site couldn’t be re-fitted round it. ' + refitNo); return; } // (the plan stays as the edit left it)
    if (!r?.elements?.length || !same()) return; // something changed meanwhile: that change re-fits on its own
    const at = els => ({ m: GM({ ...pl, elements: els }), issues: GC({ ...pl, elements: els }) }), v = T.refitVerdict(at(pl.elements), at(r.elements));
    if (!v.ok) { ctx.toast('Kept your change; re-fitting would ' + (v.why === 'problems' ? 'add problems' : 'lose ' + (v.why === 'units' ? 'units' : 'space')), { action: { label: 'Re-fit anyway', run: () => { if (same()) useRefit(pl, r); else if (ed === e0) refitNow(true); } } }); return; }
    useRefit(pl, r); ctx.toast(what + (r.fresh ? ' · the site was laid out afresh round it (new streets)' : ' · rest of the site re-fitted'), { action: { label: 'Undo', run: () => { if (ed === e0 && PL() === pl && ed.undo.length === mark) undo(true); } } });
  }
  // lay the options out again with the plan's own program and settings (no AI call)
  // Never over hand edits: with a changed layout on the map, new settings show a bar instead (re-fit around the changes,
  // or new layouts that replace them). Otherwise the same layout (by its key) comes back with the new settings, and a
  // toast says what changed, with Undo.
  // solveMark: where the undo list stood before the setting changed, so the toast's Undo takes back the setting too
  let solveTimer = 0, solveLabel = '', solveMark = null;
  function resolveSoon(label) { solveLabel = label || solveLabel; const pl = PL(); clearTimeout(solveTimer); if (dirty(pl)) { solveMark = null; showSolveBar(); return; }
    if (solveMark == null && ed) solveMark = Math.max(0, ed.undo.length - 1); solveTimer = setTimeout(() => resolve(), 350); }
  function showSolveBar() { // after the redraw that's under way (a setting's change event can fire while the panel is being replaced)
    if (ed.solveBar) return; ed.solveBar = true; const e0 = ed;
    setTimeout(() => { if (ed !== e0 || !ed.solveBar) return; panel(); card.querySelector('#spSolveBar')?.scrollIntoView({ block: 'nearest' }); }, 0); }
  async function resolve(o = {}) {
    const pl = PL(); if (!pl || pl.ring.length < 3) return;
    if (ed.run) { if (o.force) ctx.toast('Wait for the run under way, or Cancel it.'); else ed.solveLater = true; return; } // after it ends
    if (!o.force && dirty(pl)) { solveMark = null; showSolveBar(); return; }
    const label = solveLabel, mark = o.force ? null : solveMark; solveLabel = ''; solveMark = null; ed.solveBar = false;
    const before = pl.elements.some(e => e.kind === 'building') ? GM(pl) : null, was = pl.variant ? { ...pl.variant } : null, hadAi = !!ed.variants?.some(v => v.ai);
    const run = startRun('resolve', ['Laying out new layouts with these settings'], o.src || '#spResolve'); if (!run) return;
    let out = []; try { out = await laid('options', { ...pl, params: RUN.fillParams(pl.params, { ask: ed.runMeta?.ask || pl.lastRun?.ask || '' }) }, pl.program, { count: ed.variants?.length > 3 ? 12 : 3, deeper: true, ...koOpts(pl) }); } catch (e) { console.warn('layout', e); }
    if (!live(run) || PL() !== pl) return;
    const variants = named(out, { ...pl });
    if (!variants.some(v => v.elements.length)) { endRun(run); ctx.toast('Nothing fits with these settings.'); return; }
    run.applied = true; ed.variants = variants; pl.stale = null; ed.reviewCleared = hadAi; ed.runMeta = { ask: ed.runMeta?.ask || pl.lastRun?.ask || '', at: new Date().toISOString() };
    if (hadAi) { ed.aiNote = 'Settings changed: AI review cleared.'; ed.aiSummary = ''; ed.aiPick = null; }
    const r = RUN.matchLayout(variants, was?.key, was?.name);
    const ok = await useVariant(r.index >= 0 ? r.index : variants.findIndex(v => v.elements.length)); endRun(run); if (!ok) return;
    const now = PL()?.variant, lost = was?.key && !r.exact ? numOf(was) + ' no longer fits; showing the nearest (' + numOf(now) + '). ' : '';
    const depth = ed.undo.length, back = () => { if (!ed || PL() !== pl) return; if (mark != null && ed.undo.length === depth) { while (ed.undo.length > mark) undo(true); } else undo(true); }; // the new layout and, after a setting change, the setting
    ctx.toast(lost + RUN.deltaText(label || 'New settings', before, GM(PL())), { action: { label: 'Undo', run: back } });
  }

  // the piece that's picked: its name and size, what can be done to it (a row of buttons), then its fields
  // an AI-sized piece says so (and which AI-crafted type it belongs to); a building can be saved to the team library
  const turnVal = e => { const r = (((e.rot || 0) % 360) + 360) % 360; return Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r) % 360 : +r.toFixed(1); }; // the Turn field: whole degrees, or one place when it's between
  const selCustom = e => (e.aiSized || e.custom ? '<div class="sp-cust">' + (e.aiSized ? '<i class="sp-ais" title="' + esc(AIS_TIP) + '">AI-sized</i>' : '') + (e.custom ? '<span>' + esc(e.custom) + (e.aiSized ? ': the AI’s size, not a product sheet' : '') + '</span>' : '') + '</div>' : '') +
    (e.kind === 'building' ? '<div class="sp-row sp-savelib"><button type="button" class="btn sm" id="spSaveLib" title="Keep this building in the team library: everyone on the team can add it from the building library' + (e.custom ? ', and the AI can build another ' + esc(e.custom) + ' from its recipe' : '') + '">Save to Library</button></div>' : '');
  function selHtml(e, prog) {
    if (e && sels().length > 1) return multiHtml();
    if (!e) return '<div class="lt">Selected</div><div class="rnote sp-1l">Click a piece on the map to see it.' + infoBtn(ed.editing ? 'Drag a piece to move it; a white corner resizes it, a white bar on a side drags that face straight out or in, the green dot turns it. Turning settles square to the street, the site’s edges and the buildings when it comes within 2°; hold Shift to turn in 15° steps, or to size in whole feet and keep corners square. It lines up with its neighbours and stays out of the setbacks (hold Alt to move it freely). Arrow keys nudge it, R turns it 90°, Delete removes it. Only that piece moves; parking under a building gives way.' : 'Turn on Edit Layout to move, resize or turn pieces.', 'How to change a piece') + '</div>';
    const free = SP.isFree(e), rc = !!PL()?.recipe;
    const n = (k, label, v, o = {}) => fld(label, numCtl((o.id ? 'id="' + o.id + '" ' : '') + (o.min != null ? 'min="' + o.min + '" ' : '') + (o.max ? 'max="' + o.max + '" ' : '') + 'data-e="' + k + '"', v, o.step || 1, o.unit || ''), o.tip ? { tip: o.tip } : {});
    const turnF = () => n('rot', 'Turn', turnVal(e), { id: 'spTurn', unit: '°', tip: 'Any number of degrees. The arrows step 1°; with Shift, 15°.' }); // typed degrees, any number (52.5 too: nothing checks it against the arrows' 1° step)
    const pick = (attr, label, opts, v, wide) => fld(label, selCtl(attr, opts, v), { wide });
    return '<div class="lt">' + esc(SP.KINDS[e.kind]?.label || e.kind) + (free && e.kind !== 'keepout' ? (SP.isRing(e) ? ' · roundabout' : SP.isLoop(e) ? ' · drop-off loop' : T.isEntrance(e) ? (e.blvd ? ' · boulevard entrance' : ' · entrance') : SHAPEABLE.includes(e.kind) && !['pond', 'green', 'pool'].includes(e.kind) ? ' · custom shape' : e.path ? ' · route' : ' · curved') : '') + '</div><div class="rnote sp-1l" id="spRead"></div>' + selCustom(e) +
      '<fieldset class="sp-fs"' + (ed.editing ? '' : ' disabled') + '>' +
      '<div class="sp-acts"><button type="button" class="btn sm" id="spRot" title="Shift+R turns it the other way">' + (T.isEntrance(e) ? 'Turn 15°' : 'Turn 90°') + '</button>' + (e.kind === 'building' && !['sfr', 'townhomes', 'duplex'].includes(e.use || prog.use) ? '<button type="button" class="btn sm" id="spLoop" title="A one-way loop with a planted island between the building and the nearest drive">Add Drop-off Loop</button>' : '') + ((SHAPEABLE.includes(e.kind) || T.routeable(e)) && !SP.isRing(e) ? '<button type="button" class="btn sm" id="spShape" aria-pressed="' + (ed.shape === e.id) + '" title="' + (T.routeable(e) ? 'Bend it: drag its points along the drive; a blue + adds a point; double-click a point to remove it' : 'Drag its points or its faces; drag a blue + to add a point; double-click a point to remove it. Hold Shift for whole feet and square corners.') + '">' + (ed.shape === e.id ? 'Done Shaping' : 'Edit Shape') + '</button>' : '') +
        (T.isEntrance(e) && !e.blvd ? '<button type="button" class="btn sm" id="spBlvd" title="Two lanes and a planted median in from where its mouth is, square to the street (Settings › Entrance sets the widths and the sign)">Make It a Boulevard</button>' : '') +
        (rc ? '<button type="button" class="btn sm" id="spRefit" title="Lay out everything else again around the pieces you placed">Re-fit Plan</button>' : '') + '<button type="button" class="btn sm" id="spDup" title="Copy it beside itself (⌘D / Ctrl+D)">Duplicate</button><button type="button" class="btn sm" id="spAskSel" title="Say what to change about this piece">Change With AI</button><button type="button" class="btn sm ghost sp-del" id="spDel" title="Delete it (Delete)">Delete</button></div>' +
      (e.kind === 'parking' ? '<div class="sp-acts sp-stalls"><button type="button" class="btn sm" id="spStallDir" title="Turn the stalls 90° inside the same outline: the rows run the other way">Stall Direction</button><button type="button" class="btn sm" id="spFaceB" title="Turn the stalls to face the nearest building: cars pull in toward it, the aisle runs along it, and the parking sits a walk’s width off it">Face the Building</button></div>' : '') +
      podHtml(e) + netHtml(e) + (!ed.editing ? '<div class="rnote sp-1l">Turn on <b>Edit Layout</b> to change it.</div>' : rc && e.pinned ? '<div class="sp-pin"><span class="rnote">Pinned: <b>Re-fit Plan</b> keeps it where it is.</span><button type="button" class="btn sm" id="spUnpin" title="Re-fit Plan may move it again">Let It Move</button></div>' : '') +
      '<div class="sp-fg">' + (SP.isRing(e) ? n('across', 'Across', Math.round(2 * SP.ringOf(e).R), { min: 2 * SP.RING.min, max: 2 * SP.RING.max, unit: 'ft' }) + n('width', 'Lane', Math.round(e.width || 20), { min: 14, max: 30, unit: 'ft' }) : e.path && T.routeable(e) ? n('width', 'Width', Math.round(e.width || 26), { min: 6, max: 80, unit: 'ft' }) + n('r', 'Curve', Math.round(e.r ?? 30), { min: 0, max: 200, unit: 'ft' }) + (T.isEntrance(e) ? n('flare', 'Mouth flare', Math.round(e.flare || 0), { min: 0, max: 60, unit: 'ft' }) : '') : '') + (e.kind === 'building' ? pick('data-use="1"', 'Use', Object.entries(SP.USES).map(([k, u]) => [k, u.label]), e.use || prog.use) + n('floors', 'Floors', e.floors || 1, { min: 1, max: 40 }) +
          fld('Type', '<select data-type="1">' + (e.type ? '' : '<option value="" selected>Custom (drawn or sized by hand)</option>') + typeOptions(e.type || '', teamTypes()) + '</select>', { wide: true }) : '') + // what it is first: use and type can change any time
        (free ? '' : n('w', 'Width', Math.round(e.w), { min: 8, unit: 'ft' }) + n('d', 'Depth', Math.round(e.d), { min: 8, unit: 'ft' })) + turnF() + // (every piece turns, curved ones too)
        (e.kind === 'building' && (e.use || prog.use) === 'foodtrucks' ? pick('data-ftk="1"', 'Part', [['pavilion', 'Covered pavilion'], ['bar', 'Bar / beer garden'], ['restroom', 'Restrooms']], SP.ftKind(e)) : e.kind === 'building' && (e.use || prog.use) === 'storage' ? pick('data-stok="1"', 'Storage', [['climate', 'Climate-controlled'], ['drive', 'Drive-up units'], ['office', 'Leasing office']], SP.storageKind(e)) : e.kind === 'building' && (e.use || prog.use) === 'fuel' ? pick('data-fuelk="1"', 'Gas station', [['store', 'Convenience store'], ['wash', 'Car wash']], SP.fuelKind(e)) : e.kind === 'building' ? (SP.USES[e.use || prog.use]?.garage ? n('units', 'Homes', e.units || 1, { min: 1, max: 40 }) : '') +
          pick('data-form="1"', 'Building shape', e.poly ? [['custom', 'Custom outline'], ...FORMS] : FORMS, e.poly ? 'custom' : e.form || 'bar') + (e.form === 'tower' && !e.poly ? n('podium', 'Podium floors', e.podium || 2, { min: 1, max: 6 }) : '') : '') +
        (e.kind === 'garage' ? n('levels', 'Levels', e.levels || 4, { min: 1, max: 12 }) : '') +
        (e.kind === 'canopy' ? pick('data-pumps="1"', 'Pumps', SP.PUMPS.map(k => [String(k), k + ' · ' + 2 * k + ' fueling positions']), String(e.pumps || 8)) + pick('data-prows="1"', 'Rows', [['1', '1 row'], ['2', '2 rows'], ['3', '3 rows']], String(e.rows || 2)) + pick('data-pisl="1"', 'Pump islands', ISLANDS, e.islands === 'across' ? 'across' : 'along') : '') +
        (['pond', 'pool', 'green', 'plaza', 'court'].includes(e.kind) ? pick('data-shape="1"', 'Shape', [['organic', 'Natural curves'], ['rounded', 'Rounded rectangle'], ['square', 'Rectangle']], e.poly ? 'organic' : e.shape === 'round' ? 'rounded' : 'square') : '') +
        (T.isEntrance(e) && (e.blvd || PL() && SP.entryParts(PL(), e).length) ? pick('data-signs="1"', 'Monument signs', [['median', 'In the median'], ['both', 'Both corners'], ['one', 'One corner'], ['none', 'None']], (g => !g.length ? 'none' : g[0].want || (g.some(x => x.sign === 'median') ? 'median' : g.length > 1 ? 'both' : 'one'))(SP.entryParts(PL(), e).filter(x => x.kind === 'sign'))) : '') +
        (e.kind === 'drive' && e.net && PL()?.recipe?.net && !T.isEntrance(e) ? '' : fld('Name', '<input type="text" maxlength="40" data-name="1" value="' + esc(e.name || '') + '" placeholder="e.g. Building B, Pad A">', { wide: true })) + '</div></fieldset>'; // (a neighbourhood street: its street name above)
  }
  // a piece of a plan laid out in pods: the pod it's in, and laying that pod out again or swapping it with another
  function podHtml(e) {
    const pl = PL(), z = e.pod && pl?.recipe?.pods ? (pl.zones || []).find(q => q.pod === e.pod) : null; if (!z) return '';
    const others = (pl.zones || []).filter(q => q.pod && q.pod !== z.pod && !['amenity'].includes(q.use) && z.use !== 'amenity');
    return '<div class="sp-pin"><span class="rnote">In <b>' + esc(z.name) + '</b> · ' + esc((SP.USES[z.use]?.label || z.use).split(' / ')[0]) + ' · ' + (+z.acres).toFixed(1) + ' ac</span>' + (z.use === 'amenity' ? '' : '<button type="button" class="btn sm" id="spRelay"' + (ed.podBusy ? ' disabled' : '') + ' title="Lay this pod out again from scratch, keeping the rest of the plan">Re-lay This Pod</button>' +
      (others.length ? '<select id="spSwapPod" class="sp-swap" aria-label="Swap this pod with another" title="This pod and the one picked trade uses; both are laid out again"' + (ed.podBusy ? ' disabled' : '') + '><option value="">Swap With…</option>' + others.map(q => '<option value="' + esc(q.pod) + '">' + esc(q.name) + '</option>').join('') + '</select>' : '')) + '</div>';
  }
  // re-lay or swap pods (lib/sitepods.mjs relayPods, in the worker): one undo step; the notes say what moved and which
  // placement no longer holds
  async function podChange(req, what) {
    const pl = PL(); if (!ed || !pl?.recipe?.pods || ed.podBusy) return; const e0 = ed; ed.podBusy = true; panel(); ctx.toast(what + '…');
    const snap = snapshot(), u0 = ed.undo.length, at0 = pl.updated; // (the plan as it was asked of: an edit made meanwhile isn't overwritten)
    let r = null; try { r = await laid('pods', pl, req); } catch (err) { console.warn('pods', err); } if (ed === e0) ed.podBusy = false; if (ed !== e0 || PL() !== pl) return;
    if (ed.undo.length !== u0 || pl.updated !== at0) { panel(); ctx.toast('The plan changed while that pod was being laid out, so nothing was replaced; try again.'); return; }
    if (!r || r.error || !r.elements?.length) { panel(); ctx.toast(r?.error || 'Couldn’t lay that out again; the plan stays as it was.'); return; }
    ed.undo.push(snap); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = [];
    pl.elements = r.elements; pl.zones = r.zones; pl.recipe = clone(r.recipe); if (r.program) pl.program = r.program; pl.spareRows = []; markEdited(pl); ed.refitNote = (r.notes || []).join(' '); pl.stale = null;
    if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null; pl.updated = new Date().toISOString(); save(P()); draw(); panel();
    ctx.toast((r.notes || []).slice(0, 3).join(' ') || 'Done.', { action: { label: 'Undo', run: () => { if (ed === e0 && PL() === pl) undo(true); } } });
  }
  // a street of a neighbourhood's network (lib/streetedit.mjs): what it is and how it ends, and what can be done to it (a
  // cul-de-sac, a stretch deleted, a bow, its block laid out again) and its name
  const END_WORD = c => c.cyc ? 'a loop' : (k => k.bulb === 2 ? 'a cul-de-sac at each end' : k.bulb ? 'ends in a cul-de-sac' : k.free ? 'a dead end' : k.street ? 'in from the street' : 'T’s at both ends')(c.ends.reduce((o, x) => { if (x) o[x.kind] = (o[x.kind] || 0) + 1; return o; }, {}));
  function netHtml(e) {
    const pl = PL(); if (!pl?.recipe?.net || e.kind !== 'drive' || !e.net) return ''; const c = chainsMemo(pl).find(x => x.ids.includes(e.id) || x.bulbs.includes(e.id)); if (!c) return '';
    const own = c.parts.find(x => x.id === e.id), along = own && c.J.some(j => j > own.off + 20 && j < own.off + own.L - 20), way = c.role === 'boulevard' || c.role === 'entry', dis = ed.netBusy || !ed.editing ? ' disabled' : '', side = c.role === 'local' || c.role === 'court' || !!clickOf(e); // (a collector or a way in: the block on the side it was clicked)
    const cul = !way && !c.cyc && (c.ends.some(x => x?.kind === 'free') || c.role === 'local' && c.ends.every(x => x?.kind === 'tee')), b = (id, label, tip) => '<button type="button" class="btn sm" id="' + id + '"' + dis + ' title="' + esc(tip) + '">' + label + '</button>';
    return '<div class="sp-pin sp-net"><span class="rnote">Street · <b>' + esc(c.name || c.label || { collector: 'Collector', local: 'Local street', court: 'Cul-de-sac street', boulevard: 'Main entry', entry: 'Way in' }[c.role]) + '</b> · ' + f0(c.L) + ' ft · ' + END_WORD(c) + '</span><span class="btnrow">' +
      (cul ? b('spCul', 'Make It a Cul-de-sac', 'Ends it in a cul-de-sac (a dead end gets a bulb; a street T-ing in at both ends is cut back at the end farther from the main entry); its lots re-flow') : '') +
      (along && !e.bulb ? b('spCutSt', 'Delete This Stretch', 'Takes out the stretch between the two streets that meet it either side of where you clicked (or of this piece’s middle); its lots go') : '') +
      (!way && !c.cyc && c.L >= 200 ? b('spCurve', 'Curve It', 'A gentle bow, its ends where they are; the streets that meet it come along (Shift: the other way)') : '') +
      (side ? b('spRelayNet', 'Re-Lay This Block', 'Lays the local streets of the block ' + (c.role === 'local' || c.role === 'court' ? 'it’s in' : 'on the side you clicked') + ' out again another way, keeping the collectors and the rest of the plan; each press another way') : '') + '</span></div>' +
      (!way ? '<div class="sp-fg">' + fld('Street name', '<input type="text" maxlength="40" data-street="' + esc(c.key) + '" value="' + esc(c.name || '') + '" placeholder="e.g. Heritage Parkway"' + (ed.editing ? '' : ' disabled') + '>', { wide: true }) + '</div>' : '');
  }
  // a street edited (lib/streetedit.mjs): the change, then its lots re-flowed (the re-fit in the worker), one undo step
  async function streetEdit(r, name) {
    const pl = PL(); if (!pl) return; if (r.error) { ctx.toast(r.error); return; } const e0 = ed, n0 = pl.elements.filter(x => x.kind === 'building' && x.use === 'sfr').length;
    change(x => { x.elements = r.elements; }); const u0 = ed.undo.length, at0 = pl.updated; ed.netBusy = true; panel(); ctx.toast(r.note + ' Re-flowing the lots…');
    let f = null; try { f = await refitOf(pl, { amount: 'current' }); } catch (err) { console.warn('street re-fit', err); } if (ed !== e0) return; ed.netBusy = false;
    if (PL() !== pl || ed.undo.length !== u0 || pl.updated !== at0) { panel(); return; } // (changed meanwhile: that change re-fits on its own)
    if (f) useRefit(pl, f); else panel(); const n1 = pl.elements.filter(x => x.kind === 'building' && x.use === 'sfr').length;
    ctx.toast(r.note + (f ? ' ' + f0(n1) + ' homes' + (n1 !== n0 ? ' (' + f0(n0) + ' before)' : '') + '.' : ' The lots couldn’t be re-flowed: Re-fit Plan tries again.'), { action: { label: 'Undo', run: () => { if (ed === e0 && PL() === pl) undo(true); } } });
  }
  // the block a street or home is in laid out again in the worker (lib/streetnet.mjs relayBlock): one undo step
  async function netChange(req) {
    const pl = PL(); if (!ed || !pl?.recipe?.net || ed.netBusy) return; const e0 = ed; ed.netBusy = true; panel(); ctx.toast('Laying that block’s streets out again…');
    const snap = snapshot(), u0 = ed.undo.length, at0 = pl.updated;
    let r = null; try { r = await laid('net', pl, req); } catch (err) { console.warn('relay', err); } if (ed === e0) ed.netBusy = false; if (ed !== e0 || PL() !== pl) return;
    if (ed.undo.length !== u0 || pl.updated !== at0) { panel(); ctx.toast('The plan changed while that block was being laid out, so nothing was replaced; try again.'); return; }
    if (!r || r.error || !r.elements?.length) { panel(); ctx.toast(r?.error || 'Couldn’t lay that block out again; the plan stays as it was.'); return; }
    ed.undo.push(snap); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = []; useRefit(pl, r); if (ed.relayK && r.block) ed.relayK.block = r.block;
    const back = { action: { label: 'Undo', run: () => { if (ed === e0 && PL() === pl) undo(true); } } }; ctx.toast((r.notes || []).slice(0, 2).join(' ') || 'Done.', back);
    const u1 = ed.undo.length, at1 = pl.updated, x = await newNames(pl); if (!x || ed !== e0 || PL() !== pl || ed.undo.length !== u1 || pl.updated !== at1) return; // (street names on: its new streets named, in the same undo step, unless the plan changed meanwhile)
    const n = SNm.applyNames(pl, x.names); pl.elements = n.elements; pl.recipe = n.recipe; pl.updated = new Date().toISOString(); save(P()); draw(); panel(); ctx.toast('Named the block’s new streets.' + (x.note ? ' ' + x.note : ''), back);
  }
  // street names on and a layout picked or laid out afresh (its streets carry no names): named, unless the plan changes meanwhile
  async function nameNew(pl) { const e0 = ed, u1 = ed?.undo.length, at1 = pl?.updated; if (!pl) return; const x = await newNames(pl); if (!x || ed !== e0 || PL() !== pl || ed.undo.length !== u1 || pl.updated !== at1) return;
    const n = SNm.applyNames(pl, x.names); pl.elements = n.elements; pl.recipe = n.recipe; save(P()); draw(); panel(); }
  // street names on and streets laid out again with none (a block re-laid): names for those only, the rest as they are
  const newNames = async pl => SNm.namesOn(pl) && chainsMemo(pl).some(c => !c.name && !((c.role === 'boulevard' || c.role === 'entry') && c.L < 400)) ? streetNamesOf(P(), pl, false).then(x => x?.count ? x : null, () => null) : null;
  // where the selected street was clicked (null when it was picked another way: the list, Change With AI, undo)
  const clickOf = e => ed.clickOn === e.id && ed.clickFt ? ed.clickFt : null;
  // each press on one block another way of laying it out (k 1, 2, …); another block starts again at the best
  const relayNext = at => { const k = ed.relayK?.block && SP.inRing(at, ed.relayK.block) ? ed.relayK.k + 1 : 1; ed.relayK = { k, block: null }; return k; }; // (the block itself noted once it's laid: netChange)
  function wireNet(e) {
    const $ = q => card.querySelector(q), pl = PL(), c = pl && chainsMemo(pl).find(x => x.ids.includes(e.id) || x.bulbs.includes(e.id)), nm = c ? c.name || c.label || 'the street' : 'the street';
    $('#spCul')?.addEventListener('click', () => streetEdit(SE.culDeSac(PL(), e.id, { id: uid() }), nm));
    $('#spCutSt')?.addEventListener('click', () => streetEdit(SE.cutStretch(PL(), e.id, clickOf(e) || [e.x, e.y]), nm));
    $('#spCurve')?.addEventListener('click', ev => streetEdit(SE.bendStreet(PL(), e.id, ev.shiftKey ? -1 : null), nm));
    $('#spRelayNet')?.addEventListener('click', () => { const at = SE.blockAt(PL(), e.id, clickOf(e)); if (at) netChange({ op: 'relay', at, k: relayNext(at) }); });
    $('[data-street]')?.addEventListener('change', ev => { const x0 = PL(), r = SNm.rename(x0, ev.target.dataset.street, ev.target.value); if (r.error) { ctx.toast(r.error); ev.target.value = c?.name || ''; return; }
      change(x => { x.elements = r.elements; x.recipe = r.recipe; if (!SNm.namesOn(x)) x.params = { ...(x.params || {}), streetNames: { ...(x.params?.streetNames || {}), on: true } }; }); ctx.toast(r.name ? 'Named ' + nm + ' ' + r.name + '.' : 'Name taken off.'); });
  }
  // several pieces picked: how many, what they cover, and what can be done to all of them at once (each one undo step)
  function multiHtml() {
    const pl = PL(), ids = sels(), els = pl.elements.filter(e => ids.includes(e.id)), by = new Map(); for (const e of els) { const l = SP.KINDS[e.kind]?.label || e.kind; by.set(l, (by.get(l) || 0) + 1); }
    const pinned = els.every(e => e.pinned);
    return '<div class="lt">' + ids.length + ' pieces selected</div><div class="rnote">' + [...by].map(([l, n]) => n + ' × ' + esc(l.toLowerCase())).join(' · ') + ' · <b>' + f0(T.footprintOf(els)) + ' sq ft</b> covered</div>' +
      '<div class="sp-acts"><fieldset class="sp-fs sp-fsrow"' + (ed.editing ? '' : ' disabled') + '><button type="button" class="btn sm" id="spMDup" title="Copy them beside the set (⌘D / Ctrl+D)">Duplicate</button><button type="button" class="btn sm" id="spMPin" title="' + (pinned ? 'Re-fit Plan may move them again' : 'Re-fit Plan keeps them where they are') + '">' + (pinned ? 'Let Them Move' : 'Pin') + '</button><button type="button" class="btn sm ghost sp-del" id="spMDel">Delete</button></fieldset><button type="button" class="btn sm" id="spMFit" title="Fit the selection in view (F)">Fit Selection</button></div>' +
      '<div class="rnote sp-1l">' + (ed.editing ? 'Drag any of them to move them all.' : 'Turn on <b>Edit Layout</b> to move, copy or delete them.') + infoBtn('Shift-click a piece to add it or take it out; arrow keys nudge the set; Esc clears the selection.', 'About picking several pieces') + '</div>';
  }
  function wireMulti() {
    const $ = q => card.querySelector(q), ids = sels();
    if ($('#spMDup')) $('#spMDup').onclick = () => dupSel(); if ($('#spMDel')) $('#spMDel').onclick = () => delEls(ids); if ($('#spMFit')) $('#spMFit').onclick = () => fitSel();
    if ($('#spMPin')) $('#spMPin').onclick = () => { const pl = PL(), all = pl.elements.filter(e => ids.includes(e.id)).every(e => e.pinned); change(x => { for (const e of x.elements) if (ids.includes(e.id)) { if (all) delete e.pinned; else e.pinned = true; } }); };
  }
  // Duplicate (⌘D): copies of the piece or the set beside it, with what's attached, in the nearest clear spot; the copies picked
  // a roundabout or a drop-off loop isn't copied (it belongs to its junction or its building): says so, true when one's picked
  function ownPiece(pl, ids) { const own = pl.elements.find(e => ids.includes(e.id) && (SP.isRing(e) || SP.isLoop(e))); if (own) ctx.toast(SP.isRing(own) ? 'A roundabout belongs to its junction: add another with Add Roundabout.' : 'A drop-off loop belongs to its building: add one in front of another building with Add Drop-off Loop.'); return !!own; }
  function dupSel() {
    const pl = PL(), ids = sels(); if (!pl || !ids.length) return; if (!ed.editing) { ctx.toast('Turn on Edit Layout to copy pieces.'); return; }
    if (!ids.every(id => T.editable(T.viewOf(pl), pl.elements.find(e => e.id === id)))) { ctx.toast('That layer is locked.'); return; }
    if (ownPiece(pl, ids)) return;
    let r = null; const n = ed.undo.length; change(x => { r = T.dupPieces(x, ids, { newId: uid }); x.elements = r.elements; for (const id of r.all) { const e = x.elements.find(q => q.id === id); if (e) makeRoom(e); } });
    if (!r?.ids.length) return; ed.sel = r.ids[0]; ed.multi = r.ids.length > 1 ? r.ids : []; ed.shape = null; draw(); panel();
    const what = ids.length > 1 ? plural(ids.length, 'piece') : ED.labelOf(pl.elements.find(e => e.id === r.ids[0]));
    ctx.toast((r.blocked ? 'No clear spot near: the copy overlaps (in red). Drag it somewhere clear.' : 'Copied ' + what + '.'), { action: { label: 'Undo', run: () => { if (ed && ed.undo.length === n + 1) undo(true); } } }); if (!r.blocked) autoRefit('Copied', what);
  }
  function readout(e) {
    const el = card.querySelector('#spRead'); if (!el || !e) return;
    const sq = e.kind === 'building' && (e.use || SP.normalizeProgram(PL()?.program).use) === 'storage' ? SP.storageOf([{ ...e, use: 'storage' }], SP.normalizeProgram(PL()?.program)) : null; // storage: what it rents
    const pp = SP.normalizeProgram(PL()?.program), ftb = e.kind === 'building' && (e.use || pp.use) === 'foodtrucks' ? SP.ftKind(e) : null; // a food truck park: what each piece holds
    if (SP.isRing(e) || SP.isLoop(e)) { const isl = SP.islandOf(e); el.textContent = SP.isRing(e) ? 'Roundabout · ' + f0(2 * SP.ringOf(e).R) + ' ft across · ' + f0(e.width) + ' ft lane · ' + f0(SP.elArea(e)) + ' sf paving' : 'One way · ' + f0(e.width) + ' ft lane' + (isl ? ' · island ' + f0(SP.ringArea(isl)) + ' sf' : ''); }
    else if (e.kind === 'drive' && e.net && PL()?.recipe?.net) el.textContent = e.bulb ? 'Cul-de-sac · ' + f0(2 * Math.max(...SP.shapeOf(e).map(p => Math.hypot(p[0] - e.x, p[1] - e.y)))) + ' ft across · ' + f0(SP.elArea(e)) + ' sf paving' : (e.coll ? 'Collector' : 'Street') + ' · ' + f0(e.width || 28) + ' ft pavement · ' + f0(SP.elArea(e)) + ' sf paving' + (ed.editing ? ' · Edit Shape bends it' : ''); // (a neighbourhood street: what it is, not "drag to move it")
    else if (e.kind === 'foodtruck') el.textContent = 'Food truck stall · ' + f0(e.w) + ' × ' + f0(e.d) + ' ft · power and water pedestal · ' + (pp.foodtrucks?.perTruck ?? SP.FOODTRUCK.perTruck) + ' parking spaces';
    else if (ftb) el.textContent = f0(SP.gfaOf(e)) + ' sf' + (ftb === 'pavilion' ? ' covered · ~' + f0(SP.gfaOf(e) / SP.FOODTRUCK.seatSf) + ' seats at picnic tables' : ftb === 'bar' ? ' · ' + f0(SP.gfaOf(e) / 1000 * pp.ratio) + ' parking spaces' : ' restrooms');
    else el.textContent = e.kind === 'canopy' ? (e.pumps || 0) + ' pumps · ' + 2 * (e.pumps || 0) + ' fueling positions · ' + f0(SP.elArea(e)) + ' sf canopy (no floor area)' : e.kind === 'tanks' ? 'Underground fuel tanks · ' + f0(SP.elArea(e)) + ' sf pad, kept clear for the fuel truck' : e.kind === 'parking' && e.vac ? SP.stalls(e).count + ' air / vacuum stalls (not counted as parking)' : sq ? f0(SP.gfaOf(e)) + ' sf' + ((e.floors || 1) > 1 ? ' over ' + e.floors + ' floors' : '') + (sq.nrsf ? ' · ' + f0(sq.nrsf) + ' sf rentable · ~' + f0(sq.units) + ' units' : '') : e.kind === 'building' ? f0(SP.footArea(e)) + ' sf footprint · ' + f0(SP.gfaOf(e)) + ' sf total' : e.kind === 'parking' && e.rv ? SP.stalls(e).count + ' RV / boat spaces (' + (e.sw || 12) + ' × ' + (e.sd || 40) + ' ft)' : e.kind === 'parking' ? SP.stalls(e).count + ' spaces (' + (e.sw || SP.STALL.w) + ' × ' + (e.sd || SP.STALL.d) + ' ft stalls, ' + (e.sa || SP.STALL.aisle) + ' ft aisles)' : e.kind === 'pond' ? (SP.elArea(e) / 43560).toFixed(2) + ' acres' : f0(SP.elArea(e)) + ' sf' + (SP.isFree(e) ? ' · drag to move it' : '');
    for (const k of ['w', 'd']) { const i = card.querySelector('[data-e="' + k + '"]'); if (i && document.activeElement !== i) i.value = Math.round(e[k]); }
    const ac = card.querySelector('[data-e="across"]'); if (ac && SP.isRing(e) && document.activeElement !== ac) ac.value = Math.round(2 * SP.ringOf(e).R);
    const r = card.querySelector('[data-e="rot"]'); if (r && document.activeElement !== r) r.value = turnVal(e);
    if (!drag) nums();
  }
  function wireSel(e) {
    if (!card.querySelector('#spSel')) return; // (the Selected box is in the Layout stage only)
    if (e && sels().length > 1) { wireMulti(); return; }
    if (!e) return; readout(e);
    card.querySelectorAll('[data-e]').forEach(i => i.onchange = () => { const v = +i.value; if (!isFinite(v) || i.value === '') return; const k = i.dataset.e; if (i.dataset.e === 'across' || i.dataset.e === 'width' && SP.isRing(e)) { change(() => { if (i.dataset.e === 'across') SP.resizeRing(e, v / 2); else SP.resizeRing(e, null, v); e.pinned = true; }, true); readout(e); refitSoon('Resized', ED.labelOf(e)); return; } /* (a roundabout's lane: inside the same circle, held to 14–30 ft) */ if (k === 'rot' && Math.abs(T.turnPiece(e, v).rot - (e.rot || 0)) < 0.005) return; // (the same turn typed again: nothing to undo)
      if (k === 'rot' && (T.isEntrance(e) || SP.isFree(e) && !faceted(e))) { turnEl(e, ((v - (e.rot || 0)) % 360 + 540) % 360 - 180); return; } // (a curved piece or an entrance: about its middle, SP.turnPiece)
      change(() => { if (k === 'rot') Object.assign(e, T.turnPiece(e, v)); else e[k] = k === 'floors' || k === 'units' || k === 'levels' || k === 'podium' ? Math.max(1, Math.round(v)) : k === 'r' || k === 'flare' ? Math.max(0, v) : k === 'width' ? Math.max(6, v) : Math.max(8, v); e.pinned = true; }, true); readout(e); refitSoon(k === 'rot' ? 'Turned' : undefined); });
    const ri = card.querySelector('[data-e="rot"]'); if (ri) { // Shift with the Turn field's arrows (keys or the little spinner): 15° steps
      ri.addEventListener('keydown', ev => { if (ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); ri.value = T.turnStep(+ri.value || 0, ev.key === 'ArrowUp'); ri.onchange(); } });
      ri.addEventListener('pointerdown', ev => { ri._sh = ev.shiftKey; ri._was = +ri.value || 0; }); ri.addEventListener('pointerup', () => { ri._sh = false; });
      ri.addEventListener('input', () => { if (!ri._sh) return; const v = +ri.value; if (v !== ri._was && Math.abs(v - ri._was) <= 1 + 1e-6) { ri.value = T.turnStep(ri._was, v > ri._was); ri._was = +ri.value; } }); }
    card.querySelector('#spStallDir')?.addEventListener('click', () => stallDir(e));
    card.querySelector('#spFaceB')?.addEventListener('click', () => faceB(e));
    card.querySelector('[data-shape]')?.addEventListener('change', ev => { change(() => { SP.reshape(e, ev.target.value); e.pinned = true; }); refitSoon(); });
    const up1 = card.querySelector('#spUnpin'); if (up1) up1.onclick = () => change(() => { delete e.pinned; });
    const rf = card.querySelector('#spRefit'); if (rf) rf.onclick = () => refitNow(true);
    const rl = card.querySelector('#spRelay'); if (rl) rl.onclick = () => podChange([{ op: 'relay', pod: e.pod }], 'Laying ' + ((PL().zones || []).find(q => q.pod === e.pod)?.name || 'this pod') + ' out again');
    const sw = card.querySelector('#spSwapPod'); if (sw) sw.onchange = () => { if (!sw.value) return; const zs = PL().zones || [], a = zs.find(q => q.pod === e.pod), b = zs.find(q => q.pod === sw.value); podChange([{ op: 'swap', a: e.pod, b: sw.value }], 'Swapping ' + (a?.name || 'this pod') + ' and ' + (b?.name || 'that one')); };
    card.querySelector('#spSaveLib')?.addEventListener('click', () => saveToLib(e));
    wireNet(e);
    card.querySelector('[data-type]')?.addEventListener('change', ev => { const t = anyType(ev.target.value); if (!t) return; change(() => { const keep = { id: e.id, name: e.name, rot: e.rot }; for (const k of ['poly', 'form', 'wing', 'podium', 'unitW', 'sf', 'units', 'jog', 'shape', 'storage', 'ft', 'fuel', 'custom', 'aiSized']) delete e[k]; Object.assign(e, fromAny(t, [e.x, e.y], e.rot || 0), keep, { pinned: true }); makeRoom(e); }); ed.shape = null; draw(); panel(); }); // the same spot, another building from the library
    card.querySelector('[data-use]')?.addEventListener('change', ev => setUse([e.id], ev.target.value));
    card.querySelector('[data-ftk]')?.addEventListener('change', ev => change(() => { e.ft = ev.target.value; e.note = { pavilion: 'Covered · picnic seating', bar: 'Bar · beer garden', restroom: 'Men’s · women’s · family' }[e.ft]; }));
    card.querySelector('[data-stok]')?.addEventListener('change', ev => change(() => { e.storage = ev.target.value; if (e.storage !== 'climate') e.floors = 1; e.note = SP.storageNote(e); }));
    card.querySelector('[data-fuelk]')?.addEventListener('change', ev => change(() => { e.fuel = ev.target.value; e.floors = 1; e.note = e.fuel === 'wash' ? 'Car wash' : 'Convenience store'; if (e.fuel === 'wash') e.nowalk = true; else delete e.nowalk; }));
    for (const [a, k] of [['pumps', 'pumps'], ['prows', 'rows']]) card.querySelector('[data-' + a + ']')?.addEventListener('change', ev => { change(() => { e[k] = +ev.target.value; e.note = (e.rows || 1) + ' row' + ((e.rows || 1) > 1 ? 's' : '') + ' of ' + Math.ceil((e.pumps || 0) / (e.rows || 1)) + ' pumps'; }); readout(e); });
    card.querySelector('[data-pisl]')?.addEventListener('change', ev => { const v = ev.target.value; // the islands turned: the canopy takes the size they need (kept centred), and the rest of the station re-fits round it
      change(() => { const c = SP.canopyOf(e.pumps || 8, e.rows || 1, v), along = e.w >= e.d; e.islands = v; e.w = along ? c.w : c.d; e.d = along ? c.d : c.w; e.pinned = true; }); readout(e); refitSoon('Turned', 'the pump islands'); });
    card.querySelector('[data-form]')?.addEventListener('change', ev => { if (ev.target.value === 'custom') return; change(() => { const f = ev.target.value; delete e.poly; if (f === 'bar') delete e.form; else e.form = f; if (f === 'tower') { e.podium = e.podium || 2; e.floors = Math.max(e.floors || 1, 8); } if ((f === 'L' || f === 'U') && e.d < 100) e.d = Math.min(150, e.d * 2); e.pinned = true; }); panel(); refitSoon(); });
    card.querySelector('[data-name]')?.addEventListener('change', ev => change(() => { e.name = ev.target.value.trim().slice(0, 40); }, true));
    if (card.querySelector('#spRot')) card.querySelector('#spRot').onclick = () => turnEl(e);
    card.querySelector('#spLoop')?.addEventListener('click', () => loopAt(e));
    card.querySelector('#spBlvd')?.addEventListener('click', () => { let r = null; change(x => { r = SP.makeBoulevard(x, e); if (!r.error) x.elements = r.elements; }); if (r?.error) { ctx.toast(r.error); return; } const t = [r.note, r.why].filter(Boolean).join(' '); if (t) ctx.toast(t); autoRefit('Widened', ED.labelOf(e)); });
    card.querySelector('[data-signs]')?.addEventListener('change', ev => { let why = ''; change(x => { const r = SP.refreshEntry(x, e, ev.target.value); x.elements = r.elements; why = r.why; }); if (why) ctx.toast(why); });
    const shp = card.querySelector('#spShape'); if (shp) shp.onclick = () => { // its outline as points to drag: any shape, in plan
      if (ed.shape === e.id) { ed.shape = null; draw(); panel(); return; }
      shapeOn(e); };
    const as = card.querySelector('#spAskSel'); if (as) as.onclick = () => { const ta = card.querySelector('#spChg'); if (!ta) return; ta.scrollIntoView({ block: 'center' }); ta.focus(); };
    card.querySelector('#spDup').onclick = () => dupSel();
    card.querySelector('#spDel').onclick = () => delEl(e);
  }
  // Numbers: one grid of tiles, the zoning limit beside its figure; with a Phase 2, Phase 1 and the whole site side by side
  // (parking too: what was asked for first)
  // ---------- the Waller guardrails (lib/guardrails.mjs) on the panel ----------
  // The site's jurisdiction is kept on each option (pl.jur), from the project's facts (looked up once for the site, the
  // project page's Jurisdiction & site). Inside Waller's limits or its 0.5-mile ETJ, or with the guardrails switched On
  // in Site parameters, the option is laid out and reported under them: the concept label, a classification tag on each
  // material number, the three scenarios, the land-use reconciliation, the unresolved risks and the section 10
  // checklist. Every other option shows none of it.
  const jurKey = j => j ? JSON.stringify([j.status, j.cls, j.reason, j.flood, j.road, j.water, j.utilities]) : '';
  function syncJur(p, pl) {
    if (!p || !pl || !(pl.ring?.length >= 3) || !pl.origin) return false;
    let j = null; try { const f = factsOf(p), at = SP.frame(pl.origin).toLL(SP.centroid(pl.ring)); if (!f && !pl.jur && G.milesBetween(at, G.WALLER.center) >= 8) return false; j = G.jurisdictionOf(f, at); } catch (e) { return false; } // (far from Waller with nothing looked up: nothing to keep)
    if (jurKey(j) === jurKey(pl.jur)) return false;
    pl.jur = j; if (p.plans.includes(pl)) quietSave(p); return true;
  }
  // the facts for the site: what the project has, else (near Waller only: nowhere else needs them here) looked up now,
  // and the option is drawn again if that changed it
  function guardSite(p, pl) {
    const ch = syncJur(p, pl), at = pl?.origin && pl.ring?.length >= 3 ? SP.frame(pl.origin).toLL(SP.centroid(pl.ring)) : null;
    if (p && pl && at && G.milesBetween(at, G.WALLER.center) < 8 && needSite(p)) gatherSite(p).then(() => { const pl2 = PL(); if (pl2 && pl2.id === pl.id && syncJur(P(), pl2)) { draw(); panel(); } }).catch(() => {});
    return ch;
  }
  const CLS_K = { [G.CLS.V]: 'v', [G.CLS.O]: 'o', [G.CLS.E]: 'e', [G.CLS.U]: 'u' };
  const tagH = (t, src) => { const c = t?.cls || t; return c && CLS_K[c] ? '<i class="sp-cls ' + CLS_K[c] + '" title="' + esc(c + ((src ?? t?.src) ? ': ' + (src ?? t.src) : '')) + '">' + esc(G.CLS_SHORT[c]) + '</i>' : ''; };
  // a Waller plan whose layout on the map was made for another scenario: says so, with the one-click re-layout (the
  // concept label and the guardrails' jurisdiction line aren't shown on the panel, removed Oct 22; the label stays on the
  // PDF, the drawing and the exports)
  function guardBanner(pl) {
    if (!GON(pl)) return '';
    const g = G.settingsOf(pl), sc = G.SCENARIOS[g.scenario];
    if (!(pl.recipe && pl.elements.length && pl.laidAs !== g.scenario)) return '';
    return '<div class="sp-gonly" role="note"><div class="sp-gstale">The layout on the map was made ' + (pl.laidAs ? 'for scenario ' + esc(pl.laidAs) : 'before the guardrails applied') + '. <button type="button" class="sp-link" data-gscen="' + g.scenario + '">Lay out ' + g.scenario + ' (' + esc(sc.short.toLowerCase()) + ')</button></div></div>';
  }
  // the guardrails' own settings in Site parameters: the switch on every plan; the rest when they're on
  function guardParams(pl) {
    const g = G.settingsOf(pl), on = GON(pl), J = pl.jur || {}, d = pl.params?.guard || {};
    const sel = (k, label, v, opts, o = {}) => fld(label, selCtl('data-gd="' + k + '"', opts, v), o), n = (k, label, v, step, unit, o = {}) => fld(label, numCtl('min="' + (o.min ?? 0) + '"' + (o.max != null ? ' max="' + o.max + '"' : '') + ' data-gd="' + k + '"', v, step, unit, o.ph), o);
    const auto = J.status === 'city' ? 'Auto (inside Waller: on)' : J.status === 'etj' ? 'Auto (Waller ETJ: on)' : J.status === 'unknown' ? 'Auto (not checked yet: off)' : 'Auto (not Waller: off)';
    return '<div class="sp-sub">Waller guardrails' + infoBtn('The Finishes Solutions site-planning standard for the City of Waller and its extraterritorial jurisdiction (0.5 mile past the city limits; unverified). Auto turns it on there; On tries it anywhere. ' + (J.reason || ''), 'About the Waller guardrails') + '</div><div class="sp-fg">' +
      sel('mode', 'Waller guardrails', g.mode, G.MODES.map(([k, t]) => [k, k === 'auto' ? auto : t])) +
      (on ? sel('scenario', 'Scenario laid out', g.scenario, Object.values(G.SCENARIOS).map(x => [x.id, x.id + ' · ' + x.name])) + n('factor', 'Owner factor', d.factor ?? '', 1, '%', { max: 5, ph: '5', hint: '0–5%' }) +
        sel('outfall', 'Outfall', g.outfall, G.OUTFALLS) + n('row', 'ROW reserve along frontage', d.row ?? '', 1, 'ft', { ph: '0', hint: 'C: 10 ft or more' }) +
        n('depth', 'Storage depth (avg)', d.depth ?? '', 0.5, 'ft', { min: 1, ph: String(G.WALLER.detention.depth.value) }) + n('slope', 'Side slopes', d.slope ?? '', 0.5, ': 1', { min: 2, ph: String(G.WALLER.detention.slope.value) }) : '') + '</div>';
  }
  // the scenarios A, B and C: the one on the map from its own layouts, the others laid out in the background (the
  // worker) once for each set of settings; every figure pooled as lib/guardrails.mjs bestByScenario says
  const scen = new Map(); let scenT = 0, scenOn = '';
  const scenKey = pl => RUN.hash(JSON.stringify([pl.ring, pl.front, pl.streets, pl.program, pl.setbacks, pl.zoning, { ...(pl.params || {}), guard: { ...(pl.params?.guard || {}), scenario: null } }, pl.jur, (pl.elements || []).filter(e => e.kind === 'keepout')]));
  function scenarios(pl) {
    if (!GON(pl)) return null;
    const k = scenKey(pl), cur = G.settingsOf(pl).scenario; let S0 = scen.get(k);
    if (!S0) { S0 = { runs: {}, busy: true }; scen.set(k, S0); if (scen.size > 24) scen.delete(scen.keys().next().value); }
    if (S0.busy && scenOn !== k) { scenOn = k; clearTimeout(scenT); scenT = setTimeout(() => runScen(pl.id, k), 900); }
    const mine = (ed?.variants || []).filter(v => v.elements?.length && v.laidAs === cur).slice(0, 3).map(v => ({ plan: planFor(v, pl), scenario: cur }));
    const cands = [{ plan: pl, scenario: pl.laidAs || cur, onMap: true }, ...mine, ...Object.values(S0.runs).flat()];
    const sig = k + '|' + planSig(pl) + '|' + cur + '|' + (pl.laidAs || '') + '|' + mine.length + '|' + Object.keys(S0.runs).join('');
    if (S0.sig !== sig) { S0.sig = sig; try { S0.best = G.bestByScenario(cands); } catch (e) { console.warn('scenarios', e); S0.best = {}; } }
    return { ...S0.best, busy: S0.busy, cur };
  }
  async function runScen(plid, k) {
    const S0 = scen.get(k); if (!S0) return;
    for (const s of ['A', 'B', 'C']) {
      while (ed?.run) await new Promise(r => setTimeout(r, 700)); // never ahead of the person's own layouts
      const pl = PL(); if (!pl || pl.id !== plid || scenKey(pl) !== k) { S0.busy = true; scenOn = ''; return; }
      if (S0.runs[s]) continue;
      const p2 = G.withScenario({ ...pl }, s);
      let out = []; try { out = await laid('options', p2, p2.program, { count: 3, ...koOpts(p2) }); } catch (e) { console.warn('scenario ' + s, e); }
      S0.runs[s] = out.filter(o => o.elements?.length).slice(0, 2).map(o => ({ plan: { ...p2, program: o.program || p2.program, params: o.params || p2.params, elements: o.elements }, scenario: s }));
    }
    S0.busy = false; scenOn = ''; const pl = PL(); if (pl?.id !== plid || scenKey(pl) !== k) return;
    const typing = card.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName); if (typing || drag || ed?.run) nums(); else panel(); // the overview's range too, unless someone's typing
  }
  // one click: lay the option out as scenario s (the layout on the map with your edits asks first, as always)
  function layScenario(s) {
    const pl = PL(); if (!pl || !G.SCENARIOS[s]) return;
    askReplace(() => { change(x => { x.params = { ...(x.params || {}), guard: { ...(x.params?.guard || {}), scenario: s } }; }, true); resolve({ force: true, src: '[data-gscen="' + s + '"]' }); });
  }
  const FMT = { sf: v => v ? f0(v) + ' sf' : '—', n: v => v ? f0(v) : '—', pct: v => v.toFixed(1) + '%', af: v => v ? v.toFixed(2) + ' ac-ft' : '—', ac: v => v ? (v / 43560).toFixed(2) + ' ac' : '—' };
  function guardNums(pl) {
    const sc = scenarios(pl), T = G.landTable(pl), R = G.risks(pl), C = G.checklist(pl), g = G.settingsOf(pl), Rr = G.rulesOf(pl);
    const ys = ['A', 'B', 'C'].map(k => sc?.[k]), yl = ys.filter(Boolean), lr = G.range(yl, 'leasableSf'), br = G.range(yl, 'buildingSf'), ur = G.range(yl, 'units');
    const row = (label, key, f, tag) => '<tr><th scope="row">' + label + (tag ? ' ' + tagH(tag) : '') + '</th>' + ys.map((y, i) => '<td' + (['A', 'B', 'C'][i] === sc?.cur ? ' class="on"' : '') + '>' + (y ? f(y[key], y) : sc?.busy ? '…' : '—') + '</td>').join('') + '</tr>';
    const head = '<tr><th></th>' + ['A', 'B', 'C'].map(k => { const S1 = G.SCENARIOS[k], y = sc?.[k], here = k === sc?.cur; return '<th scope="col"' + (here ? ' class="on"' : '') + ' title="' + esc(S1.name + ': ' + S1.what) + '"><b>' + k + '</b><small>' + esc(S1.short) + '</small>' + (here ? '<em' + (y && !y.onMap ? ' title="A better layout for ' + k + ' was found than the one on the map: these are its numbers. Layouts lists them all.">On the map; best shown' : '>On the map') + '</em>' : '<button type="button" class="btn sm" data-gscen="' + k + '" title="Lay the option out as ' + esc(S1.name.toLowerCase()) + '">Lay out ' + k + '</button>') + (y && !y.ok ? '<em class="neg">Doesn’t pass</em>' : y && y.from !== k ? '<em title="The best layout that fits these rules was made for scenario ' + y.from + ' (it holds this scenario’s rules too)">uses ' + y.from + '’s layout</em>' : '') + '</th>'; }).join('') + '</tr>';
    const scenH = '<div class="sp-gsec" id="spScen"><div class="sp-sub">Scenarios' + infoBtn('A: verified minimums, no owner factor. B: the Finishes base case (5% directional factor, at least 1.00 ac-ft per developed acre). C: B plus reserves for what is unresolved (ROW, flood, easement buffers, detention while the outfall is unknown). Each column is the best layout found that passes its rules; a layout made for a stricter scenario counts for a looser one.', 'About the scenarios') + (sc?.busy ? ' <span class="sp-gbusy" role="status">laying out the others…</span>' : '') + '</div>' +
      '<p class="sp-grange" id="spRange"><b>Leasable ' + esc(G.rangeText(lr, ' sf')) + '</b>' + (ur && ur.hi ? ' · ' + esc(G.rangeText(ur, ' units', x => x)) : '') + ' · building ' + esc(G.rangeText(br, ' sf')) + ' <small>(' + (lr && G.rangeText(lr) === G.rangeText({ lo: lr.hi, hi: lr.hi }) ? 'the same in all three scenarios here; survey, title, flood, outfall, utilities and access are unresolved and could still change it' : 'a range: survey, title, flood, outfall, utilities and access are unresolved') + ')</small></p>' +
      '<div class="sp-gtw"><table class="sp-gt sp-gscen">' + head + row('Building', 'buildingSf', FMT.sf) + row('Leasable', 'leasableSf', FMT.sf) + (yl.some(y => y.lots) ? row('Lots', 'lots', FMT.n, G.CLS.O) : yl.some(y => y.units) ? row('Units', 'units', FMT.n, G.CLS.U) : '') + row('Parking req.', 'parkingRequired', FMT.n, G.tagsOf(pl).parking) + row('Parking provided', 'parkingProvided', FMT.n) + row('Impervious', 'imperviousPct', FMT.pct, G.CLS.E) +
        row('Detention', 'detentionAcFt', (v, y) => FMT.af(v) + (y.detentionRate ? '<small>' + y.detentionRate.toFixed(2) + ' / ac</small>' : ''), Rr.det.cls) + row('Pond footprint', 'detentionFootprintSf', (v, y) => FMT.ac(v) + '<small>' + FMT.ac(y.detentionDrawnSf) + ' drawn</small>', G.CLS.E) + '</table></div></div>';
    const bas = (b, c) => '<small>' + esc(b) + ' ' + tagH(c) + '</small>'; // each row's basis and classification under its name
    const landH = '<details class="sp-gsec" id="spLand" open><summary class="sp-sub">Land-use reconciliation · ' + esc(G.SCENARIOS[g.scenario].id) + '</summary><div class="sp-gtw"><table class="sp-gt sp-gland"><tr><th>Metric · basis</th><th>Acres</th><th>%</th></tr>' +
      T.rows.map(r => '<tr' + (r.total || r.key === 'gross' ? ' class="tot"' : '') + '><th scope="row">' + esc(r.label) + bas(r.basis, r.cls) + '</th><td>' + (r.key === 'gross' || r.key === 'net' || !r.acres ? '' : '−') + Math.abs(r.acres).toFixed(2) + '</td><td>' + (Math.abs(r.pct) * 100).toFixed(1) + '%</td></tr>').join('') +
      T.qty.map(q => '<tr class="q"><th scope="row">' + esc(q.label) + bas(q.basis, q.cls) + '</th><td colspan="2">' + esc(q.qty) + '</td></tr>').join('') + '</table></div></details>';
    const riskH = '<details class="sp-gsec" id="spRisks" open><summary class="sp-sub">Unresolved risks · ' + R.length + '</summary><ul class="sp-grisk">' + R.map(r => '<li><b>' + esc(r.title) + '</b> ' + tagH(r.cls) + (r.stop ? ' <i class="sp-gstop">Stop condition</i>' : '') + '<span>' + esc(r.why) + '</span></li>').join('') + '</ul></details>';
    const cnt = k => C.filter(c => c.status === k).length;
    const listH = '<details class="sp-gsec" id="spCheck"' + (ed.gCheck ? ' open' : '') + '><summary class="sp-sub">Required plan content · ' + cnt('shown') + ' shown, ' + cnt('unresolved') + ' unresolved' + (cnt('na') ? ', ' + cnt('na') + ' N/A' : '') + '</summary><ul class="sp-gcl">' + C.map(c => '<li class="' + c.status + '"><i>' + (c.status === 'shown' ? 'Shown' : c.status === 'na' ? 'N/A' : 'Unresolved') + '</i><b>' + esc(c.item) + '</b><span>' + esc(c.note) + '</span></li>').join('') + '</ul></details>';
    return '<div class="sp-gnums" id="spGuardNums">' + scenH + landH + riskH + listH + '</div>';
  }
  function wireGuard() {
    card.querySelectorAll('[data-gscen]').forEach(b => b.onclick = () => layScenario(b.dataset.gscen));
    const ck = card.querySelector('#spCheck'); if (ck) ck.ontoggle = () => { ed.gCheck = ck.open; };
  }
  // AI text shown on a Waller plan: prohibited conclusions rewritten (lib/guardrails.mjs scrub)
  const KEEP_AI = new Set(['id', 'ids', 'use', 'kind', 'type', 'model', 'form', 'streets', 'storm', 'where', 'pattern', 'product', 'key']);
  const scrubDeep = v => Array.isArray(v) ? v.map(scrubDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, KEEP_AI.has(k) ? x : scrubDeep(x)])) : typeof v === 'string' ? G.scrubText(v) : v;
  // Numbers by name: each part (a mixed plan's neighbourhood, retail center, apartments…) with its acres, homes or units
  // and floor area, parts with the same name together, the community's name over it; only when there's more than one
  // part or a name
  // the sidewalks a rule sheet asks for (phase 5 draws them): its sides and width, and about how much walk the streets need
  function walkLine(pl) {
    const sw = pl.params?.code?.sidewalk; if (!sw || !pl.recipe?.net) return ''; const L = (pl.elements || []).filter(e => e.kind === 'drive' && e.net && e.path && !SP.isEntrance(e)).reduce((t, e) => t + e.path.reduce((a, q, i) => i ? a + Math.hypot(q[0] - e.path[i - 1][0], q[1] - e.path[i - 1][1]) : 0, 0), 0), k = { both: 2, one: 1, none: 0 }[sw.sides] ?? 2;
    return '<div class="rnote">Sidewalks (rule sheet): ' + RSL.valueText('sidewalk', sw.sides) + (k ? ', ' + sw.w + ' ft · about ' + f0(Math.round(L * k / 1000) * 1000) + ' ft of walk' : '') + '. Not drawn or counted in paved area yet.</div>';
  }
  function partsTable(pl, prog) {
    const ps = SP.partsOf(pl); if (ps.length < 2 && !ps.some(q => q.name)) return '';
    const rows = new Map(); for (const q of ps) { const k = (q.show || q.word) + '|' + q.use, r = rows.get(k) || { name: q.show || q.word, use: SP.USES[q.use]?.label.split(' / ')[0] || q.use, acres: 0, units: 0, gfa: 0 }; r.acres += q.acres || 0; r.units += q.units || 0; r.gfa += q.gfa || 0; rows.set(k, r); }
    return '<table class="sp-parts">' + (prog.community ? '<caption>' + esc(prog.community) + '</caption>' : '') + '<tr><th>Part</th><th>Use</th><th class="r">Acres</th><th class="r">Homes / units</th><th class="r">Floor area</th></tr>' +
      [...rows.values()].map(r => '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.use) + '</td><td class="r">' + (r.acres ? r.acres.toFixed(1) : '—') + '</td><td class="r">' + (r.units ? f0(r.units) : '—') + '</td><td class="r">' + (r.gfa ? f0(r.gfa) + ' sf' : '—') + '</td></tr>').join('') + '</table>';
  }
  // the pond depth a plan assumes, said with the detention: deeper than the usual one (a deeper-pond layout used), an
  // engineering assumption a civil engineer has to confirm
  function pondDepthNote(pl) {
    const gOn = GON(pl), d = gOn ? G.settingsOf(pl).depth : SP.stormDepth(pl.params || {}), d0 = gOn ? G.WALLER.detention.depth.value : SP.stormDepth({ code: pl.params?.code });
    return ' · ' + d + ' ft deep (assumed)' + (d > d0 + 0.5 ? ': deeper than the usual ' + d0 + ' ft, confirm with your civil engineer' : '');
  }
  function nums() {
    const el = card.querySelector('#spNums'), pl = PL(); if (!el || !pl) return;
    if (pl.ring.length < 3) { el.innerHTML = ''; return; }
    const m = GM(pl), issues = checkAll(pl), prog = SP.normalizeProgram(pl.program), z = pl.zoning || {}, ph = pl.elements.some(e => e.phase === 2), cs = CU.customStats(pl);
    const m1 = ph ? GM({ ...pl, elements: pl.elements.filter(e => e.phase !== 2) }) : null, pk = parkOf(m, m1), whole = twoPhase(m, m1);
    const la = m.gfa ? areaFor(pl) : null, la1 = la && m1 ? areaFor({ ...pl, elements: pl.elements.filter(e => e.phase !== 2) }) : null; // what's leased, as the Pro forma counts it
    const gOn = GON(pl), gT = gOn ? G.tagsOf(pl) : null, TG = k => gT ? ' ' + tagH(gT[k]) : ''; // a Waller plan: each number's classification
    const tile = (k, v, sub, cls = '') => '<div class="sp-tile' + cls + '"><span>' + k + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    const pair = (k, a, b, sub, cls = '') => '<div class="sp-tile two' + cls + '"><span>' + k + '</span><div class="sp-tv"><b>' + a + '<small>Phase 1</small></b><b>' + b + '<small>Whole site</small></b></div>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    const two = (k, f, sub, cls = '') => m1 ? pair(k, f(m1), f(m), sub, cls) : tile(k, f(m), sub, cls);
    const max = (v, lim, fmt) => +lim ? ' <span class="sc' + (v > +lim ? ' over' : '') + '">/ max ' + fmt(+lim) + '</span>' : '';
    const ratioAt = cs ? 'the AI’s rule' : prog.use === 'foodtrucks' ? prog.foodtrucks.perTruck + ' / truck + ' + prog.ratio + ' / 1,000 sf of bar' : new Set(pl.elements.filter(e => e.kind === 'building').map(e => e.use || prog.use)).size > 1 ? 'each use’s ratio' : prog.use === 'multifamily' ? prog.perUnit + '/unit' : prog.ratio + '/1,000 sf';
    const homes = pl.elements.filter(e => e.kind === 'building' && e.use === 'sfr'), byStory = [1, 2, 3].map(n => [n, homes.filter(e => e.floors === n).length]).filter(([, c]) => c);
    const pSub = (m.gfa ? 'needed at ' + ratioAt + ' · ' : '') + (m.units ? m.perUnit.toFixed(2) + ' / unit' : m.per1k.toFixed(1) + ' / 1,000 sf') + (m.garages ? ' · ' + f0(m.garages) + ' in garages' : '') + (m.driveways ? ' · ' + f0(m.driveways) + ' on driveways' : ''), pBad = m.gfa && pk.stalls < pk.need ? ' bad' : '';
    el.innerHTML = '<div class="lt">Numbers' + infoBtn((whole ? 'Phase 1 is what was asked for; the whole site includes Phase 2. Paving and ponds are counted for the whole site. ' : '') + 'A planning sketch from the parcel outline: not a survey, and no engineering (grading, utilities, fire lanes, code review).', 'About these numbers') + '</div><div class="sp-tiles">' +
      tile('Site' + TG('site'), m.acres.toFixed(2) + ' ac', f0(m.siteSf) + ' sf') +
      two('Gross building' + TG('gfa'), x => x.gfa ? f0(x.gfa) + ' sf' : '—', m.gfa ? plural(m.buildings, 'building') : '') +
      (la && (la.nrsf || !la.keys) ? two('Leasable / rentable', x => (x === m1 ? la1 : la)?.nrsf ? f0((x === m1 ? la1 : la).nrsf) + ' sf' : '—', la.nrsf && la.gsf ? pct(la.nrsf / la.gsf) + ' of gross · ' + leasableWhy(la) : la.keys ? '' : 'nothing leased') : '') +
      (SP.lsfOf(m) > 0 ? tile('Leasable + sellable', f0(SP.lsfOf(m)) + ' sf', [m.leasable > 0 ? f0(m.leasable) + ' sf to lease' : '', m.sellable > 0 ? f0(m.sellable) + ' sf of homes to sell' : ''].filter(Boolean).join(' · ') + ' · what the layouts are ranked by') : '') + // the owner's goal (lib/siteplan.mjs lsfOf)
      (la?.keys ? tile('Hotel keys', f0(la.keys), 'about ' + f0(la.uses.hotel.gsf / la.keys) + ' gross sf a key') : '') +
      (m.units ? two('Units' + TG('units'), x => f0(x.units || 0), m.duAc.toFixed(1) + ' per acre' + (m.beds ? ' · ' + f0(m.beds) + ' beds' : '')) : '') +
      (m.fuel ? tile('Fuel', f0(m.fuel.positions) + ' positions', m.fuel.mpds + ' pumps · ' + f0(m.fuel.canopySf) + ' sf canopy · ' + f0(m.fuel.storeSf) + ' sf store' + (m.fuel.washSf ? ' · car wash' : '') + (m.fuel.vac ? ' · ' + m.fuel.vac + ' air / vac' : '')) : '') +
      (cs ? customTile(cs, tile) : '') + (m.storage && !cs ? two('Storage', x => x.storage ? f0(x.storage.nrsf) + ' sf' : '—', 'rentable · ~' + f0(m.storage.units) + ' units (' + f0(m.storage.climateUnits) + ' climate, ' + f0(m.storage.driveUnits) + ' drive-up)' + (m.storage.rv ? ' · ' + m.storage.rv + ' RV / boat' : '')) : '') +
      (m.foodtrucks ? tile('Food trucks', f0(m.foodtrucks.trucks), '~' + f0(m.foodtrucks.seats) + ' seats (covered and patio)') + tile('Park buildings', f0(m.foodtrucks.pavilionSf) + ' sf pavilion', f0(m.foodtrucks.restroomSf) + ' sf restrooms · ' + (m.foodtrucks.barSf ? f0(m.foodtrucks.barSf) + ' sf bar' + (m.foodtrucks.patioSf ? ' + ' + f0(m.foodtrucks.patioSf) + ' sf patio' : '') : 'no bar')) : '') +
      (whole ? pair('Parking (spaces / needed)' + TG('parking'), f0(pk.stalls) + ' / ' + f0(pk.need), f0(m.spaces) + ' / ' + f0(m.required), pSub, pBad) : tile('Parking' + TG('parking'), f0(m.spaces) + ' / ' + f0(m.required), pSub, pBad)) +
      two('Coverage' + TG('coverage'), x => pct(x.coverage) + (x === m ? max(m.coverage * 100, z.max_coverage_pct, v => v + '%') : ''), '', +z.max_coverage_pct && m.coverage * 100 > +z.max_coverage_pct ? ' bad' : '') +
      two('FAR' + TG('far'), x => x.far.toFixed(2) + (x === m ? max(m.far, z.max_far, v => String(v)) : ''), '', +z.max_far && m.far > +z.max_far ? ' bad' : '') +
      tile('Detention' + TG('detention'), m.pond ? (m.pond / 43560).toFixed(2) + ' ac' : '—', m.pond ? pct(m.pond / m.siteSf) + ' of the site' + pondDepthNote(pl) : '') +
      tile('Paved + roofs' + TG('impervious'), pct(m.impervious)) + tile('Open space' + TG('open'), pct(m.green)) +
      (m.heightFt ? tile('Height' + TG('height'), 'about ' + m.heightFt + ' ft', +z.max_building_height_ft ? 'max ' + z.max_building_height_ft + ' ft' : '', +z.max_building_height_ft && m.heightFt > +z.max_building_height_ft ? ' bad' : '') : '') + '</div>' +
      (m.mix.length ? '<table class="sp-mixt"><tr><th>Unit</th><th>SF</th><th>Units</th><th>%</th><th>Net sf</th></tr>' + m.mix.map(t => '<tr><td>' + esc(t.name) + '</td><td>' + f0(t.sf) + '</td><td>' + f0(t.n) + '</td><td>' + pct(t.n / Math.max(1, m.mix.reduce((s, x) => s + x.n, 0))) + '</td><td>' + f0(t.n * t.sf) + '</td></tr>').join('') + '</table>' : '') +
      (m.storage?.units ? storageTable(m.storage, prog) : '') +
      partsTable(pl, prog) +
      (byStory.length ? '<table class="sp-mixt"><tr><th>Home</th><th>Living sf</th><th>Homes</th></tr>' + byStory.map(([n, c]) => '<tr><td>' + n + '-story</td><td>' + f0(SP.HOME_TYPES[n].sf) + '</td><td>' + c + '</td></tr>').join('') + '</table>' : '') +
      (cs ? customBlock(cs) : '') + walkLine(pl) +
      (issues.length ? '<ul class="sp-issues">' + issues.map(i => '<li class="' + i.level + '">' + esc(i.text) + '</li>').join('') + '</ul>' : m.gfa ? '<div class="rnote sp-ok">Fits the setbacks' + (m.spaces >= m.required ? ' and parks' : '') + (gOn ? ', within the planning checks' : '') + '.</div>' : '') +
      (gOn ? guardNums(pl) : '');
    el.querySelector('#spSaveType')?.addEventListener('click', saveTypeToLib); if (gOn) wireGuard();
  }
  // the basis of a plan's leasable area in a few words: one use's own, or 'by use'
  const leasableWhy = a => { const k = Object.keys(a.uses).filter(u => u !== 'amenity' && a.uses[u].gsf > 0); return k.length === 1 ? a.uses[k[0]].basis || '' : 'by use, as the Pro forma counts it'; };
  // an AI-crafted type in Numbers: its figures, what was drawn of its outdoor pieces or sites, its parking rule and the
  // AI's assumptions, and Save to Library
  function customTile(cs, tile) {
    const drawn = cs.recipe.pattern === 'yard' ? [plural(cs.sites, cs.recipe.sites.label.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase())) + (cs.sites < cs.recipe.sites.count ? ' of ' + cs.recipe.sites.count : '')] : cs.outdoor.map(o => (o.count < o.asked ? o.count + ' of ' + o.asked : o.count) + ' ' + o.label.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase()));
    return tile(esc(cs.name) + ' <i class="sp-ais" title="' + esc(AIS_TIP) + '">AI-sized</i>', esc(cs.figures[0] || drawn[0] || cs.name), esc([...cs.figures.slice(1), ...drawn].join(' · ')), ' wide');
  }
  function customBlock(cs) {
    const r = cs.recipe;
    return '<div class="sp-custom" id="spCustom"><div class="sp-sub">' + esc(cs.name) + ' · an AI-crafted type</div><ul class="sp-cu">' +
      '<li>Laid out as ' + esc(cs.pattern.toLowerCase()) + '; the buildings' + (r.outdoor.length ? ', outdoor pieces' : '') + (r.sites ? ', sites' : '') + ' and parking rule are the AI’s, from typical practice.</li>' +
      '<li><b>Parking rule:</b> ' + esc(cs.rule.text) + '.</li>' + r.assumptions.map(a => '<li>' + esc(a) + '</li>').join('') + (r.fixed.length ? '<li>Brought into range: ' + esc(r.fixed.join(', ')) + '.</li>' : '') + '</ul>' +
      '<div class="sp-row"><button type="button" class="btn sm" id="spSaveType" title="Keep this type, with its recipe, in the team library: everyone on the team can add it, and the AI can build another from it">Save to Library</button></div></div>';
  }

  // storage units by size: each mix split by count over its rentable area
  function storageTable(q, prog) {
    const st = prog.storage || {}, rows = [];
    for (const [k, label, n] of [['climate', 'Climate', q.climateUnits], ['drive', 'Drive-up', q.driveUnits]]) { const mix = st[k + 'Mix'] || SP.STORAGE_MIX[k], tot = mix.reduce((s, t) => s + +t.pct, 0) || 1; if (n) for (const t of mix) if (+t.pct > 0) rows.push([label, t.name, t.sf, Math.round(n * t.pct / tot)]); }
    return '<table class="sp-mixt"><tr><th>Storage</th><th>Size</th><th>SF</th><th>Units</th></tr>' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + esc(r[1]) + '</td><td>' + f0(r[2]) + '</td><td>' + f0(r[3]) + '</td></tr>').join('') + '</table>';
  }
  // ---------- pro forma ----------
  const PROFIT_TIP = 'What the equity investors net: rent collected through the hold, less loan payments and interest, plus the sale price after sale costs and the loan payoff, less the equity put in. It isn’t the stabilized value minus the cost.';
  const landGuess = (p, pl) => { const recs = (pl.parcels || (pl.parcel ? [pl.parcel] : [])).map(k => p.parcels.find(x => x.key === k)).filter(Boolean), v = recs.map(r => r.marketValue || r.landValue);
    return recs.length && v.every(x => +x > 0) ? Math.round(v.reduce((s, x) => s + +x, 0)) : null; };
  const pfMerge = (d, o) => { const out = { ...d }; for (const [k, v] of Object.entries(o || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(d[k] || {}), ...v } : v; return out; };
  function pfRun(p, pl) { if (!pl.elements.some(e => e.kind === 'building')) return null; const e = G.effective(pl), d = PF.defaults(e, landGuess(p, pl)); return PF.run(e, pfMerge(d, pl.pf)); } // (a Waller plan: priced with its scenario's parking and detention)
  // what a box takes (outside it, the number isn't applied); efficiencies are typed as percents, kept as fractions
  const PF_LIM = { exitCap: [0.5, 20], marketCap: [0.5, 20], vacancyPct: [0, 100], creditPct: [0, 100], softPct: [0, 100], contPct: [0, 100], feePct: [0, 100], lcPct: [0, 100], recoveryPct: [0, 100], mgmtPct: [0, 100], ltc: [0, 100], taxPct: [0, 20], taxBasisPct: [0, 100], rate: [0, 30], permRate: [0, 30], amort: [1, 60], hold: [0, 30], landPrice: [0, null], 'hotel.occ': [0, 100], 'hotel.opexPct': [0, 100], 'hotel.otherPct': [0, 100] };
  const pfPct = k => /^eff\./.test(k), pfLim = k => PF_LIM[k] || (pfPct(k) ? [40, 100] : /^load\./.test(k) ? [1, 1.6] : /Growth$/.test(k) ? [-20, 20] : [0, null]);
  // a plan's leasable area as the Pro forma reads it (its efficiencies, with any the user set)
  const areaFor = x => { try { const user = PL()?.pf || {}; return PF.areaOf(PF.metricsOf(x), pfMerge(PF.defaults(x), user), user); } catch (e) { console.warn('leasable area', e); return null; } };
  function pfHtml(p, pl) {
    let R = null; try { R = pfRun(p, pl); } catch (e) { console.warn('pro forma', e); }
    if (!R) return '<details class="bsec sp-pf" id="spPfSec"><summary class="lt">Pro forma</summary><div class="rnote">Lay out a plan first (Build Layouts or by hand); the pro forma reads its buildings, units and parking.</div></details>';
    const A = R.A, $m = $M, xm = v => v == null || !isFinite(v) ? 'n/a' : v.toFixed(2) + 'x', pc2 = v => v == null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(2) + '%';
    const notes = Object.fromEntries((R.warnings || []).filter(w => w.level === 'note').map(w => [w.key, w.text])), flags = (R.warnings || []).filter(w => w.level === 'flag');
    const tagOf = k => (PF.BASIS[R.basis?.inputs?.[k]] || PF.BASIS.market).label, big = k => k === 'landPrice' || k === 'lotCost'; // the numbers a box takes; big dollar amounts show with their commas
    const pfCtl = (k, v, step, unit) => { const [lo, hi] = pfLim(k);
      return (big(k) ? '<span class="sp-ctl"><input type="text" inputmode="numeric" data-pf="' + k + '" value="' + (v == null ? '' : f0(v)) + '"></span>' : numCtl('data-pf="' + k + '" min="' + lo + '"' + (hi != null ? ' max="' + hi + '"' : ''), v, step, unit)) + '<small class="sp-inerr" role="alert" hidden></small>' + (notes[k] ? '<small class="sp-pfnote">' + esc(notes[k]) + '</small>' : ''); };
    // an assumption: a short unit in the box ("%", "mo"), a long one ("$ / gross sf") under it; its basis on hover
    const inp = (k, label, v, step, unit = '') => unit.length > 5 || big(k) ? fld(label, pfCtl(k, v, step, ''), { hint: unit || undefined, tip: tagOf(k) }) : fld(label, pfCtl(k, v, step, unit), { tip: tagOf(k) });
    const pinp = (k, label, v) => inp(k, label, v == null ? null : Math.round(v * 1000) / 10, 0.5, '%'); // a share, typed as a percent
    const card1 = (k, v, sub, bad, subBad, tip) => '<div class="sp-card"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><span>' + k + '</span><b' + (bad ? ' class="neg"' : '') + '>' + v + '</b>' + (sub ? '<small' + (subBad ? ' class="neg"' : '') + '>' + sub + '</small>' : '') + '</div>', uses = Object.keys(R.P.uses), res = R.returns, S1 = R.simple, simpleOn = A.method === 'simple';
    const homes = uses.some(u => ['townhomes', 'duplex', 'sfr'].includes(u)), mf = uses.includes('multifamily'), units = R.P.units || 0, NNNU = uses.filter(u => A.commRent?.[u] != null), noRent = !R.forSale && res.yoc == null;
    const sch = R.sched, seg = (n, cls, t) => n > 0 ? '<i class="' + cls + '" style="flex:' + n + '" title="' + t + ': ' + n + ' months">' + n + '</i>' : '';
    const ar = R.area, rows = Object.entries(ar.byUse).filter(([, u]) => u.gross > 0), sto = R.P.uses.storage, b = R.budget;
    const areaT = '<table class="sp-mixt sp-pfarea"><tr><th>Area</th><th>Gross building sf</th><th>Leasable / rentable sf</th></tr>' + rows.map(([k, u]) => '<tr><td>' + esc(SP.USES[k]?.label || k) + '<small>' + esc(u.basis || '') + '</small></td><td>' + f0(u.gross) + '</td><td>' + (k === 'hotel' ? f0(u.keys) + ' keys' : k === 'amenity' ? '—' : f0(u.leasable)) + '</td></tr>').join('') +
      (rows.length > 1 ? '<tr><td><b>Total</b></td><td><b>' + f0(ar.gross) + '</b></td><td><b>' + f0(ar.leasable) + '</b>' + (ar.keys ? ' + ' + f0(ar.keys) + ' keys' : '') + '</td></tr>' : '') + '</table>' +
      '<div class="rnote sp-1l">Rent and the yield are on the leasable area, ' + (ar.gross ? pct(ar.leasable / ar.gross) + ' of the gross' : 'not the gross') + '.' + infoBtn('Shops lease about 97% of the building (NNN); offices and medical lease rentable sf: the usable share of the building times a load factor for the common areas; apartments the units’ net sf from the unit mix; self storage the units’ net rentable sf; a hotel runs on its keys. Change the shares under Assumptions.', 'About leasable area') + '</div>';
    return '<details class="bsec sp-pf" id="spPfSec"' + (ed.pfOpen !== false && stageNow() === 'proforma' || ed.pfOpen ? ' open' : '') + '><summary class="lt">Pro forma</summary>' +
      '<div class="sp-row"><button type="button" class="btn sm primary" id="spPfX" title="Assumptions, the one-page pro forma with live formulas, the month-by-month model and the budget">Pro Forma (Excel)</button><button type="button" class="btn sm ghost" id="spPfReset">Reset to Defaults</button></div>' +
      '<div class="sp-fg">' + fld('Method', '<select data-pfs="method"><option value="schedule"' + (simpleOn ? '' : ' selected') + '>Month by month, with the schedule</option><option value="simple"' + (simpleOn ? ' selected' : '') + '>TestFit method (annual, no schedule)</option></select>', { wide: !(homes && !mf) }) +
        (homes && !mf ? tog('data-pfb="forSale"', 'Homes for sale (not rent)', A.forSale) : '') + '</div>' +
      '<div class="sp-sched" title="Schedule in months">' + seg(sch.pre, 'pre', 'Pre-development') + seg(sch.build, 'bld', 'Construction') + seg(sch.lease, 'lease', R.forSale ? 'Sales' : 'Lease-up') + seg(sch.total - sch.toStabilize, 'hold', 'Hold') + '</div>' +
      '<div class="sp-schl"><span><i class="pre"></i>Design &amp; permits ' + sch.pre + ' mo</span><span><i class="bld"></i>Construction ' + sch.build + ' mo</span><span><i class="lease"></i>' + (R.forSale ? 'Sales ' : 'Lease-up ') + sch.lease + ' mo</span>' + (R.forSale ? '' : '<span><i class="hold"></i>Sale at month ' + sch.total + '</span>') + '</div>' +
      (simpleOn ? '<div class="sp-cards">' + card1('Total cost', $m(S1.cost)) + card1('NOI', $m(S1.noi)) + card1('Yield on cost', pc2(S1.yoc)) + card1('Value', $m(S1.value)) + card1('Unlevered IRR', pc2(S1.unlevIrr)) + card1('Levered IRR', pc2(S1.levIrr)) + card1('Equity multiple', xm(S1.multiple)) + card1('DSCR', xm(S1.dscr)) + '</div>' +
        '<div class="rnote sp-warn sp-1l">TestFit’s one-page method overstates returns.' + infoBtn('All the money goes in at year 0 and full rents start in year 1, with no construction period, interest or lease-up. The month-by-month method on the same plan ' + (res.levIrr != null && isFinite(res.levIrr) ? 'gives a levered IRR of ' + pc2(res.levIrr) : 'has no positive cash flow to compute an IRR') + '.', 'About the TestFit method') + '</div>'
      : '<div class="sp-cards">' + card1('Total cost', $m(R.budget.total), units ? $m(R.budget.total / units) + ' / unit' : ar.keys && !ar.leasable ? $m(R.budget.total / ar.keys) + ' / key' : $m(R.budget.total / Math.max(1, R.P.gsf)) + ' / gross sf') +
        (R.forSale ? card1('Home sales', $m(R.exit.sales)) + card1('Margin', pc2(res.margin), '', res.margin < 0) : noRent ? card1('Stabilized NOI', '—', 'no rent') : card1('Stabilized NOI', $m(R.ops.noi), ar.leasable ? $m(R.ops.noi / ar.leasable) + ' / leasable sf' : '') + card1('Yield on cost', pc2(res.yoc), 'spread ' + pc2(res.spread), res.yoc < 0, res.spread < 0) + card1('Stabilized value', $m(res.value))) +
        (noRent ? '' : card1('Profit after hold &amp; sale', $m(res.profit), '', res.profit < 0, false, PROFIT_TIP) + card1('Unlevered IRR', pc2(res.unlevIrr)) + card1('Levered IRR', pc2(res.levIrr)) + card1('Equity multiple', res.multiple ? xm(res.multiple) : 'n/a') + card1('Peak equity', $m(res.peakEquity)) + (res.dscr ? card1('DSCR', xm(res.dscr)) : '')) + '</div>' +
        (noRent ? '<div class="rnote sp-1l">No rent in this plan: ' + (uses.includes('church') ? 'a church is usually built for its own congregation, so this is its budget. Enter a rent under Assumptions to see it as a lease.' : 'this is its budget.') + '</div>' : '<div class="rnote sp-1l">TestFit method: ' + (S1.levIrr != null && isFinite(S1.levIrr) ? pc2(S1.levIrr) + ' levered' : 'no IRR') + infoBtn('The TestFit one-page method on the same numbers skips the ' + sch.toStabilize + ' months before the project is stabilized, so it reads higher.', 'About the TestFit method') + '</div>')) +
      (flags.length ? '<ul class="sp-pfflags">' + flags.map(w => '<li>' + esc(w.text) + '</li>').join('') + '</ul>' : '') +
      '<div class="rnote sp-pfbasis"><span class="sp-tag" title="' + esc(PF.BASIS.market.tag) + '">' + esc(PF.BASIS.market.label) + '</span> ' + esc(PF.DISCLAIMER) + '</div>' + areaT +
      '<table class="sp-mixt"><tr><th>Budget</th><th>Amount</th><th>' + (units ? 'Per unit' : 'Per gross sf') + '</th></tr>' + [['Land', b.land], ['Hard costs', b.hard], ['Hotel FF&amp;E', b.ffe], ['Site work &amp; parking', b.site], ...(b.deck > 0 ? [['· incl. ' + f0(R.M.deck) + ' spaces in a parking garage', b.deck]] : []), ...(b.siteParts?.pond > 0 ? [['· incl. ' + b.pondAcFt.toFixed(1) + ' ac-ft detention pond', b.siteParts.pond]] : []), ...(b.storm > 0 ? [['· incl. ' + b.vaultAcFt.toFixed(1) + ' ac-ft underground storage', b.storm]] : []), ['Tenant improvements', b.ti], ['Leasing commissions', b.lc], ['Soft costs', b.soft], ['Contingency', b.cont], ['Developer fee', b.fee], ['Construction interest', b.interest], ['Loan fees', b.loanFees], ['Total', b.total]].filter(([, v]) => v > 0).map(([k, v]) => '<tr><td>' + k + '</td><td>' + $m(v) + '</td><td>' + $m(units ? v / units : v / Math.max(1, R.P.gsf)) + '</td></tr>').join('') + '</table>' +
      (R.forSale || noRent ? '' : '<table class="sp-mixt"><tr><th>Stabilized year</th><th>Amount</th></tr>' + R.ops.lines.map(l => '<tr><td>' + esc(l.k) + '</td><td>' + $m(l.v) + '</td></tr>').join('') +
        '<tr><td>Vacancy &amp; credit loss</td><td>' + $m(-R.ops.loss) + '</td></tr><tr><td>Operating expenses (taxes ' + $m(R.ops.tax) + ')</td><td>' + $m(-R.ops.opex) + '</td></tr><tr><td><b>Net operating income</b></td><td><b>' + $m(R.ops.noi) + '</b></td></tr></table>') +
      '<div class="sp-sub">Assumptions <span class="sp-tag">' + esc(PF.BASIS.market.label) + '</span>' + infoBtn('Typical 2026 Houston, Katy and Waller numbers to start with, each with its basis: market assumptions, not verified, and not quotes. Check costs with a contractor and rents with a market study. A note shows under any number outside the usual range here.', 'About these assumptions') + '</div><div class="sp-fg">' +
        inp('landPrice', 'Land price ($)', A.landPrice, 10000, pl.pf?.landPrice != null ? '' : landGuess(p, pl) ? 'appraised value' : 'about $' + Math.round(A.landPerAc / 1000) + 'k/ac; set yours') +
        uses.filter(u => u !== 'storage').map(u => inp('hard.' + u, SP.USES[u].label + ' hard cost', A.hard[u], 1, '$ / gross sf')).join('') +
        (sto ? (sto.climateGsf ? inp('storageHard.climate', 'Climate-controlled hard cost', A.storageHard.climate, 1, '$ / gross sf') : '') + (sto.driveGsf ? inp('storageHard.drive', 'Drive-up hard cost', A.storageHard.drive, 1, '$ / gross sf') : '') + (sto.officeGsf ? inp('storageHard.office', 'Storage office hard cost', A.storageHard.office, 1, '$ / gross sf') : '') : '') +
        ['retail', 'restaurant', 'office', 'medical', 'industrial', 'church', 'other'].filter(u => uses.includes(u) && A.eff?.[u] != null).map(u => pinp('eff.' + u, SP.USES[u].label + (u === 'office' || u === 'medical' ? ' usable share' : ' leasable share'), A.eff[u]) + (A.load?.[u] ? inp('load.' + u, SP.USES[u].label + ' load factor', A.load[u], 0.01, 'rentable ÷ usable') : '')).join('') +
        (sto ? (sto.climateGsf ? pinp('eff.storageClimate', 'Climate rentable share', A.eff.storageClimate) : '') + (sto.driveGsf ? pinp('eff.storageDrive', 'Drive-up rentable share', A.eff.storageDrive) : '') : '') +
        (homes ? inp('lotCost', 'Lot development ($)', A.lotCost, 1000, '$ / home lot') : '') + inp('sitePrepPsf', 'Site prep', A.sitePrepPsf, 0.25, '$ / developed sf') + inp('pavingPsf', 'Paving', A.pavingPsf, 0.25, '$ / sf of drives') + inp('stallCost', 'Parking', A.stallCost, 50, '$ / surface space') +
        (R.M.deck ? inp('deckPerSpace', 'Parking garage', A.deckPerSpace, 500, '$ / space') : '') + (b.pondAcFt > 0 ? inp('pondPerAcFt', 'Detention pond', A.pondPerAcFt, 1000, '$ / acre-foot') : '') + (b.storm > 0 ? inp('vaultPerAcFt', 'Underground storage', A.vaultPerAcFt, 5000, '$ / acre-foot') : '') +
        NNNU.filter(u => A.ti?.[u] != null).map(u => inp('ti.' + u, SP.USES[u].label + ' TI', A.ti[u], 1, '$ / leasable sf')).join('') + (NNNU.length ? inp('lcPct', 'Leasing commissions', A.lcPct, 0.25, '% of lease rent') : '') +
        inp('softPct', 'Soft costs', A.softPct, 0.5, '%') + inp('contPct', 'Contingency', A.contPct, 0.5, '%') + inp('feePct', 'Developer fee', A.feePct, 0.5, '%') +
        Object.entries(A.rents).map(([k, v]) => inp('rents.' + k, k + ' rent', v, 5, '$ / month')).join('') +
        (homes ? (A.forSale ? inp('salePsf.sfr', 'Home price', A.salePsf.sfr, 1, '$ / living sf') + inp('absorption', 'Sales pace', A.absorption, 1, 'homes / month') : (R.P.uses.sfr ? [1, 2, 3].filter(n => R.P.uses.sfr.homes?.[n]).map(n => inp('homeRent.sfr' + n, n + '-story home rent', A.homeRent['sfr' + n], 25, '$ / month')).join('') : '') + ['townhomes', 'duplex'].filter(k => R.P.uses[k]).map(k => inp('homeRent.' + k, SP.USES[k].label + ' rent', A.homeRent[k], 25, '$ / month')).join('')) : '') +
        NNNU.map(k => inp('commRent.' + k, SP.USES[k].label + ' rent', A.commRent[k], 0.5, '$ / leasable sf / yr NNN')).join('') +
        (A.outdoorRent != null ? inp('outdoorRent', 'Courts / pool rent', A.outdoorRent, 0.25, '$ / sf / yr, paid by the operator') : '') +
        (sto ? (sto.climateGsf ? inp('storageRent.climate', 'Climate-controlled rent', A.storageRent.climate, 0.05, '$ / sf / month') : '') + (sto.driveGsf ? inp('storageRent.drive', 'Drive-up rent', A.storageRent.drive, 0.05, '$ / sf / month') : '') + (sto.rv ? inp('storageRent.rv', R.M.custom ? esc(R.M.custom) + ': a site’s rent' : 'RV / boat space rent', A.storageRent.rv, 5, '$ / space / month') + inp('storageRent.rvOpex', 'Costs a space', A.storageRent.rvOpex, 10, '$ / space / yr') : '') : '') +
        (A.hotel && R.P.uses.hotel ? inp('hotel.adr', 'Hotel ADR', A.hotel.adr, 1, '$ a room night') + inp('hotel.occ', 'Occupancy', A.hotel.occ, 0.5, '%') + inp('hotel.otherPct', 'Other hotel revenue', A.hotel.otherPct, 0.5, '% of rooms') + inp('hotel.opexPct', 'Hotel operating costs', A.hotel.opexPct, 0.5, '% of revenue') + inp('hotel.ffePct', 'FF&E reserve', A.hotel.ffePct, 0.5, '% of revenue') + inp('hotel.ffeKey', 'FF&E at opening', A.hotel.ffeKey, 500, '$ / key') : '') +
        (A.ft ? inp('ft.stallRent', 'Truck stall rent', A.ft.stallRent, 25, '$ / truck / month') + fld('The bar', selCtl('data-pfs="ft.barMode"', [['owner', 'Run by the owner'], ['lease', 'Leased, triple net']], A.ft.barMode)) + // a food truck park
          (A.ft.barMode === 'lease' ? inp('ft.barRent', 'Bar rent', A.ft.barRent, 0.5, '$ / sf / yr NNN') : inp('ft.barSales', 'Bar sales', A.ft.barSales, 10, '$ / sf / yr') + inp('ft.barMargin', 'Bar net margin', A.ft.barMargin, 0.5, '%')) +
          inp('ft.opexStall', 'Park costs a truck', A.ft.opexStall, 100, '$ / truck / yr') + inp('ft.opexFixed', 'Park costs, fixed', A.ft.opexFixed, 1000, '$ / yr') + inp('ft.stallCost', 'Stall pad and hookups', A.ft.stallCost, 500, '$ / stall') : '') + (units && mf ? inp('otherPerUnit', 'Other income', A.otherPerUnit, 5, '$ / unit / month') : '') +
        (A.fuel ? fld('Gas station', selCtl('data-pfs="fuel.mode"', [['lease', 'Ground-leased to a fuel retailer'], ['owner', 'Built and run by the owner']], A.fuel.mode || 'lease'), { wide: true }) + (A.fuel.mode === 'owner' ? // the owner-run store's margins and costs
          inp('fuel.gallons', 'Fuel sold', A.fuel.gallons, 5000, 'gal / pump / yr') + inp('fuel.cents', 'Fuel margin', A.fuel.cents, 1, '¢ / gal') + inp('fuel.insidePsf', 'Inside sales', A.fuel.insidePsf, 10, '$ / store sf / yr') + inp('fuel.insideMargin', 'Inside margin', A.fuel.insideMargin, 0.5, '%') +
          (R.P.fuel?.washSf ? inp('fuel.washPerYear', 'Car wash', A.fuel.washPerYear, 5000, '$ / yr gross profit') : '') + inp('fuel.opexPct', 'Store costs', A.fuel.opexPct, 1, '% of gross profit') + inp('fuel.canopyPsf', 'Canopy', A.fuel.canopyPsf, 1, '$ / sf') + inp('fuel.pumpCost', 'Each pump', A.fuel.pumpCost, 1000, '$ installed') + inp('fuel.tankCost', 'Tanks and piping', A.fuel.tankCost, 5000, '$')
          : inp('fuel.groundRent', 'Ground rent', A.fuel.groundRent, 5000, '$ / year, NNN')) : '') +
        inp('vacancyPct', 'Vacancy', A.vacancyPct, 0.5, '%') + inp('creditPct', 'Credit loss', A.creditPct, 0.25, '%') + (mf ? inp('opexPerUnit', 'Apartment operating costs', A.opexPerUnit, 50, '$ / unit / yr, before taxes') : '') + (homes && !A.forSale ? inp('opexPerHome', 'Home operating costs', A.opexPerHome, 50, '$ / home / yr, before taxes') : '') +
        uses.filter(u => A.opexPsf?.[u] != null && (u === 'storage' || A.commRent?.[u] > 0)).map(u => inp('opexPsf.' + u, SP.USES[u].label + (u === 'storage' ? ' operating costs' : ' CAM & insurance'), A.opexPsf[u], 0.25, '$ / leasable sf / yr' + (u === 'storage' ? ', before taxes' : ', billed back'))).join('') +
        (NNNU.some(u => A.commRent[u] > 0) ? inp('recoveryPct', 'Billed back to NNN tenants', A.recoveryPct, 1, '%') : '') + inp('mgmtPct', 'Management fee', A.mgmtPct, 0.25, '% of collections') + inp('taxPct', 'Property tax rate', A.taxPct, 0.05, '%') + inp('taxBasisPct', 'Taxable share of cost', A.taxBasisPct, 1, '%') +
        inp('ltc', 'Loan to cost', A.ltc, 1, '%') + inp('rate', 'Construction rate', A.rate, 0.05, '%') + inp('permRate', 'Permanent rate', A.permRate, 0.05, '%') + inp('amort', 'Amortization', A.amort, 1, 'yrs') +
        inp('marketCap', 'Market cap rate', A.marketCap, 0.05, '%') + inp('exitCap', 'Exit cap rate', A.exitCap, 0.05, '%') + inp('rentGrowth', 'Rent growth', A.rentGrowth, 0.1, '%/yr') + inp('expGrowth', 'Expense growth', A.expGrowth, 0.1, '%/yr') + inp('hold', 'Hold after stabilizing', A.hold, 1, 'yrs') +
        inp('sched.pre', 'Design & permits', sch.pre, 1, 'mo') + inp('sched.build', 'Construction', sch.build, 1, 'mo') + inp('sched.lease', R.forSale ? 'Sales' : 'Lease-up', sch.lease, 1, 'mo') + '</div></details>';
  }
  function wirePf(p, pl) {
    const box = card.querySelector('.sp-pf'); if (!box) return; box.ontoggle = () => { ed.pfOpen = box.open; };
    const set = (k, v) => { change(x => { const pf = { ...(x.pf || {}) }, [a, b] = k.split('.'); if (b) pf[a] = { ...(pf[a] || {}), [b]: v }; else pf[a] = v; x.pf = pf; }, true); refreshFin(); nums(); }; // the layouts' money and the leasable area in Numbers follow
    let busy = false; const redraw = () => { if (busy) return; const el = card.querySelector('#spPf'); if (!el) return; busy = true; try { el.innerHTML = pfHtml(p, PL()); wirePf(p, PL()); } finally { busy = false; } }; // (a box losing focus as it's replaced fires its change once more)
    box.querySelectorAll('[data-pf]').forEach(i => { // out of range: not applied, and the box says what it takes
      const k = i.dataset.pf, [lo, hi] = pfLim(k), note = (i.closest('label') || i.parentElement).querySelector('.sp-inerr'), val = () => +String(i.value).replace(/[$,\s]/g, '');
      const ok = v => i.value.trim() !== '' && isFinite(v) && v >= lo && (hi == null || v <= hi), say = on => { i.classList.toggle('sp-bad', on); on ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid'); if (note) { note.hidden = !on; note.textContent = on ? (hi != null ? 'Enter ' + lo + '–' + hi : lo > 0 ? 'Enter ' + lo + ' or more' : 'Enter 0 or more') : ''; } };
      i.oninput = () => { if (i.classList.contains('sp-bad') && ok(val())) say(false); };
      i.onchange = () => { if (i.value.trim() === '') { say(false); return; } const v = val(); if (!ok(v)) { say(true); return; } say(false); set(k, pfPct(k) ? +(v / 100).toFixed(4) : v); redraw(); }; });
    box.querySelectorAll('[data-pfs]').forEach(i => i.onchange = () => { set(i.dataset.pfs, i.value); redraw(); });
    box.querySelectorAll('[data-pfb]').forEach(i => i.onchange = () => { set(i.dataset.pfb, i.checked); redraw(); });
    const rs = box.querySelector('#spPfReset'); if (rs) rs.onclick = () => { change(x => { delete x.pf; }, true); refreshFin(); nums(); redraw(); };
    const xb = box.querySelector('#spPfX'); if (xb) xb.onclick = () => {
      if (!window.XLSX) { ctx.toast('Excel export is still loading. Try again in a moment.'); ctx.loadXlsx?.(); return; }
      const R = pfRun(p, PL()); if (!R) return; const wb = XLSX.utils.book_new(), sheets = PF.workbook(R, p.name + ' · ' + pl.name);
      for (const [name, rows] of Object.entries(sheets)) { const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(c => c && typeof c === 'object' ? { t: 'n', v: 0, f: c.f } : c))); ws['!cols'] = [{ wch: 34 }, ...Array(12).fill({ wch: 15 })]; XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); }
      if (GON(PL())) { const ws = XLSX.utils.aoa_to_sheet(G.rowsOf(PL(), scenYields(PL()))); ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 70 }, { wch: 24 }]; XLSX.utils.book_append_sheet(wb, ws, 'Waller land use'); } // the label, the land-use reconciliation, scenarios, risks and checklist
      ctx.saveFile(fileName(p, pl) + '-pro-forma.xlsx', new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    };
  }

  // Turn 90° (or R; Shift+R the other way): like a drag, it stays clear of the other buildings and drives (the nearest
  // clear spot), the parking under it gives way and grows back where it was. Any piece turns, curved and drawn ones too;
  // an entrance 15° a press (a quarter turn would lay it along the street), swinging about its middle with its mouth
  // sliding along the street, its median and signs drawn again with it
  function turnEl(el, deg = T.isEntrance(el) ? 15 : 90) {
    let blocked = false, why = '';
    change(x => { const o = clone(el), r = SP.turnPiece(x, el, deg); x.elements = r.elements; why = [r.why, r.note].filter(Boolean).join(' '); el.pinned = true;
      if (el.kind === 'building' || el.kind === 'garage' || el.kind === 'pond' || SP.isPark(el)) { const att = SP.attachedTo(x, el), c = SP.clearSpot(x, el, { carry: att, reach: Math.max(el.w || 0, el.d || 0) + 60, ...(SP.isPark(el) || el.kind === 'pond' ? { obs: SP.placeObs(x, el, att, SP.shapeOf(o)) } : {}) }); /* (a pond: homes make way, the drives don't, as Change With AI turns one) */ if (c && (c[0] || c[1])) for (const t of [el, ...att]) SP.moveBy(t, c[0], c[1]); blocked = !c; }
      makeRoom(el, [o]); });
    refitSoon('Turned', ED.labelOf(el)); if (why) ctx.toast(why);
    if (blocked) ctx.toast('No clear spot for it turned that way: it overlaps (in red). Turn it again or drag it.', { action: { label: 'Undo', run: () => { if (ed) undo(true); } } });
  }
  // a parking piece's stalls: Stall Direction turns them 90° inside the same outline; Face the Building squares them to
  // the nearest building face (lib/sitetools.mjs faceBuilding). Each one undo step, the count said, then the auto re-fit.
  const ROW1 = 'This is a single row of stalls along the aisle beside it: its stalls face that aisle. Give it an outline of its own first (Edit Shape), deep enough for a row and an aisle.';
  function stallDir(el) {
    const pl = PL(); if (!pl || !el || el.kind !== 'parking') return; ensureEdit(); const n0 = SP.stalls(el).count, mark = ed.undo.length, t = T.turnStalls(el);
    if (el.row && !el.poly) { ctx.toast(ROW1); return; }
    if (!SP.stalls({ ...el, ...t }).count && n0) { ctx.toast('No whole stalls fit this outline the other way; it stays as it is.'); return; }
    change(() => { Object.assign(el, t); el.pinned = true; });
    const n1 = SP.stalls(el).count; ctx.toast('Stalls turned: ' + SP.spacesWord(n1) + (n1 !== n0 ? ' (was ' + n0 + ')' : '') + '.', { action: { label: 'Undo', run: () => { if (ed && PL() === pl && ed.undo.length === mark + 1) undo(true); } } });
    autoRefit('Turned the stalls in', ED.labelOf(el));
  }
  function faceB(el) {
    const pl = PL(); if (!pl || !el || el.kind !== 'parking') return; ensureEdit(); if (el.row && !el.poly) { ctx.toast(ROW1); return; }
    const r = T.faceBuilding(pl, el); if (!r) { ctx.toast('There’s no building on the plan to face.'); return; }
    const n0 = SP.stalls(el).count, mark = ed.undo.length, b = ED.labelOf(r.face.b);
    if (!SP.stalls({ ...el, ...r.set }).count && n0) { ctx.toast('No whole stalls fit this outline facing ' + b + '; it stays as it is.'); return; }
    change(() => { Object.assign(el, r.set); el.pinned = true; delete el.ext; });
    const n1 = SP.stalls(el).count; ctx.toast('Stalls face ' + b + ': ' + SP.spacesWord(n1) + (n1 !== n0 ? ' (was ' + n0 + ')' : '') + (r.moved ? ', a walk’s width off it' : '') + '.', { action: { label: 'Undo', run: () => { if (ed && PL() === pl && ed.undo.length === mark + 1) undo(true); } } });
    autoRefit('Turned', ED.labelOf(el) + ' to face ' + b);
  }
  // a new piece lands in the nearest clear spot to the middle of the view (as a drag does): off the other buildings,
  // drives, ponds and amenities and inside the setbacks, on open ground before parking (parking under it gives way, but
  // then the plan parks less). Nothing near there: the nearest such spot anywhere on the site; a full site: the nearest
  // spot off the buildings, ponds and amenities (over a drive, shown in red). Then it's selected (and in view).
  const CLEAR = ['building', 'garage', 'pool', 'court', 'play', 'pond', 'patio', 'trash', 'foodtruck'];
  const boxOf = r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))];
  function obstacles(x, e, carry, { parking = false, kinds = null, gap = 4 } = {}) { // gap: clear space kept round a parking lot (a piece placed on a lot cuts the rows within 5 ft of it)
    const o = SP.isPark(e) && !kinds ? SP.placeObs(x, e, carry) : SP.spotObstacles(x, e, carry, kinds); if (!parking) return o; // (a park: the homes make way, they aren't in the way)
    return o.concat(x.elements.filter(q => q.kind === 'parking' && !carry.includes(q)).map(q => { const sh = gap > 4 ? SP.offsetRing(SP.shapeOf(q), gap) : SP.shapeOf(q); return { s: sh, b: boxOf(sh), g: gap }; })); // a wider gap is part of the outline: the spot search only tests for overlap
  }
  function gridSpot(x, e, carry, obs) {
    const ring = x.ring, xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), step = Math.max(10, Math.sqrt(SP.ringArea(ring)) / 90), pts = [];
    for (let px = Math.min(...xs); px <= Math.max(...xs); px += step) for (let py = Math.min(...ys); py <= Math.max(...ys); py += step) if (SP.inRing([px, py], ring)) pts.push([px - e.x, py - e.y]);
    pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    for (const [dx, dy] of pts) { const t = SP.moveBy(clone(e), dx, dy), c = carry.map(q => SP.moveBy(clone(q), dx, dy)); if (SP.clearSpot(x, t, { carry: c, obs, reach: 0 })) return [dx, dy]; }
    return null;
  }
  function placeClear(x, e, carry = [], keepLots = false) { // keepLots: every spot that leaves the parking alone before one over it
    if (!CLEAR.includes(e.kind) && !SP.isPark(e)) return 'clear';
    const open = obstacles(x, e, carry, { parking: true, gap: keepLots ? 6 : 4 }), std = obstacles(x, e, carry);
    let how = 'clear', c = SP.clearSpot(x, e, { carry, obs: open, reach: 200 }) || (keepLots ? gridSpot(x, e, carry, open) : null) || SP.clearSpot(x, e, { carry, obs: std, reach: 120 }) || gridSpot(x, e, carry, open) || gridSpot(x, e, carry, std);
    if (!c) { c = gridSpot(x, e, carry, obstacles(x, e, carry, { kinds: ['building', 'garage', 'pond', 'pool', 'court', 'play'] })); how = c ? 'drive' : 'none'; }
    if (c && (c[0] || c[1])) for (const t of [e, ...carry]) SP.moveBy(t, c[0], c[1]);
    return how;
  }
  // where a new piece starts: the middle of the free part of the map (if that's on the site), turned like the buildings near it
  // (at0: a spot picked on the map, plan feet, from the right-click menu's Add here)
  function addAt(pl, at0) {
    const f = freeRect(), m = map.getContainer().getBoundingClientRect(), ll = map.unproject([(f.l + f.r) / 2 - m.left, (f.t + f.b) / 2 - m.top]), F = SP.frame(pl.origin);
    let at = at0 || F.toFt([ll.lng, ll.lat]); if (!SP.inRing(at, pl.ring)) at = SP.centroid(pl.ring);
    const near = pl.elements.filter(e => e.kind === 'building' && !SP.isFree(e)).sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1]))[0];
    return { at, rot: +((((near ? near.rot || 0 : frameAngle(pl)) % 360) + 360) % 360).toFixed(2) };
  }
  function showPiece(e) { const pl = PL(); if (!pl || !e) return; const ll = SP.frame(pl.origin).toLL([e.x, e.y]), q = map.project(ll), c = map.getContainer().getBoundingClientRect(), f = freeRect(), x = q.x + c.left, y = q.y + c.top;
    if (x < f.l + 30 || x > f.r - 30 || y < f.t + 30 || y > f.b - 30) map.easeTo({ center: ll, offset: [(f.l + f.r) / 2 - (c.left + c.right) / 2, (f.t + f.b) / 2 - (c.top + c.bottom) / 2], duration: 400 }); } // to the middle of the free part of the map
  const noRoom = how => { if (how === 'drive') ctx.toast('The site is full: it sits over a drive (in red). Turn on Edit Layout to move it, or remove something first.'); else if (how === 'none') ctx.toast('No room for it on the site: it overlaps another piece (in red).'); };
  function addType(t) { // a building from the library at the middle of the view, squared with the lot, parking under it giving way
    const pl = PL(); if (!pl || pl.ring.length < 3) return;
    const { at, rot } = addAt(pl), e = { id: uid(), ...fromAny(t, at, rot), ...(pl.recipe ? { pinned: true } : {}) };
    let how = 'clear'; change(x => { how = placeClear(x, e); x.elements.push(e); makeRoom(e); }); ed.sel = e.id; draw(); panel(); showPiece(e); noRoom(how);
  }
  // a roundabout at the junction nearest p (the middle of the view, the spot it was dropped on or clicked: near, a tighter
  // snap), or the next one along when that has no room; a drop-off loop in front of building b. Each one undo step, picked,
  // and the rest re-fits round it
  const loopFor = b => b?.kind === 'building' && !['sfr', 'townhomes', 'duplex'].includes(b.use || SP.normalizeProgram(PL()?.program).use);
  function ringAt(p, near) {
    const pl = PL(); if (!pl) return; const r = SP.addRoundabout(pl, p, { id: uid(), snap: near ? 400 : 600, near: true }); if (r.error) { ctx.toast(r.error); return; }
    change(x => { x.elements = r.elements; }); ed.sel = r.roundabout.id; ed.multi = []; ed.mode = null; ed.editing = true; ed.shape = null; draw(); panel(); showPiece(r.roundabout);
    ctx.toast(r.roundabout.name + ' added where ' + SP.meetsWord(r.meets) + ' meet.' + (r.note ? ' ' + r.note : '')); refitSoon('Added', r.roundabout.name);
  }
  function loopAt(b) {
    const pl = PL(); if (!pl || !b) return; const r = SP.addLoop(pl, b, { id: uid() }); if (r.error) { ctx.toast(r.error); return; }
    change(x => { x.elements = r.elements; }); ed.sel = r.loop.id; ed.multi = []; ed.mode = null; ed.editing = true; ed.shape = null; draw(); panel(); showPiece(r.loop);
    ctx.toast('Drop-off loop added at ' + ED.labelOf(b) + '.' + (r.note ? ' ' + r.note : '')); refitSoon('Added', r.loop.name);
  }
  function addEl(kind, at0) {
    const pl = PL(); if (!pl || pl.ring.length < 3) return;
    const { at, rot } = addAt(pl, at0), prog = SP.normalizeProgram(pl.program), [w, d] = kind === 'building' ? [Math.round(Math.max(40, Math.min(240, 12000 / prog.depth))), Math.round(Math.min(prog.depth, 160))] : SIZE[kind];
    const pin = PL().recipe ? { pinned: true } : {}, pp = { ...PARAMS, ...(pl.params || {}) };
    const stall = kind === 'parking' && (+pp.stallW !== SP.STALL.w || +pp.stallD !== SP.STALL.d || +pp.aisle !== SP.STALL.aisle) ? { sw: +pp.stallW || SP.STALL.w, sd: +pp.stallD || SP.STALL.d, sa: +pp.aisle || SP.STALL.aisle } : {}; // the plan's stall and aisle sizes (Site parameters)
    let how = 'clear';
    if (kind === 'roundabout') { ringAt(at, !!at0); return; }
    if (kind === 'loop') { const sel = pl.elements.find(e => e.id === ed.sel), b = loopFor(sel) ? sel : pl.elements.filter(loopFor).map(b => ({ b, d: Math.hypot(b.x - at[0], b.y - at[1]) })).filter(q => q.d <= 300).sort((p, q) => p.d - q.d)[0]?.b;
      if (b) loopAt(b); else { ed.mode = 'loop'; draw(); panel(); } return; } // (none picked or near: click the building)
    if (kind === 'pad') { // a restaurant pad: the building, its outdoor seating by the door and a drive-thru lane round it
      const L = (u, v) => { const q = SP.rotPt([u, v], rot); return [+(at[0] + q[0]).toFixed(2), +(at[1] + q[1]).toFixed(2)]; };
      const b = { id: uid(), kind: 'building', ...Object.fromEntries(['x', 'y'].map((k2, i) => [k2, L(0, 0)[i]])), w: 44, d: 50, rot, use: 'restaurant', floors: 1, name: 'Pad', note: 'Restaurant · drive-thru', ...pin };
      const pt = L(30.5, 8), patio = { id: uid(), kind: 'patio', x: pt[0], y: pt[1], w: 15, d: 34, rot, name: '', note: 'Outdoor seating', ...pin };
      const lane = { id: uid(), kind: 'drive', path: [L(-34, 60), L(-34, -37), L(50, -37), L(50, 60)], width: 12, r: 14, name: '', note: 'Drive-thru lane', ...pin };
      change(x => { how = placeClear(x, b, [patio, lane]); x.elements.push(b, patio, lane); }); ed.sel = b.id; ed.multi = []; draw(); panel(); refitSoon('Added', ADD_SHORT.pad); noRoom(how); return;
    }
    const e = { id: uid(), kind, x: +at[0].toFixed(2), y: +at[1].toFixed(2), w, d, rot, ...(kind === 'building' ? { floors: prog.floors } : {}), ...(kind === 'garage' ? { levels: 4, name: 'Parking garage' } : {}), ...(kind === 'play' ? { name: 'Playground' } : {}), ...(kind === 'court' ? { name: 'Pickleball courts' } : {}), ...(kind === 'patio' ? { note: 'Outdoor seating' } : {}), ...(kind === 'sign' ? { name: 'Monument sign' } : {}), ...stall, ...pin };
    const lots0 = kind === 'garage' ? pl.elements.filter(x => x.kind === 'parking').length : 0;
    change(x => { how = placeClear(x, e, [], kind === 'garage'); x.elements.push(e); if (kind === 'garage') makeRoom(e); }); ed.sel = e.id; ed.multi = []; draw(); panel(); refitSoon('Added', ADD_SHORT[kind] || ED.labelOf(e)); noRoom(how); // no camera move: it lands in view (the middle of it, or where you clicked)
    if (lots0 && PL().elements.filter(x => x.kind === 'parking').length < lots0) ctx.toast('Replaced Parking with Parking garage', { action: { label: 'Undo', run: () => { if (ed) undo(true); } } }); // no room beside it: the lot gave way
  }

  // ---------- Ask about this plan ----------
  // Questions about the plan that's open ("why so much parking?", "why a pond?", "how does the pro forma work out?"):
  // the browser sends a fact sheet of what it has already worked out (lib/planask.mjs planFacts: the program, parking by
  // rule, stormwater, checks, the pro forma, the last build's notes and review) and the AI explains from that alone. A
  // few turns are kept for the open plan (not saved); Clear forgets them.
  const askLog = pl => { const a = ed.asks ||= {}; return a[pl.id] ||= { turns: [], draft: '' }; };
  function askStarters(pl) {
    const els = pl.elements, club = els.find(e => e.kind === 'building' && (e.use === 'amenity' || /club|community|amenity/i.test(e.name || '')));
    return ['Why do we need this much parking?', els.some(e => e.kind === 'pond') ? 'Why is there a detention pond?' : 'Why is there no detention pond?', 'How does the pro forma work out?', club ? 'Why is the ' + (/club/i.test(club.name || '') ? 'clubhouse' : (club.name || 'amenity center').toLowerCase()) + ' there?' : 'Why are the buildings where they are?'];
  }
  // an answer: paragraphs, and lines starting "- " as a list
  function answerHtml(t) {
    const out = []; let list = [];
    const flush = () => { if (list.length) out.push('<ul>' + list.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'); list = []; };
    for (const line of String(t).split(/\n+/)) { const l = line.trim(); if (!l) continue; const m = l.match(/^[-•*]\s+(.*)/); if (m) list.push(m[1]); else { flush(); out.push('<p>' + esc(l) + '</p>'); } }
    flush(); return out.join('');
  }
  function askHtml(p, pl) {
    const A = askLog(pl), off = aiOff(), busy = !!A.busy, last = A.turns[A.turns.length - 1];
    const turns = A.turns.map(t => '<div class="sp-qa"><div class="sp-q">' + esc(t.q) + '</div><div class="sp-a">' + (t.a ? answerHtml(t.a) : t.err ? '<p class="sp-aerr">' + esc(t.err) + '</p>' : '<span class="ai-work" role="status"><span class="ai-wl">Thinking</span></span>') + '</div></div>').join('');
    const chips = busy ? [] : A.turns.length ? last?.followups || [] : askStarters(pl);
    return '<div class="bsec sp-ai sp-askp" id="spAskSec"><div class="sp-ai-h"><label class="lt" for="spQ">Ask about this plan</label>' + (A.turns.length ? '<button type="button" class="sp-link" id="spQClear"' + (busy ? ' disabled' : '') + ' title="Forget these questions and answers">Clear</button>' : '') + '</div>' +
      (A.turns.length ? '<div class="sp-convo" id="spConvo" role="log" aria-live="polite" aria-label="Questions and answers about this plan">' + turns + '</div>'
        : '<div class="rnote">Why so much parking, why a pond, how the numbers work out: the AI answers from this plan’s own numbers and notes.</div>') +
      (chips.length && !off ? '<div class="sp-sugs sp-qsugs" role="group" aria-label="' + (A.turns.length ? 'Ask next' : 'Questions to try') + '">' + chips.map(q => '<button type="button" class="chip" data-askq="' + esc(q) + '" title="Ask this">' + esc(q) + '</button>').join('') + '</div>' : '') +
      '<textarea id="spQ" rows="2" placeholder="' + (A.turns.length ? 'Ask a follow-up…' : 'e.g. why is the clubhouse there?') + '"' + (off ? ' disabled' : '') + '>' + esc(A.draft || '') + '</textarea>' +
      '<div class="sp-go2"><button type="button" class="btn askai' + (busy ? ' busy' : '') + '" id="spQGo"' + (off || busy ? ' disabled' : '') + (busy ? ' aria-busy="true"' : '') + (off ? ' title="AI isn’t set up on this site"' : '') + '>' + (busy ? 'Answering…' : 'Ask') + '</button></div>' +
      (off ? '<div class="rnote sp-aioff">AI isn’t set up on this site</div>' : '') + '</div>';
  }
  function wireAsk() {
    const pl = PL(), sec = card.querySelector('#spAskSec'); if (!pl || !sec) return; const A = askLog(pl), ta = sec.querySelector('#spQ');
    if (ta) { ta.oninput = () => { A.draft = ta.value; }; ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askPlan(); } }; } // Enter asks; Shift+Enter is a new line
    const go = sec.querySelector('#spQGo'); if (go) go.onclick = () => askPlan();
    sec.querySelectorAll('[data-askq]').forEach(b => b.onclick = () => askPlan(b.dataset.askq));
    const cl = sec.querySelector('#spQClear'); if (cl) cl.onclick = () => { A.turns = []; paintAsk(); card.querySelector('#spQ')?.focus({ preventScroll: true }); };
    const c = sec.querySelector('#spConvo'); if (c) c.scrollTop = c.scrollHeight; // the latest turn in view
  }
  // just the Ask section again (the rest of the panel stays as it is)
  function paintAsk() {
    const el = card.querySelector('#spAskSec'), p = P(), pl = PL(); if (!el || !pl) return;
    const typing = document.activeElement?.id === 'spQ', t = document.createElement('div'); t.innerHTML = askHtml(p, pl); el.replaceWith(t.firstElementChild); wireAsk();
    if (typing) card.querySelector('#spQ')?.focus({ preventScroll: true });
    card.querySelector('#spAskSec .sp-qa:last-child')?.scrollIntoView({ block: 'nearest' });
  }
  async function askFacts(p, pl) {
    let R = null, pieces = [], known = []; try { R = pfRun(p, pl); } catch (e) { /* no pro forma */ } try { pieces = ED.describePlan(pl).pieces; } catch (e) { /* totals only */ }
    try { known = await Promise.race([factsFor(pl), new Promise(res => setTimeout(() => res([]), 4000))]) || []; } catch (e) { known = []; }
    const F = ASK.planFacts(pl, { site: siteInfo(p, pl), siteFacts: known, pieces, pf: R, variants: ed.variants, project: p.name });
    if (GON(pl)) try { const sc = scenarios(pl) || {}, T = G.landTable(pl); F.wallerGuardrails = { label: G.LABEL, scenario: G.settingsOf(pl).scenario, jurisdiction: pl.jur?.reason || '', // what the guardrails make of the plan
      scenarios: Object.fromEntries(['A', 'B', 'C'].map(k => [k, sc[k] ? { buildingSf: sc[k].buildingSf, leasableSf: sc[k].leasableSf, units: sc[k].units, lots: sc[k].lots, parkingRequired: sc[k].parkingRequired, detentionAcFt: sc[k].detentionAcFt } : null])),
      landUse: T.rows.map(r => ({ metric: r.label, acres: +r.acres.toFixed(2), basis: r.basis, classification: r.cls })), unresolvedRisks: G.risks(pl).map(r => r.title + (r.stop ? ' (stop condition)' : '')) }; } catch (e) { /* the plan's own facts are enough */ }
    return F;
  }
  async function askPlan(qIn) {
    const p = P(), pl = PL(); if (!pl?.elements.length) return; const A = askLog(pl), e0 = ed;
    const q = String(qIn ?? A.draft ?? '').trim(); if (!q) { ctx.toast('Ask a question about this plan, e.g. “why so much parking?”'); card.querySelector('#spQ')?.focus(); return; }
    if (A.busy) return; if (aiOff()) { ctx.toast('AI isn’t set up on this site.'); return; }
    const turn = { q }; A.turns.push(turn); A.turns = A.turns.slice(-6); if (qIn == null) A.draft = ''; A.busy = true; paintAsk();
    try {
      const plan = await askFacts(p, pl), history = A.turns.filter(t => t !== turn && t.a).slice(-4).map(t => ({ q: t.q, a: t.a }));
      const d = await post({ mode: 'ask', question: q, history, plan, effort: ASK.effortOf(effortNow()).effort });
      turn.a = d.answer || 'No answer came back. Try asking another way.'; turn.followups = d.followups || [];
    } catch (e) { turn.err = e.status === 503 ? 'AI isn’t set up on this site.' : e.status === 429 ? 'Too many questions at once: try again in a minute.' : 'The AI didn’t answer just now. Try again in a moment.'; }
    A.busy = false; if (ed === e0 && PL() === pl) paintAsk();
  }

  // ---------- Build with AI ----------
  function siteInfo(p, pl) {
    const a = frameAngle(pl), r = pl.ring.map(q => { const c = Math.cos(-a * Math.PI / 180), s = Math.sin(-a * Math.PI / 180); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c]; });
    const xs = r.map(q => q[0]), ys = r.map(q => q[1]), parcel = p.parcels.find(x => x.key === pl.parcel), f = pl.front ?? SP.longestEdge(pl.ring);
    const side = (pl.streets || []).filter(k => k !== f && k < pl.ring.length).map(k => Math.round(SP.edgeLen(pl.ring, k))), boxA = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    return { acres: +(SP.ringArea(pl.ring) / 43560).toFixed(3), widthFt: Math.round(Math.max(...xs) - Math.min(...xs)), depthFt: Math.round(Math.max(...ys) - Math.min(...ys)), frontageFt: Math.round(SP.edgeLen(pl.ring, f)),
      sideStreetsFt: side, shape: pl.ring.length <= 4 && SP.ringArea(pl.ring) > boxA * 0.92 ? 'rectangular' : SP.ringArea(pl.ring) > boxA * 0.8 ? 'mostly rectangular, ' + pl.ring.length + ' sides' : 'irregular, ' + pl.ring.length + ' sides (about ' + Math.round(SP.ringArea(pl.ring) / boxA * 100) + '% of its bounding box)',
      streets: [f, ...(pl.streets || []).filter(k => k !== f)].filter(k => k < pl.ring.length).map(k => { const nm = pl.streetNames?.[k] || null; return { side: k === f ? 'front' : 'side', name: nm, highway: /\b(?:hwy|highway|fm|us|sh|i-?\d|interstate|freeway|parkway|tollway|loop)\b/i.test(nm || '') }; }),
      address: parcel?.label || '', city: ctx.nearestPlace?.(pl.origin) || '', county: (ctx.DATA?.counties || []).find(c => SP.inRing(pl.origin, c.outline?.[0]?.[0] || []))?.name || '', zoning: pl.zoning };
  }
  // ---------- AI: what to build, then the engine's layouts reviewed and revised ----------
  // how hard the AI works (lib/planask.mjs EFFORTS): the level saved on this device, the old Quick / AI-reviewed switch read
  // across once (then forgotten); with the AI off only Low runs
  function effortSaved() {
    let s = '', old = null; try { s = localStorage.getItem(ASK.EFFORT_KEY) || ''; old = localStorage.getItem(ASK.LEGACY_KEY); } catch (e) {}
    const lvl = ASK.effortLevel(s, old); if (s !== lvl) try { localStorage.setItem(ASK.EFFORT_KEY, lvl); localStorage.removeItem(ASK.LEGACY_KEY); } catch (e) {}
    return lvl;
  }
  const effortNow = () => aiOff() ? 'low' : effortSaved();
  function pickEffort(id) {
    if (!ASK.EFFORTS.some(e => e.id === id) || (aiOff() && id !== 'low')) return;
    const was = effortSaved(); try { localStorage.setItem(ASK.EFFORT_KEY, id); } catch (e) {}
    ed.effShine = id === 'ultra' && was !== 'ultra'; panel(); ed.effShine = false; // Ultra picked: its shine sweeps once (CSS; none with reduced motion)
    card.querySelector('[data-eff="' + id + '"]')?.focus({ preventScroll: true });
  }
  const effOn = id => { const e = id && ASK.EFFORTS.find(x => x.id === id); return e ? ' <span class="sp-effon' + (e.id === 'ultra' ? ' u' : '') + '" title="How hard the AI worked on it">' + (e.id === 'ultra' ? SPARK : '') + e.label + '</span>' : ''; };
  const factsKept = new Map(); // with no plan open (a rendering made from the project page)
  const factsFor = pl => { const id = pl.id + ':' + pl.ring.length, box = ed || { facts: factsKept.get(pl.id) }; if (box.facts?.id === id) return box.facts.p; const f = { id, p: siteFacts(pl).catch(() => []) }; if (ed) ed.facts = f; else factsKept.set(pl.id, f); return f.p; }; // flood, roads, districts, utilities: asked once per site
  // a Waller plan's requests carry its guardrails (the server adds their instruction and values to the AI's), and what
  // comes back has the prohibited conclusions rewritten before it's shown
  // every AI call about the open plan also carries the facts the team confirmed from the project's reference files
  // (lib/sitefiles.mjs refsForAI: a survey's easements, a floor plan's size…), unless the call brings its own
  const REF_MODES = ['program', 'strategy', 'review', 'edit', 'ask', 'bestuse'];
  const post = async (body, signal) => { const ga = ['bestuse', 'askProject'].includes(body.mode) ? null : G.forAI(PL() || {}); if (ga) body = { ...body, guardrails: ga };
    if (!body.refs && REF_MODES.includes(body.mode || 'program')) { const rf = RF.refsForAI(P()?.files); if (rf.length) body = { ...body, refs: rf }; }
    const r = await fetch('api/siteplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(ctx.aiFor?.('siteplan') || {}) }), signal }); ctx.noteModel?.(r); const d = await r.json().catch(() => ({})); if (!r.ok) { const e = Object.assign(new Error(d.error || 'AI unavailable'), { status: r.status }); aiSaw(e); throw e; } ctx.spAiOff = 0; return ga ? scrubDeep(d) : d; };
  // an option as the AI sees it: the plan drawing as a picture, its numbers and what the checks found
  async function planImage(plan) {
    const svg = planSVG(plan, { px: 1000 }).svg, img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const w = img.naturalWidth || 1000, h = img.naturalHeight || 1000, k = Math.min(1, 1000 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72);
  }
  async function forReview(v, plan, withImage) {
    const p2 = { ...plan, elements: v.elements, program: v.program || plan.program, params: v.params || plan.params }, m = v.m, B = v.elements.filter(e => e.kind === 'building');
    let image = null; if (withImage) try { image = await planImage(G.effective(p2)); } catch (e) { /* numbers only */ }
    return { name: v.name || v.arr, notes: v.notes, issues: GC(p2).map(i => i.text).slice(0, 8), image,
      metrics: { acres: +m.acres.toFixed(2), buildings: B.length, floorAreaSf: Math.round(m.gfa), units: m.units || 0, unitsPerAcre: +(m.duAc || 0).toFixed(1), parkingSpaces: m.spaces, parkingRequired: m.required, coveragePct: Math.round(m.coverage * 100), far: +m.far.toFixed(2), pondAcres: +(m.pond / 43560).toFixed(2), openSpacePct: Math.round(m.green * 100), leasableSf: Math.round(m.leasable || 0), sellableSf: Math.round(m.sellable || 0), leasablePlusSellableSf: Math.round(SP.lsfOf(m)), ...(v.pondDepth ? { pondDepthFtAssumed: v.pondDepth } : {}), ...(v.fin ? { valueM: +(v.fin.value / 1e6).toFixed(1), costM: +(v.fin.cost / 1e6).toFixed(1), yieldOnCostPct: +((v.fin.yoc || 0) * 100).toFixed(2) } : {}) } };
  }
  // L: the effort level (lib/planask.mjs): how hard the model thinks, how many review rounds in all (the last never
  // revises) and how many layouts go with their drawings
  // extra: what goes with it besides (the AI's plan among the options: briefCheck, briefFor)
  async function aiReview(plan, prog, list, round, ask, signal, L = ASK.effortOf(effortNow()), extra = {}) {
    const options = await Promise.all(list.map((v, i) => forReview(v, plan, i < (L.images || 4))));
    const strategy = ed.readAs?.ask === ask ? ed.readAs?.plan || null : null; // the plan made before placing: the review judges the layouts against it
    return post({ mode: 'review', prompt: ask, site: siteInfo(P(), PL()), facts: await factsFor(PL()), program: prog, round, rounds: Math.max(1, L.rounds), effort: L.effort, options, ...(strategy ? { strategy } : {}), ...extra }, signal);
  }
  // ---------- the AI's plan (lib/planbrief.mjs): its brief laid out by the parking-field engine ----------
  const AIP = 'AI’s plan';
  // the engine's first layout of a brief, as a layout card: marked the AI's (its key and arrangement name), with the AI's
  // reasons, what the engine changed and whether it was done as written. ab: { brief, reasons, leasableSf, check, revised?, why? }
  // Only a layout that keeps the brief's buildings and pads (as asked, or the nearest fit) is the AI's plan; when the
  // engine had to give the brief up and lay out its own program, there's none, and why (lib/planbrief.mjs pickBriefLayout)
  // -> { v } or { reason }
  function aiLayout(out, plan, prog, ab, extra = {}) {
    const pk = BR.pickBriefLayout(out, ab.brief); if (!pk.o) return { reason: pk.reason };
    const o = pk.o, v = named([o], { ...plan, program: o.program || prog }, extra)[0];
    return { v: { ...v, key: 'ai' + (ab.revised ? '2' : '') + '|' + v.key, arr: (ab.revised ? AIP + ', revised' : AIP) + ' · ' + v.arr, aiBrief: { ...ab, changed: BR.changedNotes(v.notes), met: BR.briefMet(v) } } };
  }
  const renumber = list => { const nm = RUN.layoutNames(list); return list.map((v, i) => ({ ...v, name: nm[i] })); };
  // what the review is told about the AI's plan among the options it sees, and whether it may revise the brief; dropped:
  // { brief, reason } when the plan didn't fit at all (it's not among the options: the review still gets the engine's reason)
  const briefCheckOf = (pool, mayRevise, briefFor, dropped = null) => { const i = pool.findIndex(v => v.aiBrief), ab = i >= 0 ? pool[i].aiBrief : dropped?.brief;
    if (!ab) return {};
    return { briefCheck: { option: i >= 0 ? i : null, brief: ab.brief, reasons: ab.reasons, met: i >= 0 && !!ab.met, mayRevise: !!mayRevise && !(i >= 0 && ab.met), ...(i < 0 ? { dropped: dropped.reason } : {}) }, ...(briefFor ? { briefFor } : {}) }; };
  // Build: describe → watch it run → choose. With the AI on (Medium and up), the engine's layouts are held back, unseen
  // and off the map, while the AI reviews them: the panel shows only the run (its steps, the time, Cancel). Then they come
  // in ranked by the AI, each with its score, verdict, strengths and problems, with any layouts from a revised program, and
  // the AI's pick goes on the map (unless the plan was changed by hand meanwhile: then it's offered). A review that fails,
  // runs too long or is cancelled shows the engine's layouts, said not to be AI-reviewed (lib/planruns.mjs). With the AI
  // off, or on Low, the layouts go on the map and into the list as soon as they're drawn.
  // The effort level sets the work: Low reads the request and stops; Medium reviews once; High may revise once; Ultra
  // starts from a wider search (five layouts), reviews up to six and may revise twice.
  async function build(o = {}) {
    const p = P(), pl = PL(); if (!pl || pl.ring.length < 3) return;
    if (ed.run) { ctx.toast('A build is already running: wait for it, or Cancel it.'); return; }
    const ask = (ed.ask || '').trim(); if (!ask) { ed.buildOpen = true; panel(); ctx.toast('Say what should go on the site, or pick a suggestion.'); card.querySelector('#spAsk')?.focus(); return; }
    if (!o.confirmed && dirty(pl) && pl.elements.length) { const src = ed.runSrc; askReplace(() => { ed.runSrc = src; build({ confirmed: true }); }); return 'ask'; } // before the run, not after it
    const ai = !aiOff(), lvl = effortNow(), L = ASK.effortOf(lvl), review = ai && L.rounds > 0, lay = SP.ringArea(pl.ring) > 40 * 43560 ? 'Laying out (big site: up to a minute)' : L.layout.count ? 'Laying out ' + L.layout.count + ' layouts (a wider search)' : 'Laying out the layouts';
    ed.buildOpen = false; const src = ed.runSrc || '#spGo'; ed.runSrc = null;
    // Medium and up think the site through before anything is placed (Ultra: three plans, one picked); the program, the
    // layout settings and the review then follow that plan
    const thinks = ai && !!L.plan, o0 = thinks ? 1 : 0, planStep = L.plan?.count > 1 ? 'Thinking through ' + L.plan.count + ' plans for the site' : 'Thinking the site through';
    const steps0 = !review ? ['Reading your request', lay] : L.rounds === 1 ? ['Reading your request', lay, 'AI review'] : ['Reading your request', lay, 'AI review', 'Comparing'];
    const run = startRun('build', thinks ? [planStep, ...steps0] : steps0, src, { ask, effort: lvl, holds: review }); if (!run) return; // (holds: the layouts wait for the AI's review, the panel showing the run)
    let prog = SP.keepNames(SP.guessProgram(ask), pl.program), setbacks = pl.setbacks, /* (a new program keeps the plan's names) */ note = '', aiOk = false, assumed = [], strategy = null;
    const site = ai ? siteInfo(p, pl) : null, facts = ai ? await factsFor(pl) : null; if (!live(run)) return;
    if (!terrainNow(pl)) { await Promise.race([terrainOf(pl), new Promise(res => setTimeout(res, 6000))]); if (!live(run)) return; } // (asked once per boundary; usually here already)
    // a commercial site (Medium and up): the planning step also writes the AI's brief for the parking-field engine, decided
    // from the lot, the setbacks, the parking rules, the detention it needs and the easements (lib/planbrief.mjs)
    const briefFor = thinks && BR.asksBrief(L, ask) ? BR.briefContext(pl, SP.guessProgram(ask), { ask }) : null;
    let aiB = null, aiBNote = '', aiDrop = null; // aiDrop: { brief, reason } when the AI's plan didn't fit at all
    if (thinks) try {
      const s = await post({ mode: 'strategy', prompt: ask, site, facts, program: pl.program, effort: L.plan.effort, count: L.plan.count, ...(briefFor ? { briefFor } : {}) }, run.ctl.signal), pk = s.strategies?.[s.pick] || s.strategies?.[0];
      if (pk) { const { brief, briefNote, ...pk0 } = pk; strategy = { ...pk0, why: s.why || '', alts: (s.strategies || []).filter(x => x !== pk).map(x => x.name).filter(Boolean) }; if (briefFor) { aiB = brief?.brief ? brief : null; aiBNote = briefNote || (aiB ? '' : 'The AI gave no plan of its own for this lot, so these are the engine’s own layouts.'); } }
    } catch (e) { if (!live(run)) return; console.warn('strategy', e); if (briefFor) aiBNote = 'The AI’s plan didn’t come back, so these are the engine’s own layouts.'; } // no plan: the program step reads the request as before
    if (!live(run) || PL() !== pl) return;
    if (thinks) runStep(run, 2, 'Reading your request' + (strategy ? ' (following the plan)' : ''));
    if (ai) try {
      const d = await post({ prompt: ask, site, facts, program: pl.program, effort: L.effort, teamTypes: CU.teamTypesForAI(TL.list()), ...(strategy ? { strategy } : {}) }, run.ctl.signal);
      prog = SP.keepNames(d.program || prog, pl.program); setbacks = { ...SP.SETBACKS, ...d.setbacks }; note = d.summary || ''; assumed = (d.assumptions || []).filter(Boolean); aiOk = true;
    } catch (e) { if (!live(run)) return; note = e.status === 503 ? '' : navigator.onLine ? 'The AI didn’t answer, so this read your words directly.' : 'Offline: this read your words directly.'; }
    if (!live(run) || PL() !== pl) return;
    if (!aiOk) { run.steps = run.steps.slice(0, 2 + o0); run.holds = false; strategy = null; if (aiB) aiBNote = ''; aiB = null; paintRun(); } // the AI is off: no review either, the layouts shown as they come (nor its plan: the note above says it didn't answer)
    if (aiB && prog?.zones?.length) { prog = BR.withPads(prog, aiB.brief.pads); aiB = null; } // a mix: the AI's pads go on its shop zone; the rest of the brief has no engine of its own there
    const np = SP.normalizeProgram(prog);
    const readAs = { ask, chips: RUN.readAs(np, SP.USES), miss: RUN.notUnderstood(ask, np), assumed, by: aiOk ? 'ai' : 'words', ...(strategy ? { plan: strategy } : {}), ...(aiB ? { brief: aiB } : {}), ...(aiBNote ? { briefNote: aiBNote } : {}) }; // shown once the layouts land, so a cancelled build keeps the last one's
    // the plan's layout settings (neighbourhood streets, leaving a later phase open, the apartment building form) for this run's layouts
    // (the land the program doesn't need is filled unless the words or Settings ask to hold it: an AI plan's or an earlier
    // build's "leave it for later" alone doesn't, lib/planruns.mjs fillParams)
    const st0 = strategy?.settings || {}; let params0 = RUN.fillParams({ ...(pl.params || {}), ...(st0.streets ? { streets: st0.streets } : {}), ...(strategy?.buildings?.form ? { form: strategy.buildings.form } : {}) }, { ask });
    if (np.form) params0 = { ...(params0 || pl.params || {}), form: np.form }; // the shape the request names ("L-shaped"): the layout reads params.form
    runStep(run, 2 + o0, lay);
    const wb = BR.wordsBrief(ask); // pads asked for in words ("with 2 pad sites", "an outparcel"): the engine places them, at every level
    let out = [], failed = false; try { out = await laid('options', { ...pl, setbacks, ...(params0 ? { params: params0 } : {}) }, prog, { ...L.layout, deeper: true, ...koOpts(pl), ...(wb ? { brief: wb } : {}) }); /* (deeper: the same layouts again with a 6 and an 8 ft deep pond, each labelled with the depth it assumes) */ } catch (e) { console.warn('layout', e); failed = true; if (live(run)) ctx.toast('The layout failed: ' + e.message + '. Try a smaller request, or draw it by hand.'); }
    if (!live(run) || PL() !== pl) return;
    const plan = { ...pl, setbacks, ...(params0 ? { params: params0 } : {}) };
    let variants = named(out, { ...plan, program: prog }, params0 ? { params: params0 } : {});
    // the AI's brief laid out beside the engine's own search, then ranked against them on one score (lib/planbrief.mjs
    // fitScore: the leasable floor area that parks and passes the checks): it's recommended only when it does best
    if (aiB && !failed) {
      if (BR.takesBrief(prog, aiB.brief)) {
        runStep(run, 2 + o0, 'Laying out the AI’s plan'); let got = null;
        const bf = BR.briefForm(aiB.brief), pA = bf ? { ...(plan.params || {}), form: bf } : plan.params, planA = { ...plan, ...(pA ? { params: pA } : {}) }; // (its buildings' shape, "L")
        try { got = aiLayout(await laid('options', planA, prog, { count: 2, ...koOpts(pl), brief: aiB.brief }), planA, prog, aiB, pA ? { params: pA } : {}); } catch (e) { console.warn('AI plan layout', e); }
        if (!live(run) || PL() !== pl) return;
        if (got?.v) variants = renumber(BR.placeAi(variants, got.v));
        else { aiDrop = { brief: aiB, reason: got?.reason || 'the layout engine couldn’t lay it out' }; aiBNote = BR.droppedNote(aiB.brief, aiDrop.reason); readAs.briefNote = aiBNote; } // (not shown as the AI's plan: nothing of it is in the engine's own layout)
      } else { readAs.briefNote = 'The AI’s plan is for shops and offices; this request reads as something else, so these are the engine’s own layouts.'; }
    }
    if (aiBNote) note = (note ? note + ' ' : '') + aiBNote;
    const doReview = RUN.holdsForReview({ ai: aiOk, rounds: review ? L.rounds : 0, any: variants.some(v => v.elements.length) });
    const meta = { ask, at: new Date().toISOString(), effort: aiOk ? lvl : 'low' };
    if (ed.ideas?.list?.length) { if (!ed.ideas.list.some(it => it.request === ask)) ed.ideas = { ...ed.ideas, used: null }; else if (ed.ideas.used != null) ed.ideasOpen = false; } // the idea laid out: the ideas fold to a line
    run.applied = true; // (a hand edit from here on doesn't stop the run: what lands then is offered, not put on the map)
    if (!doReview) { // the AI is off, Low, or nothing fits: the layouts at once, on the map and in the list
      ed.variants = variants; ed.readAs = readAs; ed.aiNote = review && ai && !aiOk && note ? note + ' These layouts were not reviewed by the AI.' : note; ed.aiSummary = ''; ed.reviewCleared = false; ed.runMeta = meta; ed.pickedByUser = false; ed.reviewing = false; ed.aiPick = null;
      const rec0 = K.recommended(variants, null), best = rec0 ? rec0.index : variants.findIndex(v => v.elements.length); // never a failing layout when one passes
      if (best >= 0) await useVariant(best, { quiet: true, fresh: true }); else saveRun(pl);
      if (!live(run)) return;
      endRun(run); if (best < 0 && !failed) ctx.toast('Nothing fits that request on this site.'); return; // (a failed layout already said so)
    }
    // the AI on: the layouts wait here, unseen and off the map, until its review is back (the panel shows the run)
    run.hold = variants; run.landing = { readAs, meta, note }; run.u0 = ed.undo.length; run.top = ed.undo[run.u0 - 1];
    runStep(run, 3 + o0, strategy ? 'The AI is reviewing the layouts against its plan' : 'The AI is reviewing the layouts');
    // the review has a time limit of its own: past it, the layouts are shown as the engine ranked them (RUN.reviewLimitMs)
    const rctl = new AbortController(), sig = AbortSignal.any ? AbortSignal.any([run.ctl.signal, rctl.signal]) : run.ctl.signal; let late = false;
    const tmo = setTimeout(() => { late = true; rctl.abort(); }, RUN.reviewLimitMs(L.rounds));
    let pool = variants.filter(v => v.elements.length).slice(0, L.pool), extra = [], revised = [], rv = null, params1 = plan.params || {};
    { const a = variants.find(v => v.aiBrief && v.elements.length); if (a && !pool.includes(a)) pool = pool.slice(0, Math.max(0, L.pool - 1)).concat([a]); } // the AI's plan is always among those reviewed
    // the AI's plan, when the engine couldn't do it as written (parking short, it didn't fit, a check failed): High and
    // Ultra let the AI revise its brief once, from the engine's notes, the metrics and the checks; it's laid out and
    // compared in the next round like a revised program's layouts (Medium's one round never revises)
    let briefDone = false, briefRev = '', dropRev = '';
    try {
      rv = await aiReview(plan, prog, pool, 1, ask, sig, L, briefCheckOf(pool, L.rounds >= 2, briefFor, aiDrop));
      if (!live(run)) return;
      // each round the AI may change the program (never on the last): the new program is laid out, and the best three so
      // far (by its ranking) and the new layouts go back to it to compare
      for (let round = 2; round <= L.rounds && !late && (rv.revise && rv.program || rv.brief && !briefDone); round++) {
        const first = rv; let add = [], progR = prog;
        if (rv.revise && rv.program) {
          runStep(run, 4 + o0, (revised.length ? 'Revising again: ' : 'Revising: ') + (rv.why || 'a better program').replace(/\.$/, ''));
          const params2 = RUN.fillParams({ ...params1, ...(rv.params?.streets ? { streets: rv.params.streets } : {}), ...(rv.params?.form ? { form: rv.params.form } : {}) }, { ask }), prog2 = { ...rv.program, ...(rv.params?.storm ? { storm: rv.params.storm } : {}) }; // (its "fill" never holds land the words didn't ask to hold)
          let out2 = []; try { out2 = await laid('options', { ...pl, setbacks, params: params2 }, prog2, { ...(L.revise || { count: 3, depth: 6, budgetMs: 6000 }), ...koOpts(pl), ...(wb ? { brief: wb } : {}) }); } catch (e) { console.warn('layout', e); }
          if (!live(run)) return;
          const v2 = named(out2, { ...plan, params: params2, program: prog2 }, { params: params2, revisedBy: rv.why || 'the AI review' }).filter(v => v.elements.length);
          if (v2.length) { add = v2.slice(0, 3); progR = prog2; params1 = params2; revised.push(first.why || 'a better program'); }
        }
        if (rv.brief && !briefDone) {
          briefDone = true; runStep(run, 4 + o0, 'The AI is revising its plan: ' + (rv.briefWhy || 'the engine couldn’t do it as written').replace(/\.$/, ''));
          const ab2 = { ...rv.brief, revised: true, why: rv.briefWhy || '' }; let a2 = null;
          const bf2 = BR.briefForm(ab2.brief), pB = bf2 ? { ...(plan.params || {}), form: bf2 } : plan.params, planB = { ...plan, ...(pB ? { params: pB } : {}) };
          if (BR.takesBrief(prog, ab2.brief)) try { a2 = aiLayout(await laid('options', planB, prog, { count: 2, ...koOpts(pl), brief: ab2.brief }), planB, prog, ab2, pB ? { params: pB } : {}); } catch (e) { console.warn('AI plan layout', e); }
          if (!live(run)) return;
          if (a2?.v) { add.push(a2.v); briefRev = rv.briefWhy || 'the engine couldn’t do its first plan as written'; }
          else dropRev = BR.droppedNote(ab2.brief, a2?.reason || 'the layout engine couldn’t lay it out', true); // (the revision didn't fit either: said in one line, nothing shown as the AI's)
        }
        if (!add.length) break;
        const nm = RUN.layoutNames([...variants, ...extra, ...add]); add.forEach((v, k) => { v.name = nm[variants.length + extra.length + k]; }); extra = extra.concat(add);
        const keep = [...new Set([...(first.ranking || []), ...pool.map((_, i) => i)])].filter(i => pool[i]).slice(0, 3), kept = keep.map(i => pool[i]);
        pool = kept.concat(add); runStep(run, 4 + o0, 'The AI is comparing the revised layouts');
        try { rv = await aiReview(plan, progR, pool, round, ask, sig, L, briefCheckOf(pool, false, briefFor)); }
        catch (e) { if (!live(run)) return; rv = { ...first, revise: false, brief: null, reviews: (first.reviews || []).filter(r => keep.includes(r.option)).map(r => ({ ...r, option: keep.indexOf(r.option) })), ranking: keep.map((_, k) => k).concat(add.map((_, k) => kept.length + k)) }; } // (the revised layouts come after the reviewed ones, without a score)
        if (!live(run)) return;
      }
      if (!revised.length && !briefRev) runStep(run, 4 + o0, 'Comparing');
    } catch (e) { if (!live(run)) return; console.warn('review', e); rv = null; }
    clearTimeout(tmo);
    if (!live(run) || PL() !== pl) return;
    const aiNote = rv ? [revised.length ? 'After its first look the AI changed the program: ' + revised.map(w => w.replace(/\.$/, '')).join('; then again: ') + '.' + (aiBNote ? ' ' + aiBNote : '') : note, dropRev, briefRev ? 'The engine couldn’t do the AI’s first plan as written, so the AI revised it once: ' + briefRev.replace(/\.$/, '') + '.' : ''].filter(Boolean).join(' ') : '';
    const h = heldIn(run, rv ? { rv, pool, extra, aiNote } : { why: late ? 'timeout' : 'failed' });
    await heldOut(h, { quiet: true });
    if (!live(run)) return;
    saveRun(pl); endRun(run);
  }
  // held layouts into the list: reviewed (ranked by the AI, its pick first, lib/planruns.mjs mergeReviewed) or not (as
  // the engine ranked them, said so), and what goes on the map (RUN.landing). Synchronous, so Cancel can show them
  // before the run ends.
  function heldIn(run, o) {
    const vs = run?.hold, L0 = run?.landing || {}; if (!ed || !vs) return null; run.hold = null;
    ed.variants = vs; ed.readAs = L0.readAs || ed.readAs; ed.runMeta = L0.meta || ed.runMeta; ed.aiSummary = ''; ed.reviewCleared = false; ed.pickedByUser = false; ed.reviewing = false; ed.aiPick = null;
    if (o.rv) { mergeReview(o.rv, o.pool, o.extra); ed.aiNote = o.aiNote || ''; } else ed.aiNote = RUN.unreviewedNote(o.why, L0.note || '');
    const edited = o.why === 'edit' || ed.undo.length !== run.u0 || ed.undo[run.u0 - 1] !== run.top; // changed by hand while the AI looked: nothing replaces it
    return { ...RUN.landing(ed.variants, ed.aiPick, { edited }), edited, reviewed: !!o.rv };
  }
  async function heldOut(h, { quiet = false } = {}) {
    if (!h || !ed) return; const pl = PL(), vs = ed.variants;
    if (h.put >= 0) await useVariant(h.put, { quiet, fresh: true }); else saveRun(pl);
    if (h.offer < 0 || !ed?.variants) return;
    const k = vs[h.offer]?.key, n = numOf(vs[h.offer]), why = h.edited ? ' You changed the plan while the AI was looking, so yours stays on the map.' : '';
    ctx.toast((h.reviewed && h.offer === h.ai ? 'The AI recommends ' + n + (h.failing ? ', though it doesn’t pass every check' : '') + '.' : 'The new layouts are ready: ' + n + ' is the best of them.') + why, { action: { label: 'Use it', run: () => { const j = ed?.variants?.findIndex(v => v.key === k); if (j >= 0) askReplace(() => useVariant(j)); } } });
  }
  // the AI's review into the layouts on the list (lib/planruns.mjs mergeReviewed): scores by key, its order (best first),
  // and the layouts from its revised program after the others. Names don't change, so "Layout 3" is still Layout 3.
  function mergeReview(rv, pool, extra = []) {
    const r = RUN.mergeReviewed(ed.variants || [], pool, rv, extra);
    ed.variants = r.variants; ed.aiSummary = r.summary; ed.aiPick = BR.fairPick(ed.variants, r.first) || null; ed.reviewCleared = false; // (the AI's own plan isn't recommended over one of the engine's that holds clearly more: lib/planbrief.mjs)
  }
  // the AI's pick on the map, unless the person picked another layout (or changed the one on the map) meanwhile
  async function pickAi() {
    const k = ed.aiPick, pl = PL(), i = k && ed.variants ? ed.variants.findIndex(v => v.key === k) : -1; if (i < 0 || pl?.variant?.key === k) return;
    const failing = K.passes(ed.variants[i].chk) === false && ed.variants.some(v => K.passes(v.chk)); // a failing layout never goes on the map by itself when one passes
    if (!ed.pickedByUser && !dirty(pl) && !failing) { await useVariant(i, { quiet: true, fresh: true }); return; }
    const n = numOf(ed.variants[i]); ctx.toast('The AI recommends ' + n + (failing ? ', though it doesn’t pass every check' : '') + '.', { action: { label: 'Use it', run: () => { const j = ed?.variants?.findIndex(v => v.key === k); if (j >= 0) askReplace(() => useVariant(j)); } } });
  }
  // easements on the plan go into every layout run: the layouts keep off them and carry them along
  const koOpts = pl => { const ko = (pl?.elements || []).filter(e => e.kind === 'keepout'); return ko.length ? { keepout: clone(ko) } : {}; };
  // ---------- a run: one build (or idea, more layouts, review, change) at a time, shown and cancellable ----------
  // ed.run = { kind, steps, step, label, t0, ctl, token, src }: lives on the editor, not the page, so a redraw of the
  // panel (Trees, a setting) never loses it. Every await checks live(run) before using what came back; Cancel aborts the
  // AI call and drops whatever arrives after (a layout already running in the worker finishes, unused).
  let runTok = 0, runTick = 0;
  const LAYS = ['build', 'more', 'resolve']; // runs that put layouts on the map: a hand edit before they land cancels them
  const LOCK = ['#spGo', '#spBest', '[data-idea]', '[data-sug]', '#spMore', '#spResolve', '#spNewLay', '#spRefitMine', '#spStaleRefit', '#spStaleNew', '#spReReview', '#spChgGo', '#spChgNew', '[data-eff]', '#spOvUpd'];
  const live = r => !!(r && ed && ed.run === r && !r.cancelled);
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const pillEl = document.createElement('div'); pillEl.className = 'sp-runpill'; pillEl.hidden = true; document.body.appendChild(pillEl);
  function startRun(kind, steps, src, extra) {
    if (!ed || ed.run) return null;
    const r = ed.run = { kind, steps, step: 1, label: steps[0], t0: Date.now(), ctl: new AbortController(), token: ++runTok, src: src || null, ...extra };
    clearInterval(runTick); runTick = setInterval(tickRun, 1000); panel(); return r;
  }
  function runStep(r, n, label) { if (!live(r)) return false; r.step = Math.min(n, r.steps.length); r.label = label || r.steps[r.step - 1]; paintRun(); return true; }
  function endRun(r, o = {}) {
    if (!ed || ed.run !== r) return false;
    ed.run = null; clearInterval(runTick); runTick = 0; pillEl.hidden = true;
    if (!o.quiet) { panel(); if (['build', 'more', 'review'].includes(r.kind) && ed.variants) showLayouts(r); }
    if (ed.solveLater && !r.cancelled) { ed.solveLater = false; resolveSoon(); } // a setting changed while it ran
    return true;
  }
  // Cancel: the AI call stops; layouts already back stay (the engine's, when the AI was still reviewing them: a build's
  // held layouts come in then, said not to be AI-reviewed, the engine's best on the map, so a cancel never leaves nothing)
  function cancelRun(why) {
    const r = ed?.run; if (!r) return; r.cancelled = true; r.ctl.abort();
    const held = r.hold ? heldIn(r, { why: 'cancelled' }) : null;
    const mid = !held && ed.reviewing && ed.variants?.length; ed.reviewing = false;
    if (mid) { ed.aiNote = RUN.unreviewedNote('cancelled'); saveRun(); }
    endRun(r); if (why || !mid) ctx.toast(why || (held ? 'AI review cancelled: the layouts are shown as the engine ranked them, not reviewed by the AI.' : r.kind === 'best' ? 'Ideas cancelled.' : r.kind === 'change' ? 'Change cancelled.' : r.kind === 'build' ? 'Build cancelled' : r.kind === 'review' ? 'Review cancelled.' : 'Cancelled: the layouts stay as they were.'));
    if (held) heldOut(held);
  }
  // the plan closes or another option opens: a build's held layouts are kept with the option (its saved run, said not to
  // be AI-reviewed), the plan on the map as it was
  function killRun() { const r = ed?.run; if (!r) return; r.cancelled = true; r.ctl.abort(); if (r.hold) keepHeld(r); ed.run = null; clearInterval(runTick); runTick = 0; pillEl.hidden = true; }
  function keepHeld(r) {
    const pl = PL(), L0 = r.landing || {}, vs = r.hold; r.hold = null; if (!pl || !vs?.length) return;
    pl.lastRun = RUN.slimRun({ ask: L0.meta?.ask || '', note: RUN.unreviewedNote('closed', L0.note || ''), ...(L0.readAs ? { read: L0.readAs } : {}), at: L0.meta?.at || new Date().toISOString(), ...(L0.meta?.effort ? { effort: L0.meta.effort } : {}), aiReviewed: false, variants: vs }, pl.variant?.key);
    save(projOf(pl));
  }
  // a hand edit while layouts are still coming: they'd replace it, so the run stops instead
  function handEdit() { const r = ed?.run; if (r && !r.applied && LAYS.includes(r.kind) && !applying) cancelRun('Build cancelled: you changed the plan while it was laying out.'); }
  // after a run: the Layouts section in view, right under the overview when it fits, else scrolled up under the header
  // (on phones the sheet comes up first). If the person scrolled while it ran, only when the section is off screen.
  function showLayouts(r) {
    const go = () => {
      const sec = ed && card.querySelector('#spLayouts'), top = card.querySelector(':scope>.top'); if (!sec) return;
      const c = card.getBoundingClientRect(), s = sec.getBoundingClientRect(), head = top ? top.getBoundingClientRect().bottom : c.top, vis = Math.min(c.bottom, innerHeight);
      const at0 = s.top + card.scrollTop, under = card.scrollTop + s.top - head - 6; // the section's top with the card at the top; the scroll that puts it under the header
      if (r?.userScrolled) { if (s.top >= head - 4 && s.top < vis - 80) return; card.scrollTop = under; return; }
      card.scrollTop = card.scrollTop <= 2 && at0 + Math.min(180, s.height) <= vis ? 0 : under; // already scrolled (the header folded): under the header, never back up past it
      requestAnimationFrame(() => requestAnimationFrame(() => { // the header folds as the card scrolls: settle under it
        const t2 = card.querySelector(':scope>.top'), h2 = t2 ? t2.getBoundingClientRect().bottom : 0, s2 = sec.isConnected && sec.getBoundingClientRect(); if (s2 && card.scrollTop > 2 && Math.abs(s2.top - h2 - 6) > 3) card.scrollTop += s2.top - h2 - 6; }));
    };
    if (phone() && card.classList.contains('sp-mode') && !card.classList.contains('half') && !card.classList.contains('full')) { sheetQuiet = true; card.classList.remove('min'); card.classList.add('half'); setTimeout(() => { go(); if (ed && !planInView()) planFit(); }, 340); }
    else go();
  }
  for (const ev of ['wheel', 'touchmove', 'keydown']) card.addEventListener(ev, e => { if (ed?.run && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && (ev !== 'keydown' || /^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key))) ed.run.userScrolled = true; }, { passive: true });
  const runText = r => (r.steps.length > 1 ? 'Step ' + r.step + ' of ' + r.steps.length + ' · ' : '') + r.label;
  // a build whose layouts wait for the AI review: the Layouts section is this card, the run's steps (done, under way, to
  // come), the time and Cancel, until the reviewed layouts come in
  function holding(r) { return !!(r && r.kind === 'build' && (r.hold || r.holds)); }
  function runCardBody(r) {
    const steps = r.steps.map((t, i) => { const n = i + 1, st = n < r.step ? 'done' : n === r.step ? 'now' : 'todo'; return '<li class="' + st + '"' + (st === 'now' ? ' aria-current="step"' : '') + '>' + esc(st === 'now' ? r.label : t) + '</li>'; }).join('');
    return '<p class="sp-rc-h">The new layouts show here once the AI has checked, confirmed and rated them.</p><ol class="sp-rc-steps">' + steps + '</ol>' +
      '<div class="sp-rc-f"><span>Step ' + r.step + ' of ' + r.steps.length + ' · <span class="sp-rt" data-rt>' + mmss(Date.now() - r.t0) + '</span></span><button type="button" class="btn sm" data-cancel>Cancel</button></div>' +
      '<p class="rnote">If the AI’s review doesn’t come back, the engine’s layouts are shown instead, marked as not reviewed.</p>';
  }
  function runCardHtml(r) { return '<div class="sp-runcard" id="spRunCard">' + runCardBody(r) + '</div>'; }
  function runHtml(r) {
    return '<div class="sp-run" id="spRun"><span class="sp-run-dot" aria-hidden="true"></span><span class="sp-run-t" role="status">' + esc(runText(r)) + '</span>' +
      '<span class="sp-rt" data-rt aria-label="elapsed">' + mmss(Date.now() - r.t0) + '</span><button type="button" class="sp-run-x" data-cancel>Cancel</button>' +
      '<span class="sp-run-bar" aria-hidden="true" style="--p:' + (r.step - 1) / r.steps.length + '"></span></div>';
  }
  // the strip in the header (and, on phones, a pill floating above the sheet) follow the run without redrawing the panel
  function paintRun() {
    const r = ed?.run; if (!r) { pillEl.hidden = true; return; }
    const strip = card.querySelector('#spRun'); if (strip) { strip.querySelector('.sp-run-t').textContent = runText(r); strip.querySelector('.sp-run-bar')?.style.setProperty('--p', (r.step - 1) / r.steps.length); }
    const rc = card.querySelector('#spRunCard'); if (rc) { if (holding(r)) { rc.innerHTML = runCardBody(r); rc.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => cancelRun()); } else redrawLayouts(); } // (the card follows the steps; a build that stopped holding shows its layouts)
    if (phone() && card.classList.contains('sp-mode')) {
      pillEl.innerHTML = '<span class="sp-run-dot" aria-hidden="true"></span><span class="sp-run-t" role="status">' + esc(r.steps.length > 1 ? r.step + '/' + r.steps.length + ' · ' + r.steps[r.step - 1] : r.label) + '</span><span class="sp-rt" data-rt>' + mmss(Date.now() - r.t0) + '</span><button type="button" class="sp-run-x" data-cancel aria-label="Cancel">Cancel</button>';
      pillEl.querySelector('[data-cancel]').onclick = () => cancelRun(); pillEl.hidden = false; placePill();
    } else pillEl.hidden = true;
  }
  function placePill() { if (pillEl.hidden) return; const top = card.getBoundingClientRect().top; pillEl.style.bottom = Math.round(Math.max(8, Math.min(innerHeight - 140, innerHeight - top + 10))) + 'px'; }
  function tickRun() {
    const r = ed?.run; if (!r) { clearInterval(runTick); runTick = 0; pillEl.hidden = true; return; }
    const t = mmss(Date.now() - r.t0); for (const el of [...card.querySelectorAll('[data-rt]'), ...pillEl.querySelectorAll('[data-rt]')]) el.textContent = t;
    if (phone() === pillEl.hidden) paintRun(); else placePill();
  }
  // while a run is on: one of each thing at a time (Build, ideas, More layouts, suggestions…), the button that started it spinning
  function lockRun() {
    const r = ed?.run; if (!r) return;
    for (const q of LOCK) card.querySelectorAll(q).forEach(b => { b.disabled = true; if (!b.title) b.title = 'Wait for the run under way, or Cancel it'; });
    const b = r.src && card.querySelector(r.src); if (b) { b.classList.add('busy'); b.setAttribute('aria-busy', 'true'); }
    card.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => cancelRun());
    paintRun();
  }
  // AI availability: after a 503 the AI is taken as off for 5 minutes (kept on ctx, so another plan knows too); then tried again
  const aiOff = () => !!(ctx.spAiOff && Date.now() - ctx.spAiOff < 3e5);
  const aiSaw = e => { if (e?.status === 503) ctx.spAiOff = Date.now(); };
  // changes by name: the AI reads the plan (its pieces, a picture of it) and the words, and answers with edits on those
  // pieces, or on every piece of a sort ("all the apartments 3 stories"); they're applied here, pinned, and the rest
  // re-fits round them when asked. Homes on lots change stories through the home mix ("no 3-story homes"): the program
  // and recipe take the new mix and the site re-fits, the lots laid out again along the same streets at the widths
  // those homes need. Without the AI the words are read directly ("make bldg 7 four stories", "remove bldg 3").
  async function aiChange() {
    const p = P(), pl = PL(); if (!pl?.elements.length) return;
    const ask = (ed.chg || '').trim(); if (!ask) { ctx.toast('Say what to change, e.g. “make Apt Bldg 7 four stories”.'); card.querySelector('#spChg')?.focus(); return; }
    if (ed.run) { ctx.toast('Wait for the run under way, or Cancel it.'); return; }
    const off = aiOff(), run = startRun('change', [off ? 'Reading your words' : 'Reading the plan and your request', 'Making the changes'], '#spChgGo'); if (!run) return;
    const sel = ed.sel; let ops = [], mix = null, names = null, stn = null, full = false, note = '', question = null, byAi = false; // (stn: street names on or off, and a theme)
    try {
      if (off) throw Object.assign(new Error('AI off'), { status: 503 });
      let image = null; try { image = await planImage(pl); } catch (e) { /* words and numbers only */ }
      const d = await post({ mode: 'edit', prompt: ask, site: siteInfo(p, pl), plan: ED.describePlan(pl, sel), image }, run.ctl.signal);
      ops = d.ops || []; mix = d.homeMix?.length ? d.homeMix : null; names = d.names?.community || d.names?.parts?.length ? d.names : null; stn = typeof d.streetNames?.on === 'boolean' ? d.streetNames : null; full = d.refit === 'full'; note = d.summary || ''; question = d.question; byAi = true;
    } catch (e) { if (!live(run)) return; names = ED.guessNames(ask, pl, sel); const said = names ? names.rest : ask; ops = said ? ED.guessEdits(said, pl, sel) : []; mix = said ? ED.guessMix(said, pl) : null; full = /\bre-?(?:fit|lay)/i.test(ask); note = (e.status === 503 ? 'AI isn’t set up on this site, so ' : 'The AI didn’t answer, so ') + 'this read your words directly.'; } // (names first: "call the neighbourhood…" never renames a piece; the rest of the words are edits)
    if (!live(run) || PL() !== pl) return;
    const hm = mix && pl.recipe ? ED.withHomeMix(pl, mix) : null; // (a plan drawn by hand has no layout to lay the lots out again with)
    if (!ops.length && !hm && !names && !stn) { ed.chgDone = null; ed.chgNote = question || (mix ? 'This plan was drawn by hand, so its homes can’t be laid out again with a new mix: change the Home mix in Settings and build new layouts.' : (byAi ? 'The AI didn’t find anything on the plan to change for that.' : note) + ' Name the piece as it’s labelled (“Apt Bldg 7”), select it and say “it”, or say what to change across the site (“all the apartments 3 stories”, “no 3-story homes”).'); endRun(run); return; }
    full = (full || ed.chgFit || !!hm) && !!pl.recipe; runStep(run, 2);
    const depth = ed.undo.length, was = pl.elements.slice(), prog0 = pl.program, recipe0 = pl.recipe; // to undo it, and to show what went
    const homeOk = e => !(e.kind === 'building' && e.use === 'sfr' && e.pinned && !hm.mix.some(t => t.stories === (e.floors || 1))); // a home placed by hand that the new mix leaves out is laid out again
    if (!ops.length && !hm) full = false; // (names alone never re-fit)
    const net0 = pl.recipe?.net ? netSig(pl) : null; // (a neighbourhood's streets changed: its lots re-flow along them)
    let r = null; change(x => { r = ED.applyEdits(x, ops, { refit: full, spare: x.spareRows = (x.spareRows || []).slice(-40) }); x.elements = r.elements; if (r.zones) x.zones = r.zones; if (r.streets !== (x.streets || [])) x.streets = r.streets; if (r.recipe) x.recipe = r.recipe;
      if (hm) { x.program = hm.program; x.recipe = hm.recipe; x.elements = x.elements.map(e => homeOk(e) ? e : { ...e, pinned: false }); }
      if (names) { const n = ED.applyNames(x, names); x.program = n.program; r.done.push(...n.done); r.skipped.push(...n.skipped); } }); // the community's and the parts' names, in the same undo step (after the home mix's program, so it keeps them)
    if (mix && !hm) r.skipped.push('This plan was drawn by hand, so its homes can’t be laid out again with a new mix: change the Home mix in Settings and build new layouts.');
    if (!hm && ops.length && ops.every(o => /^pod:/.test(o.target || '') || o.action === 'relay' || o.action === 'swap' && o.kind === 'pod')) full = false; // (pods only: laid out again below, or renamed; nothing else to re-fit)
    if (r.pods?.length && pl.recipe?.pods) { // pods laid out again or swapped, in the same undo step: merged and checked there, so no re-fit after
      run.steps = [...run.steps, 'Laying those pods out again']; runStep(run, 3); let rp = null; try { rp = await laid('pods', PL(), r.pods); } catch (e) { console.warn('pods', e); } if (!live(run)) return;
      if (rp && !rp.error && rp.elements?.length && PL() === pl) { pl.elements = rp.elements; pl.zones = rp.zones; pl.recipe = clone(rp.recipe); if (rp.program) pl.program = rp.program; pl.spareRows = []; markEdited(pl); handEdit(); /* (after change(), which saw nothing move: the plan is edited, so a Settings change asks before replacing it) */ r.done = r.done.map(t => t.replace(/^Re-laying (.+)…$/, 'Re-laid $1.').replace(/^Swapping (.+)…$/, 'Swapped $1.'));
        for (const t of rp.notes || []) if (/isn’t|aren’t|fits about|nothing lays|no drive reaches|stay where/.test(t)) r.skipped.push(t); }
      else r.skipped.push(rp?.error || 'Those pods couldn’t be laid out again; they stay as they were.');
      if (!hm && !ops.some(o => !/^pod:/.test(o.target || '') && o.action !== 'relay' && !(o.action === 'swap' && o.kind === 'pod'))) full = false; }
    if (r.blocks?.length && pl.recipe?.net) { // a neighbourhood's blocks laid out again (lib/streetnet.mjs relayBlock), in the same undo step
      run.steps = [...run.steps, 'Laying the block’s streets out again']; runStep(run, 3);
      for (const b of r.blocks) { let rb = null; try { rb = await laid('net', PL(), { ...b, k: relayNext(b.at) }); } catch (e) { console.warn('relay', e); } if (!live(run)) return;
        if (rb && !rb.error && rb.elements?.length && PL() === pl) { pl.elements = rb.elements; pl.recipe = clone(rb.recipe); pl.spareRows = []; markEdited(pl); handEdit(); if (ed.relayK && rb.block) ed.relayK.block = rb.block; const i = r.done.indexOf('Laying that block’s streets out again…'); if (i >= 0) r.done[i] = (rb.notes || [])[0] || 'Laid that block’s streets out again.'; }
        else { r.done = r.done.filter(t => t !== 'Laying that block’s streets out again…'); r.skipped.push(rb?.error || 'That block couldn’t be laid out again; it stays as it was.'); } }
      if (!hm && ops.every(o => o.action === 'relay')) full = false;
      if (!stn && !r.streetNames && PL() === pl) { const x = await newNames(pl); if (!live(run)) return; if (x && PL() === pl) { const n = SNm.applyNames(pl, x.names); pl.elements = n.elements; pl.recipe = n.recipe; r.done.push('Named the block’s new streets.' + (x.note ? ' ' + x.note : '')); } } } // (street names on: the new streets named too)
    const netMoved = net0 != null && net0 !== netSig(pl) && !r.blocks?.length; if (netMoved) full = true; // (a street ended, bowed or taken out: its lots re-flow, and losing the homes on it is what was asked)
    const gone = was.filter(e => !['parking', 'green', 'lot', 'trail'].includes(e.kind) && !pl.elements.some(x => x.id === e.id)); // removed (not parking rows that gave way)
    if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null; draw(); // Edit Layout stays as it was
    // the re-fit keeps the streets as they are (keep): it never quietly starts the whole site over with new streets; when
    // that leaves a problem or short parking it says so and offers New Layouts
    let held = null, newLay = false; if (full) { run.steps = [...run.steps, 'Re-fitting the rest of the site']; runStep(run, 3); let rf = null; try { rf = await refitOf(PL(), { amount: 'current', keep: true }); } catch (e) { console.warn('refit', e); }
      if (!live(run)) return;
      let kept = null; if (rf?.kept && PL() === pl) { const pin = new Set(rf.elements.filter(e => e.pinned).map(e => e.id)), m = SP.metrics({ ...pl, elements: rf.elements }), bad = SP.check({ ...pl, elements: rf.elements }).filter(i => i.level === 'bad' && !pin.has(i.id)).length, short = Math.max(0, Math.round(m.required - m.spaces));
        kept = 'Kept the street arrangement: re-fitting round the change left ' + (bad ? (bad === 1 ? 'a problem' : bad + ' problems') + (short ? ' and parking ' + SP.spacesWord(short) + ' short' : '') : 'parking ' + SP.spacesWord(short) + ' short') + '. New Layouts lays the whole site out afresh.'; newLay = true; }
      // the same guard as re-fitting after a hand edit: a re-fit that would lose homes, units or floor area (a whole street
      // of houses dropped round a moved community center) or add problems isn't taken; the change stays and Re-fit
      // anyway is offered
      const at = els => ({ m: GM({ ...pl, elements: els }), issues: GC({ ...pl, elements: els }) }), v = rf && PL() === pl ? T.refitVerdict(at(pl.elements), at(rf.elements)) : null;
      if (hm) { // a new home mix is only real once the lots are laid out again: fewer homes on wider lots is what was asked for
        if (rf && PL() === pl) { pl.elements = rf.elements; pl.spareRows = []; if (rf.recipe) pl.recipe = clone(rf.recipe); if (rf.zones) pl.zones = clone(rf.zones); if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null;
          const n0 = was.filter(e => e.kind === 'building' && e.use === 'sfr').length, n1 = pl.elements.filter(e => e.kind === 'building' && e.use === 'sfr').length;
          r.done.push('Home mix: ' + ED.mixText(hm.mix) + '; ' + (n0 === n1 ? n1 + ' homes' : n0 + ' → ' + n1 + ' homes') + ', the lots laid out again along the same streets.');
          if (v?.why === 'problems') r.skipped.push('Laying the homes out again left a problem or two: see the checks.'); }
        else { pl.program = prog0; pl.recipe = recipe0; r.skipped.push('The homes couldn’t be laid out again with that mix, so their stories didn’t change.' + (refitNo ? ' ' + refitNo : '')); } }
      else if (v && !v.ok && !netMoved) { r.skipped.push('Re-fitting the rest of the site would have ' + (v.why === 'problems' ? 'added problems' : v.why === 'units' ? 'lost homes or units' : 'lost floor area') + ', so only those pieces changed.'); held = rf; rf = null; }
      else if (PL() === pl && rf) { pl.elements = rf.elements; pl.spareRows = []; if (rf.recipe) pl.recipe = clone(rf.recipe); if (rf.zones) pl.zones = clone(rf.zones); if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null; }
      else if (!rf && !held) { r.skipped.push('The rest couldn’t be re-fitted around it, so only those pieces changed.'); newLay = true; }
      if (kept && rf) r.skipped.push(kept); } // (held back: the line above says why)
    const asked = stn || (r.streetNames?.hand ? null : r.streetNames || null); stn ||= r.streetNames || null; // street names: on (the streets named, every one again for a theme), off (hidden, kept), or switched on by a street named here (named, nothing else)
    if (stn && pl.recipe?.net && PL() === pl) { const sn = { ...(pl.params?.streetNames || {}), on: stn.on !== false, ...(stn.theme ? { theme: stn.theme } : {}) }; pl.params = { ...(pl.params || {}), streetNames: sn };
      if (stn.on === false) r.done.push('Street names off (kept for when they’re turned on again).');
      else if (asked) { run.steps = [...run.steps, 'Naming the streets']; runStep(run, run.steps.length - 1); const x = await streetNamesOf(p, pl, !!asked.theme, r.named || []); if (!live(run)) return; // (a street named in the same words keeps that name)
        if (x && PL() === pl) { const n = SNm.applyNames(pl, x.names); pl.elements = n.elements; pl.recipe = n.recipe; r.done.push(namedSay(x, sn.theme || '')); } } }
    // what it did as a checklist, with Undo this change, and (parking short) Re-fit around my changes; on the map, what
    // it touched flashes and what it removed fades out
    ed.chgNote = ''; ed.chgDone = { items: MAP.checklist(r.done), skipped: r.skipped, note, depth, after: ed.undo.length, held, newLay };
    ed.chg = ''; pl.updated = new Date().toISOString(); save(P()); endRun(run);
    flash(r.touched.filter(id => pl.elements.some(x => x.id === id))); fadeGone(gone, pl);
    card.querySelector('#spChgDone')?.scrollIntoView({ block: 'nearest' });
  }
  function chgHtml(pl) {
    const D = ed.chgDone, note = ed.chgNote ? '<div class="rnote sp-ainote" id="spChgNote">' + esc(ed.chgNote) + '</div>' : '';
    if (!D) return note;
    const m = GM(pl), short = Math.max(0, Math.round(m.required - m.spaces)), still = ed.undo.length === D.after; // nothing else changed since
    return note + '<div class="sp-chgdone" id="spChgDone" role="status">' + (D.note ? '<div class="rnote">' + esc(D.note) + '</div>' : '') +
      '<ul class="sp-chk">' + D.items.map(t => '<li>' + esc(t) + '</li>').join('') + D.skipped.map(t => '<li class="skip">' + esc(t) + '</li>').join('') + '</ul>' +
      (short > 0 && m.gfa ? '<div class="rnote sp-warn">Parking is now ' + SP.spacesWord(short) + ' short.</div>' : '') +
      '<div class="sp-row sp-chg-acts">' + (D.held && still ? '<button type="button" class="btn sm" id="spChgHeld" title="Take the re-fit anyway: the rest of the site laid out again around the change">Re-fit Anyway</button>' : '') + (short > 0 && m.gfa && pl.recipe && !D.held ? '<button type="button" class="btn sm primary" id="spChgRefit" title="Lay the parking and the rest out again around what changed">Re-fit Around My Changes</button>' : '') +
      (D.newLay && still ? '<button type="button" class="btn sm" id="spChgNew" title="Lay the whole site out afresh from its program, with new streets: the pieces placed by hand (this change too) aren’t carried over. Undo brings this plan back">New Layouts</button>' : '') +
      (still ? '<button type="button" class="btn sm" id="spChgUndo">Undo This Change</button>' : '') + '<button type="button" class="btn sm ghost" id="spChgOk">Dismiss</button></div></div>';
  }
  function wireChg() {
    const D = ed.chgDone, $ = q => card.querySelector(q);
    if ($('#spChgRefit')) $('#spChgRefit').onclick = () => refitNow(true);
    if ($('#spChgHeld')) $('#spChgHeld').onclick = () => { const pl = PL(); if (!D?.held || !pl || ed.undo.length !== D.after) return; const rf = D.held; change(x => { x.elements = rf.elements; x.spareRows = []; if (rf.recipe) x.recipe = clone(rf.recipe); if (rf.zones) x.zones = clone(rf.zones); }); D.held = null; D.after = ed.undo.length; if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null; draw(); panel(); ctx.toast('Re-fitted the rest of the site.', { action: { label: 'Undo', run: () => undo(true) } }); };
    if ($('#spChgUndo')) $('#spChgUndo').onclick = () => { if (!D || ed.undo.length !== D.after) return; while (ed.undo.length > D.depth) undo(true); ed.chgDone = null; clearGone(); panel(); ctx.toast('Change undone.'); };
    if ($('#spChgNew')) $('#spChgNew').onclick = () => resolve({ force: true, src: '#spChgNew' });
    if ($('#spChgOk')) $('#spChgOk').onclick = () => { ed.chgDone = null; panel(); };
  }
  // Change With AI on the map: the pieces it touched flash a few times; the ones it removed leave a dashed footprint that fades
  let flashT = 0, goneT = 0;
  function flash(list) {
    clearTimeout(flashT); if (!ed || !list.length) return; const e0 = ed; ed.flash = { ids: new Set(list) }; let n = 0;
    const op = v => { if (map.getLayer('fs-sp-flash')) map.setPaintProperty('fs-sp-flash', 'line-opacity', v); };
    op(1); draw(); const step = () => { if (ed !== e0) return; n++; if (n > 5) { ed.flash = null; op(1); draw(); return; } op(n % 2 ? .2 : 1); flashT = setTimeout(step, n === 5 ? 900 : 320); };
    flashT = setTimeout(step, 320);
  }
  function fadeGone(list, pl) {
    clearGone(); const s = map.getSource(XSRC); if (!s || !list.length || !pl?.origin) return; const F = SP.frame(pl.origin);
    s.setData({ type: 'FeatureCollection', features: list.map(e => { const o = SP.outline(e).map(F.toLL); return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: o.concat([o[0]]) } }; }) });
    let n = 0; const step = () => { n++; if (!map.getLayer('fs-sp-gone')) return; if (n >= 16) { clearGone(); return; } map.setPaintProperty('fs-sp-gone', 'line-opacity', .85 * (1 - n / 16)); goneT = setTimeout(step, 250); }; // about 4 s
    if (map.getLayer('fs-sp-gone')) map.setPaintProperty('fs-sp-gone', 'line-opacity', .85); goneT = setTimeout(step, 250);
  }
  function clearGone() { clearTimeout(goneT); goneT = 0; map.getSource(XSRC)?.setData(EMPTY); }
  // what should go here: the site, its surroundings and the market, read by the AI; each idea can be laid out
  async function bestUse() {
    const p = P(), pl = PL(); if (!pl || pl.ring.length < 3) return;
    if (ed.run) { ctx.toast('Wait for the run under way, or Cancel it.'); return; }
    if (aiOff()) { ctx.toast('AI isn’t set up on this site.'); panel(); return; }
    const run = startRun('best', ['Reading the site and what’s around it', 'Asking the AI for ideas (up to a minute)'], '#spBest'); if (!run) return;
    const c = SP.frame(pl.origin).toLL(SP.centroid(pl.ring)), within = (pr, ms) => Promise.race([pr, new Promise(res => setTimeout(() => res(null), ms))]), signal = run.ctl.signal;
    const kinds = ['grocery', 'restaurant', 'gas', 'pharmacy', 'school', 'hospital', 'clinic', 'mall', 'hotel', 'childcare', 'storage', 'highway'];
    const near = await Promise.all(kinds.map(k => within(fetch('api/nearby?' + new URLSearchParams({ lat: c[1].toFixed(5), lon: c[0].toFixed(5), what: k, limit: '3' }), { signal }).then(r => r.ok ? r.json() : null).catch(() => null), 12000)));
    if (!live(run)) return;
    const nearby = Object.fromEntries(kinds.map((k, i) => [k, (near[i]?.places || []).slice(0, 3).map(x => ({ name: x.name || x.kind || k, miles: x.miles }))]).filter(([, v]) => v.length));
    const market = {}; try { const area = ctx.areaData ? await within(ctx.areaData(), 6000) : null, parcel = p.parcels.find(x => x.key === pl.parcel) || p.parcels[0], z = parcel?.situsZip || parcel?.zip, r = z && area?.rents?.zips?.[z]; if (r) Object.assign(market, { zip: z, typicalRent: r.rent, rentChangeYearPct: r.yoy ?? null }); } catch (e) {}
    if (!runStep(run, 2)) return;
    try {
      const d = await post({ mode: 'bestuse', prompt: (ed.ask || '').trim(), site: siteInfo(p, pl), facts: await factsFor(pl), nearby, market }, signal);
      if (!live(run) || PL() !== pl) return; ed.ideas = { list: d.ideas || [], summary: d.summary || '', used: null }; ed.ideasOpen = true; if (pl.lastRun && ed.ideas.list.length) { pl.lastRun.ideas = ed.ideas; save(p); }
    } catch (e) { if (!live(run)) return; if (e.status !== 503) ed.ideas = { list: [], summary: 'The AI didn’t answer just now. Try again in a moment.' }; } // AI off: the line under the buttons says so
    endRun(run); card.querySelector('#spIdeas')?.scrollIntoView({ block: 'nearest' });
  }
  // the AI's ideas: its read of the site above them, then each idea with how well it fits (a bar), why, what to check and
  // the request it would build. Once one is laid out they fold to a line, the one in use marked.
  function ideasHtml() {
    const I = ed?.ideas; if (!I) return '';
    if (!I.list?.length) return I.summary ? '<div class="sp-callout">' + esc(I.summary) + '</div>' : '';
    const used = I.used != null ? I.list[I.used] : null, open = ed.ideasOpen ?? !used;
    const head = '<div class="sp-ideas-h"><button type="button" class="sp-tgl" data-ideas="' + (open ? 'close' : 'open') + '" aria-expanded="' + open + '">Ideas from the AI (' + I.list.length + ')' + CHEV + '</button>' + (used && !open ? '<span>Using <b>' + esc(used.title) + '</b></span>' : '') + '</div>';
    if (!open) return head;
    const bar = f => { const v = Math.max(0, Math.min(100, Math.round(+f || 0))); return '<span class="sp-fitbar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="Fit for this site: ' + v + ' out of 100" title="Fit for this site: ' + v + ' out of 100"><i style="width:' + v + '%"></i></span>'; };
    return head + '<div class="sp-ideas">' + (I.summary ? '<div class="sp-callout"><b>The AI’s read of the site</b>' + esc(I.summary) + '</div>' : '') +
      I.list.map((it, i) => '<div class="sp-idea' + (i === I.used ? ' on' : '') + '"><div class="sp-idea-h"><b>' + esc(it.title) + '</b>' + (i === I.used ? '<i class="sp-onmap">In use</i>' : '') + bar(it.fit) + '</div><div class="sp-idea-w">' + esc(it.why) + '</div>' +
        (it.risks?.length ? '<ul class="sp-risks" aria-label="To check">' + it.risks.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '') +
        '<div class="sp-idea-req"><span>Will build</span> <q>' + esc(it.request) + '</q></div>' +
        '<div class="sp-row"><button type="button" class="btn sm" data-idea="' + i + '">Lay This Out</button><button type="button" class="btn sm ghost" data-ideaedit="' + i + '" title="Put this request in the box to change it first">Edit Request</button></div></div>').join('') +
      '<div class="rnote sp-ideas-foot">Starting points from the AI, not a market study.</div></div>';
  }
  // ---------- layouts: what a build made, kept on the option (pl.lastRun) so switching options, closing or reloading keeps them ----------
  // Generated layouts are "Layout 1, 2, 3…" (numbers, never letters, so they can't be mistaken for an Option). Each has a
  // key that finds it again after a re-sort, More layouts or a re-solve; pl.variant says which one is on the map.
  const projOf = pl => db.projects.find(x => x.plans.some(y => y.id === pl?.id)) || P();
  const planFor = (v, pl) => ({ ...pl, setbacks: v.setbacks || pl.setbacks, program: v.program || pl.program, params: v.params || pl.params, zones: v.zones || pl.zones || [], elements: v.elements || [] });
  // the money for a layout, from the same land price and assumptions as the Pro forma
  function finFor(v, pl) {
    const p = projOf(pl); if (!p || !v.elements?.some(e => e.kind === 'building' && e.use !== 'amenity')) return null;
    try { const x = G.effective(planFor(v, pl)); return RUN.finOf(PF.run(x, pfMerge(PF.defaults(x, landGuess(p, x)), pl.pf))); } catch (e) { console.warn('layout money', e); return null; }
  }
  const finStamp = pl => { const p = projOf(pl); return RUN.hash(JSON.stringify(pl?.pf || {}) + '|' + (p && pl ? landGuess(p, pl) || '' : '')); };
  // engine output → layouts: numbers, money, a key and a name. extra: fields every one carries (the AI's revised params)
  function named(list, plan, extra = {}) {
    const stamp = finStamp(plan), laidAs = GON(plan) ? G.settingsOf(plan).scenario : null, vs = list.map(r => { const v = { ...r, ...extra, arr: r.arr || RUN.baseName(r.name), setbacks: r.setbacks || plan.setbacks, laidAs }; // laidAs: the Waller scenario it was laid out for
      if (r.pondDepth) v.params = G.withPondDepth({ ...plan, params: v.params || plan.params }, r.pondDepth).params; // a deeper pond's layout: its depth goes on the plan's stormwater (or guardrail) setting when it's used, so its detention is measured at that depth
      v.m = GM({ ...plan, program: v.program || plan.program, params: v.params || plan.params, elements: v.elements }); v.fin = finFor(v, plan); v.finAt = stamp; return derive(v, plan); });
    const keys = RUN.layoutKeys(vs), names = RUN.layoutNames(vs);
    return vs.map((v, i) => ({ ...v, rank: -i, key: keys[i], name: names[i] }));
  }
  // once per layout: what the checks find (the same levels as the overview) and Phase 1's numbers when it has a Phase 2
  function derive(v, plan) {
    if (!v.elements?.length) { if (!v.chk && v.m) v.chk = { bad: null, short: K.checksOf([], v.m).short }; return v; }
    const p2 = planFor(v, plan); if (!v.m) v.m = GM(p2);
    if (!v.chk || v.chk.bad == null) v.chk = K.checksOf(GC(p2), v.m);
    if (v.m1 === undefined) v.m1 = v.elements.some(e => e.phase === 2) ? GM({ ...p2, elements: v.elements.filter(e => e.phase !== 2) }) : null;
    return v;
  }
  const pickIdx = () => { const k = PL()?.variant?.key; return k && ed?.variants ? ed.variants.findIndex(v => v.key === k) : -1; };
  const numOf = v => (v?.name || '').match(/^Layout \d+/)?.[0] || 'That layout';
  // the run, saved on the option: the request, the AI's note and ideas, and up to six layouts (lib/planruns.mjs slims it)
  function saveRun(pl = PL()) {
    if (!pl || !ed?.variants) return;
    const meta = ed.runMeta || pl.lastRun || {};
    pl.lastRun = RUN.slimRun({ ask: meta.ask || '', note: ed.aiNote || '', ...(ed.aiSummary ? { summary: ed.aiSummary } : {}), ...(ed.sortBy && ed.sortBy !== 'rec' ? { sort: ed.sortBy } : {}), ...(ed.ideas?.list?.length ? { ideas: ed.ideas } : {}), ...(ed.readAs ? { read: ed.readAs } : {}), ...(ed.aiPick ? { pick: ed.aiPick } : {}), at: meta.at || new Date().toISOString(), ...(meta.effort ? { effort: meta.effort } : {}), aiReviewed: ed.variants.some(v => v.ai), variants: ed.variants }, pl.variant?.key);
    save(projOf(pl));
  }
  // money again for every layout (the Pro forma's assumptions changed); shortly after the last change
  let finT = 0;
  function refreshFin(now) {
    clearTimeout(finT); const go = () => { const pl = PL(); if (!pl || !ed?.variants) return; const st = finStamp(pl); let n = 0;
      for (const v of ed.variants) if (v.elements?.length && v.finAt !== st) { v.fin = finFor(v, pl); v.finAt = st; n++; }
      if (n) { redrawLayouts(); if (pl.lastRun) { pl.lastRun = RUN.slimRun({ ...pl.lastRun, variants: ed.variants }, pl.variant?.key); persist(); } } };
    if (now) go(); else finT = setTimeout(go, 400);
  }
  const $M = v => v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + 'M' : f0(Math.abs(v))), pc2 = v => v == null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(2) + '%';
  // the money's tooltip: where the numbers come from and the land price used
  function finTip(v, pl) {
    const f = v.fin; if (!f) return '';
    const lp = landGuess(projOf(pl), planFor(v, pl));
    return 'From the Pro forma’s assumptions' + (f.method === 'simple' ? ' (TestFit method)' : '') + ', the same numbers as its Pro forma section once it’s on the map. Land at ' + $M(f.land) + (lp ? ' (the parcels’ appraised value, with closing costs)' : ' (about $175,000 an acre, the default; set yours under Pro forma)') + ', so most layouts look less rosy than a land-free estimate would. Change any assumption under Pro forma.';
  }
  // ---------- the Layouts section: a comparison ----------
  // Each card: a small drawing, the layout's name, a fixed grid of numbers that matches the Pro forma (Phase 1 first,
  // parking, value and cost, yield), whether it passes the checks, the AI's score, badges across the set (Recommended,
  // Most floor area, Best yield) and what it has compared with the recommended one. Failing layouts go after passing ones;
  // layouts with the same numbers as an earlier one fold into it. lib/planpick.mjs does the deciding.
  const vthumbs = new Map(); let thumbIO = null;
  const thumbKey = v => v.key + '|' + (v.elements?.length || 0) + '|' + RUN.hash(JSON.stringify(v.elements?.[0] || '') + JSON.stringify(v.elements?.[v.elements.length - 1] || ''));
  function vthumb(v, pl) {
    const k = thumbKey(v); let s = vthumbs.get(k);
    if (s == null) { try { s = planSVG(planFor(v, pl), { px: 176, pad: 6, labels: false, lines: false }).svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' preserveAspectRatio="xMidYMid meet" aria-hidden="true"'); } catch (e) { s = ''; }
      vthumbs.set(k, s); if (vthumbs.size > 60) vthumbs.delete(vthumbs.keys().next().value); }
    return s;
  }
  const scoreBand = n => n >= 80 ? 'hi' : n >= 65 ? 'mid' : 'lo';
  function variantsHtml() {
    if (holding(ed?.run)) return runCardHtml(ed.run); // a build's layouts wait for the AI's review: only the run until then
    if (!ed?.variants) return '';
    if (!ed.variants.length) { if (ed.run) return ''; const nf = K.noFit(ed.runMeta?.ask || ed.readAs?.ask || '', SP.ringArea(PL()?.ring || []) / 43560); return '<div class="sp-lbanner" role="note"><div><b>' + esc(nf.title) + '</b> ' + esc(nf.tip) + '</div><button type="button" class="btn sm" data-layedit="1">Edit request</button></div>'; } // nothing fit: say so where the layouts would be (the toast was gone in seconds)
    const pl = PL(), vs = ed.variants, on = pickIdx(), edited = !!pl?.variant?.edited, by = K.SORTS.some(([k]) => k === ed.sortBy) ? ed.sortBy : 'rec', wl = GON(pl);
    for (const v of vs) if (!v.chk || v.elements?.length && (v.chk.bad == null || v.m1 === undefined)) derive(v, pl); // an older saved run
    const rec = K.recommended(vs, ed.aiPick), recV = rec ? vs[rec.index] : null, badge = K.badges(vs, rec), sim = K.similar(vs), digits = K.moneyDigits(vs.flatMap(v => v.fin ? [v.fin.cost, v.fin.value, v.fin.profit] : []));
    const alive = vs.map(v => !(Array.isArray(v.elements) && !v.elements.length)), notes = K.splitNotes(vs.map((v, i) => alive[i] ? v.notes : null));
    const named1 = (K.firstSentence(ed.aiSummary).match(/\bLayout \d+/g) || []), aiFirst = rec?.by === 'ai' && !!ed.aiSummary && (!named1.length || named1.includes(numOf(recV))); // the summary's first sentence is about the recommended one
    const liveChk = on >= 0 && pl?.elements?.length ? K.checksOf(GC(pl), GM(pl)) : null; // the On map card's checks: the plan as it is now, the same as the overview's
    const order = K.sortOrder(vs, by, rec ? rec.index : -1), M = x => K.fmtM(x, digits), neg = x => x != null && x < 0 ? ' neg' : '';
    const simOpen = ed.simOpen || (ed.simOpen = new Set()), whyOpen = ed.whyOpen || (ed.whyOpen = new Set());
    const followers = i => vs.map((v, j) => j).filter(j => j !== i && sim[j] === i);
    const shown = i => sim[i] === i || i === on || (rec && i === rec.index) || simOpen.has(vs[sim[i]].key);
    const notesHtml = list => K.byLevel(list).filter(n => n.level !== 'info').map(n => '<p class="sp-n ' + n.level + '" title="' + esc(n.text) + '">' + esc(n.text) + '</p>').join('');
    const infoHtml = list => K.byLevel(list).filter(n => n.level === 'info').map(n => '<p class="sp-n info">' + esc(n.text) + '</p>').join('');
    const baseProg = (vs.find(v => !v.revisedBy) || {}).program;
    const whyBox = (v, html) => '<details class="sp-why" data-why="' + esc(v.key) + '"' + (whyOpen.has(v.key) ? ' open' : '') + '><summary>' + (v.ai ? 'Why' : 'Details') + '</summary>' + html + '</details>';
    // the AI's plan: its reasons (the first few, the rest folded) and what the engine changed from its brief, and why
    const aibHtml = v => { const ab = v.aiBrief; if (!ab) return ''; const rs = (ab.reasons || []).slice(0, 12), ch = ab.changed || [], li = r => '<li><b>' + esc(r.what) + '.</b> ' + esc(r.why) + '</li>';
      return '<div class="sp-aib" data-aib="' + esc(v.key) + '">' + (rs.length ? '<div class="sp-aib-h">Why · the AI’s reasons</div><ul class="sp-aib-l">' + rs.slice(0, 4).map(li).join('') + '</ul>' + (rs.length > 4 ? '<details class="sp-aib-more"><summary>' + (rs.length - 4) + ' more</summary><ul class="sp-aib-l">' + rs.slice(4).map(li).join('') + '</ul></details>' : '') : '') +
        (ab.revised && ab.why ? '<div class="sp-aib-h">Revised</div><p class="sp-aib-ok">' + esc(ab.why) + '</p>' : '') +
        '<div class="sp-aib-h">Changed by the planner</div>' + (ch.length ? '<ul class="sp-aib-l ch">' + ch.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '<p class="sp-aib-ok">Nothing: laid out as the AI asked.</p>') + '</div>'; };
    const card1 = i => {
      const v = vs[i], has = !!v.elements?.length, none = !alive[i], here = on === i, f = v.fin, m = v.m || {}, cl = K.checkLabel(here && liveChk ? liveChk : v.chk, { waller: wl }), isRec = rec && rec.index === i;
      const ckTip = here && liveChk && K.checkLabel(v.chk, { waller: wl }).text !== cl.text ? 'The plan on the map now; as laid out it read “' + K.checkLabel(v.chk, { waller: wl }).text + '”' : '';
      const h = K.headline(v.m, v.m1, K.askedOf(SP.normalizeProgram(v.program || pl.program))), hot = k => by === k ? ' hot' : '';
      const cell = (k, big, sub, cls = '', tip = '') => '<span class="sp-vc' + cls + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><small>' + k + '</small><b>' + big + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</span>';
      const profitSub = f => '<span title="' + esc(PROFIT_TIP) + '">profit after hold &amp; sale <em class="' + neg(f.profit) + '">' + M(f.profit) + '</em></span>';
      const ratio = m.units ? (m.spaces / m.units).toFixed(2) + ' / unit' : m.gfa ? (m.spaces / m.gfa * 1000).toFixed(1) + ' / 1,000 sf' : '', pk = parkOf(m, v.m1), wh = twoPhase(m, v.m1);
      const grid = none ? '' : '<span class="sp-vgrid">' +
        cell(v.m1 ? 'Phase 1' : h.units ? 'Units' : 'Floor area', esc(h.big), h.fit ? '<em class="neg">Fits ' + esc(h.fit) + '</em>' : esc(h.sub), hot('size')) +
        (SP.lsfOf(m) > 0 ? cell('Leasable + sellable', f0(SP.lsfOf(m)) + ' sf', [m.leasable > 0 ? f0(m.leasable) + ' lease' : '', m.sellable > 0 ? f0(m.sellable) + ' sell' : ''].filter(Boolean).join(' · '), hot('lsf'), 'Leasable floor area (shops, offices, apartments) plus the homes’ sellable living area: the owner’s goal, what the planner ranks layouts by after the rules') : '') +
        cell(wh ? 'Parking (asked for)' : 'Parking', f0(pk.stalls) + ' / ' + f0(pk.need), wh ? 'whole site ' + f0(m.spaces || 0) + ' / ' + f0(m.required || 0) : ratio, (pk.stalls < pk.need ? ' short' : '') + hot('ratio'), 'Spaces / needed' + (wh ? ' for Phase 1, what was asked for; the whole site, with Phase 2, under it' : '')) +
        (f ? (f.forSale ? cell('Cost', M(f.cost), profitSub(f), hot('profit'), finTip(v, pl)) + cell('Margin', K.fmtPct(f.margin), '', neg(f.margin) + hot('yoc'), finTip(v, pl))
          : cell('Value / cost', M(f.value) + ' / ' + M(f.cost), profitSub(f), hot('profit'), finTip(v, pl)) +
            cell('Yield on cost', K.fmtPct(f.yoc), f.spread != null ? 'spread <em class="' + neg(f.spread) + '">' + K.fmtPct(f.spread) + '</em>' : '', neg(f.yoc) + hot('yoc'), finTip(v, pl)))
          : cell('Value / cost', '—', has ? 'no buildings to price' : 'when laid out', '') + cell('Yield on cost', '—', '', '')) + '</span>';
      const cu = CU.customOf(SP.normalizeProgram(v.program || pl.program)), pills = (here ? '<i class="sp-onmap">On map' + (edited ? ' · edited' : '') + '</i>' : '') + (cu && !none ? '<i class="sp-ais" title="' + esc(cu.name + ': ' + AIS_TIP) + '">AI-sized · ' + esc(cu.name) + '</i>' : '') +
        (v.pondDepth && !none ? '<i class="sp-ais" title="' + esc('Assumes a ' + v.pondDepth + ' ft deep pond (average storage depth), deeper than the usual: the same storage in less land. An engineering assumption: confirm with your civil engineer (a dry pond needs an outfall deep enough to drain it; a wet-bottom pond holds the storage above its normal pool).') + '">' + v.pondDepth + ' ft pond · assumed</i>' : '') +
        (v.aiBrief && !none ? '<i class="sp-aip" title="The AI decided what is built here (its brief); the layout engine drew it, ranked it against its own layouts on the same score, and notes what it changed">' + AIP + (v.aiBrief.revised ? ' · revised' : '') + '</i>' : '') + (v.stale ? [] : badge[i]).map(b => '<i class="sp-badge' + (b === 'Recommended' ? ' rec' : '') + '">' + b + '</i>').join('') +
        (none ? '' : v.stale ? '<i class="sp-ck stale" title="Made for the old site. Use this layout to fit it to the new one.">Out of date · ' + staleOf(v)[0] + '</i>' : '<i class="sp-ck ' + cl.level + '" title="' + (ckTip ? esc(ckTip) : cl.level === 'ok' ? 'Inside the lot and setbacks, no overlaps, enough parking' : 'What the checks found; the details are on the map in red once it’s on the map') + '">' + esc(cl.text) + '</i>') +
        (v.ai ? '<i class="sp-score ' + scoreBand(v.ai.score) + hot('ai') + '" title="The AI review’s score, out of 100">AI ' + v.ai.score + '</i>' : '') + (ed.reviewing && has && !v.ai ? '<i class="sp-skel" aria-label="The AI is reviewing this layout">AI reviewing…</i>' : '');
      const reason = isRec && !v.stale ? (rec.by === 'ai' ? (aiFirst ? K.firstSentence(ed.aiSummary) : v.ai?.verdict || '') : K.engineReason(vs, i)) : '';
      const dl = recV && !isRec && !none && !v.stale && !recV.stale ? K.deltas(v, recV, digits) : [];
      const fol = sim[i] === i ? followers(i) : [], foldN = fol.filter(j => !(j === on || rec && j === rec.index)).length;
      const own = (notes.own[i] || []).filter(t => !v.aiBrief?.changed?.includes(t)), why = (v.ai ? (v.ai.verdict && v.ai.verdict !== reason ? '<p class="sp-why-v">' + esc(v.ai.verdict) + '</p>' : '') + '<ul class="sp-why-l">' + (v.ai.strengths || []).map(t => '<li class="ok">' + esc(t) + '</li>').join('') + (v.ai.problems || []).map(t => '<li class="bad">' + esc(t) + '</li>').join('') + '</ul>' : '') + infoHtml(own);
      const arr = RUN.baseName(v.name).replace(/^AI’s plan(?:, revised)? · /, ''), acts = '<span class="sp-va-r">' + (here && !v.stale ? '' : '<button type="button" class="btn sm" data-usevar="' + i + '"' + (v.stale ? ' title="Fits this layout to the new site"' : '') + '>Use This Layout</button>') + '<button type="button" class="btn sm ghost" data-keep="' + i + '" title="Keep this layout as a new option in ' + esc(projOf(pl)?.name || 'the project') + '; this option stays as it is">Save as New Option</button></span>';
      // the drawing; the name and arrangement (two lines at most); the badges; the numbers; then the actions on the right
      return '<div class="sp-var' + (here ? ' on' : '') + (v.stale ? ' stale' : '') + (none ? ' none' : '') + (K.passes(v.chk) === false ? ' fail' : '') + '" data-key="' + esc(v.key) + '">' +
        '<button type="button" class="sp-var-use" aria-pressed="' + here + '" data-var="' + i + '"' + (none ? ' disabled' : '') + ' title="' + (here ? 'On the map' : v.stale ? 'Fit this layout to the new site and put it on the map' : has ? 'Put this layout on the map' : none ? 'Nothing fits' : 'Lay this layout out again and put it on the map') + '">' +
          '<span class="sp-vthumb"' + (has ? ' data-thumb="' + i + '"' : '') + '>' + (has && vthumbs.has(thumbKey(v)) ? vthumbs.get(thumbKey(v)) : '') + (!has ? '<i>' + (none ? 'Nothing fits' : 'Numbers only') + '</i>' : '') + '</span>' +
          (pl.program?.community ? '<span class="sp-vname">' + esc(pl.program.community) + '</span>' : '') + // (the community is the plan's: every card says it)
          '<span class="sp-vhead" title="' + esc(numOf(v) + ' · ' + arr) + '"><b>' + esc(numOf(v)) + '</b> <span>' + esc(arr) + '</span></span>' +
          (pills ? '<span class="sp-vpills">' + pills + '</span>' : '') + grid +
          (h.p2 ? '<span class="sp-vp2">' + esc(h.p2) + '</span>' : '') + (by === 'open' && !none ? '<span class="sp-vp2 hot">Open space ' + pct(m.green || 0) + '</span>' : '') +
          (reason ? '<span class="sp-vwhy">' + esc(reason) + '</span>' : '') + (dl.length ? '<span class="sp-vdelta">vs Recommended: ' + dl.map(esc).join(' · ') + '</span>' : '') +
          (!has && !none ? '<span class="sp-numonly">Numbers only: click to lay it out again</span>' : '') + '</button>' +
        (none ? '' : notesHtml(own) + aibHtml(v)) +
        (none ? (why ? '<div class="sp-var-acts">' + whyBox(v, why) + '</div>' : '') : '<div class="sp-var-acts">' + (why ? whyBox(v, why) : '') + (foldN ? '<button type="button" class="sp-tgl sp-simt" data-sim="' + esc(v.key) + '" aria-expanded="' + simOpen.has(v.key) + '">' + foldN + ' similar' + CHEV + '</button>' : '') + acts + '</div>') + '</div>';
    };
    const main = order.filter(i => !vs[i].revisedBy && shown(i)), revd = order.filter(i => vs[i].revisedBy && shown(i));
    const known = vs.filter((v, i) => alive[i] && v.m?.gfa), allFail = known.length && !known.some(v => K.passes(v.chk)) && known.some(v => K.passes(v.chk) === false);
    const gap = allFail ? K.acreageGap(vs.flatMap(v => v.notes || [])) : null, firstBad = allFail ? K.checkLabel(known[0].chk, { waller: wl }).text : '';
    const rest = aiFirst ? K.restSentences(ed.aiSummary) : ed.aiSummary || '';
    const revV = revd.length ? vs[revd[0]] : null, chg = revV ? K.programChange(SP.normalizeProgram(baseProg || pl.program), SP.normalizeProgram(revV.program || pl.program)) : '';
    const mainHtml = main.length ? (revd.length ? '<div class="sp-lgrp"><b>From your request</b></div>' : '') + '<div class="sp-vars">' + main.map(card1).join('') + '</div>' : '';
    const revHtml = revd.length ? '<div class="sp-lgrp"><b>AI’s revision</b> <span>(' + esc([chg, revV.revisedBy ? 'why: ' + revV.revisedBy.replace(/\.$/, '') : ''].filter(Boolean).join(' · ')) + ')</span></div><div class="sp-vars">' + revd.map(card1).join('') + '</div>' : '';
    const unrev = !ed.reviewCleared && RUN.isUnreviewedNote(ed.aiNote) && !vs.some(v => v.ai); // a build whose review didn't come back: said where the layouts are, with a way to have them reviewed
    return (unrev ? '<div class="sp-lbanner sp-unrev" role="note"><div><b>Not reviewed by the AI.</b> ' + esc((ed.aiNote.match(/[^.]*were not reviewed by the AI[^.]*\./) || [''])[0].trim()) + '</div>' + (aiOff() ? '' : '<button type="button" class="btn sm" id="spReReview">Review Now</button>') + '</div>' : '') +
      (ed.reviewCleared ? '<div class="sp-rvc"><span class="rnote sp-warn">Settings changed: the AI review was cleared.</span><button type="button" class="btn sm" id="spReReview">Review Again</button></div>' : '') +
      (allFail ? '<div class="sp-lbanner" role="note"><div><b>None of these layouts passes every check.</b> ' + (gap ? 'This asks for about ' + gap.need.toFixed(1) + ' ac; the site is ' + gap.site.toFixed(1) + ' ac.' : esc(firstBad) + ' on ' + (known.length > 1 ? 'the best of them' : 'it') + '.') + '</div><button type="button" class="btn sm" data-layedit="1">Edit request</button></div>' : '') +
      (rest ? '<div class="sp-callout"><b>From the AI’s review</b>' + esc(rest) + '</div>' : '') +
      (notes.shared.length ? (K.byLevel(notes.shared).some(n => n.level !== 'info') ? '<div class="sp-lnotes"><span class="sp-lnh">Every layout</span>' + notesHtml(notes.shared) + (K.byLevel(notes.shared).some(n => n.level === 'info') ? '<details class="sp-ninfo"><summary>Details</summary>' + infoHtml(notes.shared) + '</details>' : '') + '</div>'
        : '<details class="sp-ninfo sp-ninfo1"><summary>Notes on every layout (' + notes.shared.length + ')</summary>' + infoHtml(notes.shared) + '</details>') : '') +
      (by === 'rec' && recV?.revisedBy ? revHtml + mainHtml : mainHtml + revHtml);
  }
  // the Layouts heading: how many, the sort and More layouts
  function layoutsHead() {
    if (holding(ed?.run)) return '<div class="sp-lay-h"><div class="lt">Layouts<span class="sp-lcount"> · being checked by the AI</span></div></div>';
    const by = K.SORTS.some(([k]) => k === ed.sortBy) ? ed.sortBy : 'rec', tip = K.SORTS.find(([k]) => k === by)[2];
    return '<div class="sp-lay-h"><div class="lt">Layouts<span class="sp-lcount"> · ' + (ed.variants?.length || 0) + '</span></div><div class="sp-lay-ctl">' +
      '<label class="sp-sortl" title="' + esc(tip) + '"><span>Sort</span><select id="spSort">' + K.SORTS.map(([k, t, tt]) => '<option value="' + k + '" title="' + esc(tt) + '"' + (by === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
      (ed.variants?.length <= 3 ? '<button type="button" class="btn sm" id="spMore" title="Every usable layout the planner found, not just the top three">More Layouts…</button>' : '') + '</div></div>';
  }
  function wireVariants() {
    const $ = q => card.querySelector(q);
    card.querySelectorAll('[data-var],[data-usevar]').forEach(b => b.onclick = () => { const i = +(b.dataset.var ?? b.dataset.usevar); askReplace(() => { if (ed.run) ed.pickedByUser = true; useVariant(i); }); }); // picked during a review: the AI's pick won't replace it
    card.querySelectorAll('[data-keep]').forEach(b => b.onclick = () => keepAsOption(+b.dataset.keep));
    card.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => { const k = b.dataset.sim; if (ed.simOpen.has(k)) ed.simOpen.delete(k); else ed.simOpen.add(k); redrawLayouts(); });
    card.querySelectorAll('details[data-why]').forEach(d => d.ontoggle = () => { if (d.open) ed.whyOpen.add(d.dataset.why); else ed.whyOpen.delete(d.dataset.why); });
    card.querySelectorAll('[data-layedit]').forEach(b => b.onclick = () => { fillAsk(ed.runMeta?.ask || ed.readAs?.ask || ed.ask || ''); card.querySelector('#spAiSec')?.scrollIntoView({ block: 'nearest' }); });
    const mo = $('#spMore'); if (mo) mo.onclick = moreLayouts;
    const so = $('#spSort'); if (so) so.onchange = () => { ed.sortBy = so.value; saveRun(); redrawLayouts(); so.closest('label').title = K.SORTS.find(([k]) => k === so.value)?.[2] || ''; };
    const rr = $('#spReReview'); if (rr) rr.onclick = reviewAgain;
    lazyThumbs();
  }
  // More layouts: every usable layout the engine finds, not just the top few. The AI's scores stay on the layouts it saw;
  // the one on the map stays in the list (first) when the new run doesn't hold it. With the AI on and a reviewed run, the
  // new layouts are reviewed before they're shown (up to ten, in two calls at once, each with the AI's pick for scale:
  // RUN.reviewBatches); only those it rated join the list. When that review doesn't come back, they're shown, said so.
  async function moreLayouts() {
    const pl2 = PL(), ask = (ed?.runMeta?.ask || pl2?.lastRun?.ask || '').trim(), withAi = !aiOff() && !!ask && !!ed?.variants?.some(v => v.ai);
    const run = startRun('more', withAi ? ['Looking for more layouts', 'The AI is reviewing the new layouts'] : ['Looking for more layouts'], '#spMore'); if (!run) return;
    let more = []; try { more = await laid('options', { ...pl2 }, pl2.program, { count: 12, ...koOpts(pl2) }); } catch (e) { console.warn('layout', e); }
    if (!live(run) || PL() !== pl2) return;
    if (!more.length) { endRun(run); return; }
    const old = new Map((ed.variants || []).map(v => [v.key, v])), nv = named(more, pl2); for (const v of nv) { const o = old.get(v.key); if (o?.ai) v.ai = o.ai; }
    let list = RUN.keepCurrent(pl2.variant?.key && old.get(pl2.variant.key), nv), note = '';
    const batches = withAi ? RUN.reviewBatches(list, ed.aiPick || pl2.variant?.key) : [];
    if (batches.length) {
      runStep(run, 2);
      const L0 = ASK.effortOf(effortNow()), L = { ...L0, rounds: 1, effort: L0.rounds ? L0.effort : 'medium', images: 6 }; // one look, no revising (Low: at medium)
      const rctl = new AbortController(), sig = AbortSignal.any ? AbortSignal.any([run.ctl.signal, rctl.signal]) : run.ctl.signal; let late = false;
      const tmo = setTimeout(() => { late = true; rctl.abort(); }, RUN.reviewLimitMs(1));
      const got = await Promise.all(batches.map(b => aiReview({ ...pl2 }, pl2.program, b, 1, ask, sig, L).catch(e => { console.warn('review', e); return null; })));
      clearTimeout(tmo); if (!live(run) || PL() !== pl2) return;
      batches.forEach((b, k) => { if (got[k]) list = RUN.attachReviews(list, b, got[k], { keep: true }).list; });
      if (got.some(Boolean)) list = list.filter(v => v.ai || v.key === pl2.variant?.key); // only what the AI has rated (and the one on the map)
      else note = RUN.unreviewedNote(late ? 'timeout' : 'failed').replace('these layouts', 'the new layouts');
    }
    ed.variants = list; if (note) ed.aiNote = note; ed.reviewCleared = false; saveRun(pl2); endRun(run);
  }
  function redrawLayouts() { const box = card.querySelector('#spVariants'); if (!box || !ed) return; box.innerHTML = variantsHtml(); wireVariants(); lockRun(); }
  // the drawings, after the cards are on screen: only the ones scrolled into view, a few a frame
  function lazyThumbs() {
    thumbIO?.disconnect(); thumbIO = null;
    const slots = [...card.querySelectorAll('[data-thumb]')].filter(el => !el.firstElementChild); if (!slots.length) return;
    const q = [], pump = () => { const t0 = performance.now(); while (q.length && performance.now() - t0 < 12) { const el = q.shift(), v = ed?.variants?.[+el.dataset.thumb]; if (el.isConnected && v?.elements?.length && !el.firstElementChild) el.insertAdjacentHTML('afterbegin', vthumb(v, PL())); } if (q.length) requestAnimationFrame(pump); };
    const add = el => { q.push(el); if (q.length === 1) requestAnimationFrame(pump); };
    if (!window.IntersectionObserver) { slots.forEach(add); return; }
    thumbIO = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { thumbIO?.unobserve(e.target); add(e.target); } }, { root: card, rootMargin: '160px 0px' });
    slots.forEach(el => thumbIO.observe(el));
  }
  // put a layout on the map; one kept as numbers only is laid out again first. o.fresh: the layouts a build just made (their
  // program's names are the build's), else the plan's names as they are now win over the layout's copy
  async function useVariant(i, o = {}) {
    let v = ed.variants?.[i]; if (!v || Array.isArray(v.elements) && !v.elements.length) return false;
    const was = v.stale; if (!v.elements || was) { v = await relay(i, was); if (!v) return false; i = ed.variants.indexOf(v); } // out of date, or numbers only: laid out again for this site first
    applying = true;
    try { change(x => { x.elements = withKeepouts(v.elements, x.elements); x.spareRows = []; x.program = SP.keepNames({ ...(v.program || x.program) }, x.program, !o.fresh); /* (the names as they are now: the layout's copy is from when it was laid out; a build's own new layouts carry its names) */ x.setbacks = v.setbacks || x.setbacks; if (v.params) x.params = clone(v.params); x.zones = clone(v.zones || []); x.recipe = v.recipe ? clone(v.recipe) : null; x.variant = { key: v.key, name: v.name, at: new Date().toISOString() }; if (v.laidAs || x.laidAs) x.laidAs = v.laidAs || null; }); }
    finally { applying = false; }
    ed.sel = null; ed.solveBar = false; if (was) PL().stale = null; saveRun(); if (!o.quiet) { draw(); panel(); }
    nameNew(PL()); // (street names on: a new layout's streets named too, in the same undo step)
    requestAnimationFrame(() => { if (ed && !planInView(true)) planFit(); }); // only when the site isn't all in view already (or the Plan key covers it)
    return true;
  }
  // a layout saved as numbers only: laid out again from its own program, settings and arrangement, then found by its key
  async function relay(i, stale) {
    const v = ed.variants[i], pl = PL(); if (!v || !pl) return null;
    ctx.toast(stale ? 'Fitting ' + numOf(v) + ' to the new site…' : 'Laying out ' + numOf(v) + ' again…');
    const base = { ...pl, setbacks: v.setbacks || pl.setbacks, params: v.params || pl.params };
    let out = []; try { out = await laid('options', base, v.program || pl.program, { count: v.aiBrief ? 2 : 12, ...koOpts(pl), ...(v.aiBrief?.brief ? { brief: v.aiBrief.brief } : {}) }); } catch (e) { console.warn('layout', e); }
    if (PL() !== pl || ed.variants?.[i] !== v) return null;
    const a2 = v.aiBrief ? aiLayout(out, base, v.program || pl.program, { ...v.aiBrief }).v || null : null; // the AI's plan: its brief laid out again, still the AI's (none when it no longer fits: then it says so below)
    if (v.aiBrief && !a2) { ctx.toast(numOf(v) + ', the AI’s plan, doesn’t fit with these settings any more.'); return null; }
    const list = a2 ? [a2] : named(out, { ...base, program: v.program || pl.program }, v.revisedBy ? { revisedBy: v.revisedBy } : {}), r = a2 ? { index: 0, exact: true } : RUN.matchLayout(list, v.key, v.name);
    if (r.index < 0) { ctx.toast(numOf(v) + ' doesn’t fit with these settings any more.'); return null; }
    const got = list[r.index], nv = r.exact ? { ...got, key: v.key, name: v.name, rank: v.rank, ai: v.ai } : { ...got, rank: v.rank, name: numOf(v) + ' · ' + got.arr };
    if (!r.exact) ctx.toast(numOf(v) + ' came out differently this time, so the nearest one (' + got.arr + ') is shown in its place.');
    ed.variants[i] = nv; return nv;
  }
  // keep a layout as a new option in this project; this option stays as it is
  async function keepAsOption(i) {
    let v = ed.variants?.[i]; const p = P(), pl = PL(); if (!v || !p || !pl) return;
    if (!v.elements || v.stale) { v = await relay(i, v.stale); if (!v || PL() !== pl) return; }
    const now = new Date().toISOString(), name = nextName(p) + ' · ' + (v.arr || RUN.baseName(v.name));
    const c = { ...clone(pl), id: uid(), name, created: now, updated: now, elements: withKeepouts(v.elements, pl.elements), spareRows: [], program: { ...(v.program || pl.program) }, setbacks: clone(v.setbacks || pl.setbacks), params: v.params ? clone(v.params) : pl.params ? clone(pl.params) : null,
      zones: clone(v.zones || []), recipe: v.recipe ? clone(v.recipe) : null, variant: { key: v.key, name: v.name, at: now }, stale: null, laidAs: v.laidAs || null, lastRun: pl.lastRun ? RUN.slimRun({ ...clone(pl.lastRun), variants: ed.variants }, v.key) : null };
    p.plans.push(c); save(p); panel();
    ctx.toast('Saved as ' + c.name + ' in ' + p.name + '.', { action: { label: 'Open ' + c.name.split(' · ')[0], run: () => { if (db.projects.some(x => x.id === p.id)) open(p.id, c.id); } } });
  }
  // after new settings cleared the AI's scores: the AI looks at the layouts again
  async function reviewAgain() {
    const pl = PL(), ask = (ed.runMeta?.ask || pl?.lastRun?.ask || ed.ask || '').trim(); if (!pl || !ed.variants) return;
    if (!ask) { ctx.toast('Say what should go on the site under Build first; the AI reviews layouts against it.'); return; }
    const L0 = ASK.effortOf(effortNow()), L = { ...L0, rounds: 1, effort: L0.rounds ? L0.effort : 'medium' }; // one look: scores and a pick (Low has no review of its own: medium)
    const pool = ed.variants.filter(v => v.elements?.length).slice(0, L.pool || 4); if (!pool.length) return;
    if (aiOff()) { ctx.toast('AI isn’t set up on this site, so the layouts can’t be reviewed.'); return; }
    const run = startRun('review', ['The AI is reviewing the layouts'], '#spReReview'); if (!run) return; ed.reviewing = true; ed.pickedByUser = false; panel();
    try { const rv = await aiReview({ ...pl }, pl.program, pool, 1, ask, run.ctl.signal, L); if (!live(run) || PL() !== pl) return;
      ed.reviewing = false; mergeReview(rv, pool); if (RUN.isUnreviewedNote(ed.aiNote)) ed.aiNote = ''; await pickAi();
    } catch (e) { if (!live(run)) return; ed.reviewing = false; ctx.toast(e.status === 503 ? 'AI isn’t set up on this site, so the layouts can’t be reviewed.' : 'The AI review didn’t answer. Try again in a moment.'); }
    if (!live(run)) return; saveRun(pl); endRun(run);
  }

  // ---------- exports ----------
  // notes for the sheet from the Site facts (flood zone, districts, roads, environmental records) at the middle of the site
  async function siteFacts(pl, parcel) {
    if (!ctx.siteAt) return [];
    const c = SP.frame(pl.origin).toLL(SP.centroid(pl.ring)), out = [], ground = Promise.race([terrainOf(pl), new Promise(res => setTimeout(() => res(null), 15000))]);
    try {
      const d = await Promise.race([ctx.siteAt(c, '', ''), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 9000))]), f = d.flood;
      if (f?.zone) out.push('FEMA flood zone ' + f.zone + (f.risk === 'high' ? ' — in the 100-year floodplain; expect fill, elevated slabs and floodplain permits.' : f.risk === 'moderate' ? ' — moderate risk (500-year floodplain).' : ' — outside the 100-year floodplain.') + ' (FEMA NFHL; at the middle of the site)');
      const w = d.districts?.water || []; out.push(w.length ? 'Water / utility district: ' + w.map(x => x.name).join(', ') + '. Confirm capacity and annexation.' : 'No water or utility district (MUD) found here: water and sewer service needs to be confirmed.');
      if (d.districts?.schools?.length) out.push('School district: ' + d.districts.schools.join(', ') + '.');
      if (d.districts?.opportunityZone) out.push('In a federal Opportunity Zone.');
      if (d.districts?.tirz?.length) out.push('In ' + d.districts.tirz.join(', ') + '.');
      const r = d.traffic?.roads?.[0]; if (r) out.push('Busiest road nearby: ' + r.road + ', about ' + Math.round(r.aadt).toLocaleString('en-US') + ' vehicles a day (TxDOT). Expect driveway permits and possibly turn lanes.');
      const e = d.environment; if (e && !e.error && e.total != null) out.push(e.total ? e.total + ' EPA-regulated facilit' + (e.total === 1 ? 'y' : 'ies') + ' within ¼ mile' + (e.flaggedCount ? ', ' + e.flaggedCount + ' with violations or hazardous waste' : '') + '. A Phase I ESA is recommended.' : 'No EPA-regulated facilities within ¼ mile.');
    } catch (e) { /* the sheet still prints; notes say what's known */ }
    if (ctx.utilitiesAt) try { // nearest power lines, the water and sewer providers, public mains (from the site's edge)
      const F = SP.frame(pl.origin), geom = { type: 'Polygon', coordinates: [pl.ring.concat([pl.ring[0]]).map(F.toLL)] };
      const u = await Promise.race([ctx.utilitiesAt(c, geom), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 12000))]);
      const lines = ctx.utilityFacts(u); if (lines.length) out.push(lines.slice(0, 4).join('. ') + '. Confirm capacity and service with each provider (OpenStreetMap, PUC Texas, City of Houston).');
    } catch (e) { /* no utility note */ }
    if ((pl.parcels || []).length > 1) out.push((pl.parcels.length) + ' parcels: a replat into one reserve or lot is likely needed.');
    const t = await ground; if (t) { const l = TR.factLine(t, pl.ring); if (l) out.splice(1, 0, l); }
    return out;
  }
  // ---------- ground elevations (lib/terrain.mjs, api/terrain) ----------
  // Asked once per boundary and kept on this device (IndexedDB, with the renderings): a grid of up to 3,600 bare-ground
  // elevations from USGS lidar. The project keeps only the few numbers the Jurisdiction & site box shows.
  const terrains = new Map(); // signature -> { t, p }
  const terrainNow = pl => pl?.ring?.length >= 3 ? terrains.get(TR.terrainSig(pl.origin, pl.ring))?.t || null : null;
  function terrainOf(pl) {
    if (!(pl?.ring?.length >= 3)) return Promise.resolve(null);
    const sig = TR.terrainSig(pl.origin, pl.ring), have = terrains.get(sig); if (have) return have.p;
    const box = { t: null, p: null }; terrains.set(sig, box);
    box.p = (async () => {
      const kept = await rget('terrain:' + sig); // a rough fallback answer is asked for again after a day
      if (kept?.z && kept.sig === sig && !(kept.coarse && Date.now() - Date.parse(kept.at) > 864e5)) return box.t = kept;
      const r = await fetch('api/terrain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: pl.origin, ring: pl.ring }) }), d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.z)) throw new Error(d.error || 'HTTP ' + r.status);
      rput('terrain:' + sig, d).catch(() => {}); return box.t = d;
    })().catch(e => { console.warn('terrain', e.message); setTimeout(() => { if (terrains.get(sig) === box) terrains.delete(sig); }, 60000); return null; }); // (a failure is asked again in a minute)
    return box.p;
  }
  async function exportPdf(p, pl, size) {
    const btn = card.querySelector('#spPdf'); if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    try {
      const keys = pl.parcels || (pl.parcel ? [pl.parcel] : []), parcels = keys.map(k => p.parcels.find(x => x.key === k)).filter(Boolean), F = SP.frame(pl.origin);
      const site = { type: 'Polygon', coordinates: [pl.ring.concat([pl.ring[0]]).map(F.toLL)] };
      let vicinity = ''; try { vicinity = areaMap([{ geometry: site, stroke: '#c0392b', fill: 'rgba(192,57,43,.25)', width: 2 }], { W: 320, H: 190, px: 320, minSpanM: 3500, maxTiles: 16 }); } catch (e) {}
      const facts = await siteFacts(pl), notes = GC(pl).map(i => i.text), renders = await rendersForSheet(pl).catch(() => []);
      const county = (ctx.DATA?.counties || []).find(c => (c.outline || []).some(poly => SP.inRing(F.toLL(SP.centroid(pl.ring)), poly[0])))?.name;
      const html = sheetHTML({ plan: pl, planName: pl.name, project: p, size, parcels, facts, notes, vicinity, renders, ...(GON(pl) ? { guard: { scen: scenYields(pl) } } : {}), address: parcels[0]?.label || '', county: county ? county + ' County, Texas' : '',
        date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), preparedFor: '', boundarySource: pl.src === 'drawn' ? 'a boundary drawn on the map' : pl.src === 'regrid' ? 'the Regrid parcel outline' : (keys.length > 1 ? keys.length + ' county appraisal district parcel outlines, merged' : 'the county appraisal district parcel outline') });
      const name = fileName(p, pl) + '-site-plan';
      ctx.toast('Preparing the PDF…');
      let blob = null, why = '';
      try { const r = await fetch('api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html, sheet: size, title: p.name + ' — Site plan' }) }); if (r.ok && /pdf/.test(r.headers.get('content-type') || '')) blob = await r.blob(); else why = (await r.json().catch(() => ({}))).error || 'HTTP ' + r.status; } catch (e) { why = e.message; }
      if (blob) await ctx.saveFile(name + '.pdf', blob, 'application/pdf');
      else { await ctx.saveFile(name + '.html', html, 'text/html'); ctx.toast('The PDF couldn’t be made (' + why + '). Saved as a web page instead: open it and print it on ' + (size === 'archd' ? '24 × 36' : '11 × 17') + ' paper.'); }
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Site Plan PDF'; } }
  }
  // ---------- photoreal renderings (lib/render.mjs, api/render) ----------
  // The AI paints the map's 3D massing of the option into a photograph. The pictures are 1080p JPEGs, far too big for
  // the project record, so they live in IndexedDB on this device; the option keeps only a list of them (id, view, look,
  // light, when, model, a signature of the plan they were made from), which syncs with the team like the numbers do.
  let rdb = null;
  const ridb = () => rdb || (rdb = new Promise((res, rej) => { const r = indexedDB.open('fs-renders', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const rtx = async (mode, fn) => { const d = await ridb(); return new Promise((res, rej) => { const t = d.transaction('img', mode), q = fn(t.objectStore('img')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
  const rput = (id, v) => rtx('readwrite', st => st.put(v, id)), rget = id => rtx('readonly', st => st.get(id)).catch(() => undefined), rdel = id => rtx('readwrite', st => st.delete(id)).catch(() => {});
  const rurl = new Map(); // id -> object URL, for the pictures shown this visit
  async function renderSrc(id) { if (rurl.has(id)) return rurl.get(id); const v = await rget(id); if (!(v instanceof Blob)) return null; const u = URL.createObjectURL(v); rurl.set(id, u); return u; }
  const toBlob = async url => (await fetch(url)).blob();
  const blobToData = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(b); });
  // what a rendering was made from: the pieces' places, sizes and floors (a change to any of them makes it "plan changed since")
  const planSig = pl => RUN.hash((pl.elements || []).map(e => [e.kind, Math.round(e.x), Math.round(e.y), Math.round(e.w), Math.round(e.d), Math.round(e.rot || 0), e.floors || 0, e.use || ''].join(':')).join('|'));
  // drawing marks that aren't part of a photograph: labels, dimensions, setback and parcel lines, the boundary, handles, easement hatching
  const HIDE_FOR_RENDER = ['fs-sp-zlab', 'fs-sp-lot', 'fs-sp-grid', 'fs-sp-zone', 'fs-sp-sb', 'fs-sp-pl', 'fs-sp-front', 'fs-sp-selc', 'fs-sp-sell', 'fs-sp-flash', 'fs-sp-gone', 'fs-sp-lab-p', 'fs-sp-lab', 'fs-sp-lab-sel', 'fs-sp-dim', 'fs-sp-hv', 'fs-sp-mf', 'fs-sp-dl', 'fs-sp-dp', 'fs-sp-ml', 'fs-sp-h', 'fs-sp-hs', 'fs-sp-lotl', 'fs-sp-p2', 'fs-sp-ko', 'fs-sp-koh', 'fs-sp-kol'];
  const imageryBase = () => /^(sat|gsat|esri)$/.test(ctx.basemap?.() || '');
  const idle = () => new Promise(ok => { let done = false; const fin = () => { if (!done) { done = true; ok(); } }; map.once('idle', fin); setTimeout(fin, 9000); });
  // The massing as the AI gets it: the map pointed at the site from the view's camera (lib/render.mjs cameraFor) in the
  // part of the map the panels leave free, the drawing marks hidden, read off the canvas on the next frame (the canvas
  // keeps no buffer between frames) and cut to 16:9 at up to 1600 px wide. The map is put back exactly as it was.
  // A close-up ('hero') frames one building (`target`, from RD.heroTarget): the camera and the fit use the building grown
  // by RD.HERO_PAD feet each side instead of the parcel.
  async function captureView(pl, view, target = null) {
    const F = SP.frame(pl.origin), was = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding() };
    const free = freeRect({ key: false }), m = free.m, canvas = map.getCanvas(), dpr = canvas.width / Math.max(1, m.width);
    const cam = RD.cameraFor(view, pl, { px: Math.max(320, (free.r - free.l) * dpr), lat: pl.origin[1], target }), T = RD.byId(RD.VIEWS, view).hero && target;
    const hidden = HIDE_FOR_RENDER.filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
    try {
      for (const id of hidden) map.setLayoutProperty(id, 'visibility', 'none');
      map.jumpTo({ center: F.toLL(cam.center), zoom: cam.zoom, pitch: Math.min(cam.pitch, map.getMaxPitch()), bearing: cam.bearing, padding: fitPadding(free, m, 0) });
      fitSiteInFrame(pl, free, m, T ? { points: RD.heroPoints(T), tall: [T] } : {}); // the formula is a start; the real camera decides: the whole parcel (or the close-up's building and its surroundings) in the free part of the frame, with room around it
      await idle();
      const png = await new Promise((ok, no) => { map.once('render', () => { try { ok(canvas.toDataURL('image/png')); } catch (e) { no(e); } }); map.triggerRepaint(); });
      const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = png; });
      let l = (free.l - m.left) * dpr, t = (free.t - m.top) * dpr, w = (free.r - free.l) * dpr, h = (free.b - free.t) * dpr; // the free part, then 16:9 inside it
      if (w / h > 16 / 9) { const w2 = h * 16 / 9; l += (w - w2) / 2; w = w2; } else { const h2 = w * 9 / 16; t += (h - h2) / 2; h = h2; }
      const k = Math.min(1, 1600 / w), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      const g = c.getContext('2d'); g.fillStyle = '#dfe6ea'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, l, t, w, h, 0, 0, c.width, c.height);
      return { image: c.toDataURL('image/jpeg', 0.88), camera: cam, w: c.width, h: c.height };
    } finally { for (const id of hidden) map.setLayoutProperty(id, 'visibility', 'visible'); map.jumpTo(was); }
  }
  // The same picture without the page's map: a hidden map of the page's basemap (its own layers only: RD.baseStyle),
  // 1600 x 900, with the option drawn on it as the map draws it, framed by the same camera rules, then thrown away. It
  // draws at twice the size with antialiasing and is scaled down (RD.CAPTURE), so small pieces stay crisp. The Renderings
  // tab uses it, so you stay where you are.
  async function captureOffscreen(pl, view, target = null) {
    const { w: W, h: H, ratio, quality } = RD.CAPTURE, box = document.createElement('div'), close = RD.byId(RD.VIEWS, view).hero && target;
    if (!map.isStyleLoaded()) await new Promise(ok => { map.once('idle', ok); setTimeout(ok, 20000); }); // the base style comes from the page's map (the app may have opened on Projects)
    if (!map.isStyleLoaded()) throw new Error('the map didn’t load, so the picture can’t be taken. Try again in a moment');
    box.style.cssText = 'position:fixed;left:0;top:0;width:' + W + 'px;height:' + H + 'px;opacity:0;pointer-events:none;z-index:-1'; document.body.append(box);
    const st = RD.baseStyle(map.getStyle(), ctx.baseLayers?.()); // the basemap only: filings, heat, pins, highlights, parcels, buildings and any open plan stay off
    const F = SP.frame(pl.origin), cam = RD.cameraFor(view, pl, { px: W, lat: pl.origin[1], target });
    const m2 = new maplibregl.Map({ container: box, style: st, center: F.toLL(cam.center), zoom: cam.zoom, pitch: Math.min(cam.pitch, map.getMaxPitch()), bearing: cam.bearing, maxPitch: map.getMaxPitch(),
      interactive: false, attributionControl: false, fadeDuration: 0, pixelRatio: ratio, canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true } });
    const settle = (ev, ms) => new Promise(ok => { let d = false; const f = () => { if (!d) { d = true; ok(); } }; m2.once(ev, f); setTimeout(f, ms); });
    try {
      await settle('load', 20000);
      addLayers(m2);
      let fc = SP.planFeatures(G.effective(pl), null, null); MAP.decorate(fc, pl, {}); fc = T.visibleFeatures(fc, T.viewOf(pl)); m2.getSource(SRC).setData(fc); // as draw() puts it on the page's map
      for (const id of HIDE_FOR_RENDER) if (m2.getLayer(id)) m2.setLayoutProperty(id, 'visibility', 'none');
      fitSiteInFrame(pl, { l: 0, t: 0, r: W, b: H }, { left: 0, top: 0, width: W, height: H }, close ? { points: RD.heroPoints(close), tall: [close] } : {}, m2);
      await settle('idle', 25000);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      await new Promise((ok, no) => { m2.once('render', () => { try { g.drawImage(m2.getCanvas(), 0, 0, W, H); ok(); } catch (e) { no(e); } }); m2.triggerRepaint(); });
      return { image: c.toDataURL('image/jpeg', quality), camera: cam, w: W, h: H };
    } finally { try { m2.remove(); } catch (e) { /* gone */ } box.remove(); }
  }
  // renderings made from the project page, one project at a time: { plid, n, i, msg, abort }
  const bgRender = new Map();
  async function renderInBackground(p, pl, views, look, time, target = null) {
    if (bgRender.get(p.id)) return;
    const run = { plid: pl.id, n: views.length, i: 0, msg: 'Getting ready…', abort: new AbortController() }; bgRender.set(p.id, run);
    const show = () => { if (ctx.view === 'projects' && cur === p.id && tabFor(p) === 'renderings') render(); };
    let made = 0, why = '', capped = false; show();
    try {
      const facts = await factsFor(pl).catch(() => []), parcels = (pl.parcels || (pl.parcel ? [pl.parcel] : [])).map(k => p.parcels.find(x => x.key === k)).filter(Boolean);
      const brief = RD.briefOf(pl, { metrics: SP.metrics(pl), address: parcels[0]?.label || '', facts, look, time, basemap: imageryBase() ? 'sat' : 'map' });
      const hero = target && { id: target.id, name: RD.buildingName(target) }, heroBrief = target && RD.briefOf(pl, { metrics: SP.metrics(pl), address: parcels[0]?.label || '', facts, look, time, basemap: imageryBase() ? 'sat' : 'map', focus: target });
      for (let i = 0; i < views.length && !run.abort.signal.aborted; i++) {
        const isHero = RD.byId(RD.VIEWS, views[i]).hero && hero, sig = planSig(pl);
        run.i = i; run.msg = 'Taking the picture ' + (isHero ? 'of ' + hero.name : RD.byId(RD.VIEWS, views[i]).label.toLowerCase()) + '…'; show();
        const cap = await captureOffscreen(pl, views[i], isHero ? target : null); if (run.abort.signal.aborted) break;
        run.msg = 'The AI is painting ' + (isHero ? 'the close-up of ' + hero.name : RD.byId(RD.VIEWS, views[i]).label.toLowerCase()) + ' (about a minute)…'; show();
        const r = await fetch('api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: cap.image, brief: isHero ? heroBrief : brief, view: views[i], ...(ctx.aiFor?.('render') || {}) }), signal: run.abort.signal });
        const d = await r.json().catch(() => ({}));
        if (r.status === 402) { rbudget = { ...(rbudget || {}), spent: d.spent, cap: d.cap, month: d.month }; rbAt = Date.now(); capped = true; }
        if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
        if (d.budget?.spent != null) { rbudget = { ...(rbudget || {}), ...d.budget, images: (rbudget?.images || 0) + 1 }; rbAt = Date.now(); }
        const P1 = db.projects.find(x => x.id === p.id), q = P1?.plans.find(x => x.id === pl.id); if (!q) break;
        const id = pl.id + '/' + Date.now().toString(36) + '-' + views[i];
        await rput(id, await toBlob(d.image)); await rput(id + ':m', await toBlob(cap.image)).catch(() => {});
        q.renders = (q.renders || []).concat([{ id, view: views[i], look, time, at: new Date().toISOString(), model: d.model || '', size: d.size || '', sig, by: get(NAME_KEY) || '', ...(isHero ? { target: hero } : {}) }]);
        while (q.renders.length > 16) { const old = q.renders.shift(); rdel(old.id); rdel(old.id + ':m'); }
        save(P1); made++;
      }
    } catch (e) { why = e.name === 'AbortError' ? '' : e.message; }
    finally {
      bgRender.delete(p.id); if (!capped) rbAt = 0; show();
      if (made) ctx.toast((made === 1 ? 'Rendering of ' + pl.name + ' ready.' : made + ' renderings of ' + pl.name + ' ready.') + (why ? ' The next one failed: ' + why : ''));
      else if (why) ctx.toast(capped ? why : 'No rendering: ' + why);
    }
  }
  // Project the parcel's corners through the map's own camera (pitch and bearing included) and move the camera until
  // they all sit inside the free part of the frame: 8% clear at the sides, 9% below, and room above for the tallest
  // building and a strip of sky. Zoom steps by the overflow each round; the view is re-centred on the parcel each round.
  // points: what to fit instead of the parcel (plan feet, e.g. a close-up's building grown by its margin); tall: the
  // buildings whose height needs room above (all of them by default).
  function fitSiteInFrame(pl, free, m, { points = null, tall: tallEls = null } = {}, mp = map) {
    const ll = points?.length >= 3 && pl?.origin ? points.map(SP.frame(pl.origin).toLL) : ringLL(pl); if (!ll) return;
    const W = free.r - free.l, H = free.b - free.t, aspect = 16 / 9, fw = Math.min(W, H * aspect), fh = fw / aspect; // the 16:9 cut the picture keeps
    const fl = free.l - m.left + (W - fw) / 2, ft = free.t - m.top + (H - fh) / 2, cx = fl + fw / 2, cy = ft + fh / 2;
    const tall = Math.max(14, ...(tallEls || pl.elements.filter(e => e.kind === 'building')).map(e => (e.floors || 1) * (SP.USES[e.use]?.floorH || 12))) * 0.3048;
    for (let i = 0; i < 14; i++) {
      const px = ll.map(p => mp.project(p)), xs = px.map(q => q.x), ys = px.map(q => q.y), bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const mpp = 40075016.686 * Math.cos(mp.getCenter().lat * Math.PI / 180) / (256 * 2 ** mp.getZoom()), tallPx = tall / mpp * Math.sin(mp.getPitch() * Math.PI / 180) * 1.3;
      const availW = fw * 0.84, availH = fh - fh * 0.09 - Math.max(fh * 0.16, tallPx); // sides 8% each; sky and the roofs above; 9% below
      const ratio = Math.max((bx1 - bx0) / availW, (by1 - by0) / availH);
      const dx = (bx0 + bx1) / 2 - cx, dy = (by0 + by1) / 2 - (ft + Math.max(fh * 0.16, tallPx) + availH / 2); // where the parcel's box is against where it should be
      const centre = mp.unproject([cx + dx, cy + dy]), z = mp.getZoom(), step = ratio > 1.02 ? -Math.log2(ratio) : ratio < 0.9 && z < 19 ? Math.min(0.5, Math.log2(0.95 / ratio) * 0.6) : 0;
      if (Math.abs(step) < 0.01 && Math.hypot(dx, dy) < 2) break;
      mp.jumpTo({ center: centre, zoom: Math.max(13, Math.min(19, z + step)) });
    }
  }
  // this month's rendering budget (api/render GET; the server refuses a render once it's spent): one line under the
  // button, read when the section shows and after each render, kept a minute. Unknown (no usage database) shows nothing.
  let rbudget = null, rbAt = 0, rbBusy = false;
  const rbUsed = () => !!rbudget && (rbudget.cap === 0 || (rbudget.spent != null && rbudget.spent >= rbudget.cap)); // a $0 budget: renderings are off
  const rbUsd = v => '$' + (v % 1 ? v.toFixed(2) : String(v));
  const budgetLine = () => { const b = rbudget; if (aiOff() || !b) return ''; if (b.cap === 0) return 'Renderings are turned off on this site.'; if (b.spent == null || !(b.cap >= 0)) return '';
    if (rbUsed()) return 'This month’s rendering budget (' + rbUsd(b.cap) + ') is used up, so rendering is paused. It resets on the 1st.';
    return 'Renderings this month: ' + (b.priced === false ? 'about ' : '') + '$' + b.spent.toFixed(2) + ' of ' + rbUsd(b.cap) + (b.images != null ? ' · ' + f0(b.images) + ' picture' + (b.images === 1 ? '' : 's') : ''); };
  function budgetHtml() { const t = budgetLine(); return '<div class="sp-hint sp-rbudget' + (rbUsed() ? ' used' : '') + '" id="spRBudget"' + (t ? '' : ' hidden') + ' title="' + (rbudget?.priced === false ? 'Estimated: the image model’s price isn’t known, so each picture is counted at a flat amount' : 'At the image model’s list price') + '">' + esc(t) + '</div>'; }
  // fill the line in place (no redraw) and hold the button while the budget is spent
  function showBudget() {
    const el = card.querySelector('#spRBudget'); if (el) { const t = budgetLine(); el.textContent = t; el.hidden = !t; el.classList.toggle('used', rbUsed()); }
    const go = card.querySelector('#spRenderGo'); if (go && rbUsed() && !ed?.rendering) { go.disabled = true; go.title = rbudget.cap === 0 ? 'Renderings are turned off on this site.' : 'This month’s rendering budget is used up. It resets on the 1st.'; }
  }
  async function loadBudget() {
    if (aiOff() || rbBusy || Date.now() - rbAt < 60e3) { showBudget(); return; }
    rbBusy = true;
    try { const r = await fetch('api/render'), d = await r.json().catch(() => ({})); if (r.ok && d.budget) rbudget = d.budget; } catch (e) { /* no line, the button still works */ }
    finally { rbAt = Date.now(); rbBusy = false; }
    showBudget();
  }
  // one picture a view, in turn: capture, ask the server, keep the picture and the massing it came from
  // target: the building a close-up frames (an element of pl), for the 'hero' view
  // A picture already being painted when the plan closes, another option opens or the page changes is still kept, on
  // the option it was taken of (it has been paid for); no further views are taken. Cancel drops it.
  async function renderViews(p, pl, views, look, time, target = null) {
    if (ed.rendering) return;
    const run = ed.rendering = { n: views.length, i: 0, view: views[0], msg: '', abort: new AbortController() }; panel();
    const live = () => ed?.rendering === run && !run.abort.signal.aborted;
    let made = 0, why = '', capped = false;
    try {
      const facts = await factsFor(pl).catch(() => []), parcels = (pl.parcels || (pl.parcel ? [pl.parcel] : [])).map(k => p.parcels.find(x => x.key === k)).filter(Boolean);
      const brief = RD.briefOf(pl, { metrics: GM(pl), address: parcels[0]?.label || '', facts, look, time, basemap: imageryBase() ? 'sat' : 'map' });
      const hero = target && { id: target.id, name: RD.buildingName(target) }, heroBrief = target && RD.briefOf(pl, { metrics: GM(pl), address: parcels[0]?.label || '', facts, look, time, basemap: imageryBase() ? 'sat' : 'map', focus: target });
      for (let i = 0; i < views.length && live(); i++) {
        run.i = i; run.view = views[i]; run.msg = 'Taking the picture from the map…'; panel();
        const isHero = RD.byId(RD.VIEWS, views[i]).hero && hero, sig = planSig(pl); // the plan as this picture shows it
        const cap = await captureView(pl, views[i], isHero ? target : null); if (!live()) break;
        run.msg = 'The AI is painting ' + (isHero ? 'the close-up of ' + hero.name : RD.byId(RD.VIEWS, views[i]).label.toLowerCase()) + ' (about a minute)…'; panel();
        const r = await fetch('api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: cap.image, brief: isHero ? heroBrief : brief, view: views[i], ...(ctx.aiFor?.('render') || {}) }), signal: run.abort.signal });
        const d = await r.json().catch(() => ({}));
        if (r.status === 402) { rbudget = { ...(rbudget || {}), spent: d.spent, cap: d.cap, month: d.month }; rbAt = Date.now(); capped = true; } // the month's budget is spent
        if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
        if (d.budget?.spent != null) { rbudget = { ...(rbudget || {}), ...d.budget, images: (rbudget?.images || 0) + 1 }; rbAt = Date.now(); }
        if (run.abort.signal.aborted) break;
        // the option it was taken of, looked up now (not the one open now, and not a copy a sync has since replaced); gone: deleted meanwhile
        const P1 = db.projects.find(x => x.id === p.id), cur = P1?.plans.find(x => x.id === pl.id); if (!cur) break;
        const id = pl.id + '/' + Date.now().toString(36) + '-' + views[i];
        await rput(id, await toBlob(d.image)); await rput(id + ':m', await toBlob(cap.image)).catch(() => {});
        cur.renders = (cur.renders || []).concat([{ id, view: views[i], look, time, at: new Date().toISOString(), model: d.model || '', size: d.size || '', sig, by: get(NAME_KEY) || '', ...(isHero ? { target: hero } : {}) }]);
        while (cur.renders.length > 16) { const old = cur.renders.shift(); rdel(old.id); rdel(old.id + ':m'); } // the newest sixteen are kept
        save(P1); made++; panel();
      }
    } catch (e) { why = e.name === 'AbortError' ? '' : e.message; }
    finally {
      const here = ed?.rendering === run; if (here) ed.rendering = null; if (!capped) rbAt = 0; panel(); // the budget is read again after a render
      const of = here ? '' : ' of ' + pl.name; // finished while another option, or another page, was open
      if (made) ctx.toast((made === 1 ? 'Rendering' + of + ' ready.' : made + ' renderings' + of + ' ready.') + (why ? ' The next one failed: ' + why : ''));
      else if (why) ctx.toast(capped ? why : 'No rendering: ' + why);
    }
  }
  const RLOOK_KEY = 'fs-render-look', RTIME_KEY = 'fs-render-time';
  const rPrefs = () => ({ look: RD.byId(RD.LOOKS, get(RLOOK_KEY)).id, time: RD.byId(RD.TIMES, get(RTIME_KEY)).id });
  const rWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
  // the building a close-up would frame now: the one selected on the plan when it is a building, else the one nearest the street
  const heroFor = pl => RD.heroTarget(pl, ed?.sel);
  // the View choices: the four site views, then the close-up named after its building (and saying so when it's the selected one)
  function viewOptions(pl, sel) {
    const T = heroFor(pl), picked = !!T && T.id === ed?.sel, v = ed.rview || 'corner';
    return sel(RD.VIEWS.filter(x => !x.hero), v) + RD.VIEWS.filter(x => x.hero).map(x => '<option value="' + x.id + '"' + (x.id === v && T ? ' selected' : '') + (T ? '' : ' disabled') +
      ' title="' + esc(!T ? 'There is no building on this plan to frame' : picked ? 'A close-up of ' + RD.buildingName(T) + ', the building selected on the plan' : 'A close-up of ' + RD.buildingName(T) + ', the building nearest the street. Select a building on the plan first to frame that one instead.') + '">' +
      esc(RD.renderLabel(x.id, T) + (picked ? ' (selected)' : '')) + '</option>').join('');
  }
  function renderHtml(p, pl) {
    const R = ed.rendering, pr = rPrefs(), list = (pl.renders || []).slice().reverse(), sig = planSig(pl), off = aiOff(), sel = (list2, v) => list2.map(x => '<option value="' + x.id + '"' + (x.id === v ? ' selected' : '') + (x.tip ? ' title="' + esc(x.tip) + '"' : '') + '>' + esc(x.label) + '</option>').join('');
    return '<div class="bsec" id="spRender"><div class="lt">Renderings' + infoBtn('A photoreal picture of this option, painted by the AI from the 3D massing on the map: the buildings, drives, parking, pond and trees stay where the plan puts them, at their heights; the materials, windows, landscaping, cars, people and sky are the AI’s. It is a concept illustration, not a design, and two renderings of one plan will differ. About a minute a view. The pictures are kept on this device; teammates see that they exist, not the pictures.', 'About renderings') + '</div>' +
      '<div class="sp-rsel"><label class="sp-f"><span class="sp-fl">View</span><select id="spRView">' + viewOptions(pl, sel) + '<option value="all"' + (ed.rview === 'all' ? ' selected' : '') + ' title="The four views of the whole site, one after another (not the building close-up)">All site views</option></select></label>' +
        '<label class="sp-f"><span class="sp-fl">Materials</span><select id="spRLook">' + sel(RD.LOOKS, pr.look) + '</select></label><label class="sp-f"><span class="sp-fl">Light</span><select id="spRTime">' + sel(RD.TIMES, pr.time) + '</select></label></div>' +
      '<div class="sp-go2"><button type="button" class="btn askai" id="spRenderGo"' + (R || off ? ' disabled' : '') + ' title="' + (off ? 'AI isn’t set up on this site' : 'Point the map’s 3D massing at the site and have the AI paint it as a photograph (1920 × 1080)') + '">' + (R ? 'Rendering ' + (R.i + 1) + ' of ' + R.n + '…' : 'Render 3D View') + '</button>' + (R ? '<button type="button" class="btn" id="spRenderStop">Cancel</button>' : '') + '</div>' +
      budgetHtml() +
      (R ? '<div class="sp-hint sp-rbusy">' + esc(R.msg) + '</div>' : off ? '<div class="sp-hint">Renderings need the AI, which isn’t set up on this site.</div>' : imageryBase() || rbUsed() ? '' : '<div class="sp-hint">Tip: switch the base map to <b>Satellite</b> first (Map layers) and the surroundings come out as they really are.</div>') +
      (list.length ? '<div class="sp-rgrid">' + list.map(r => { const V = { label: RD.renderLabel(r.view, r.target) }, stale = r.sig && r.sig !== sig; return '<figure class="sp-rth' + (stale ? ' stale' : '') + '" data-rid="' + esc(r.id) + '" title="' + esc(V.label + (stale ? ' · the plan has changed since this was made' : '')) + '"><img alt="' + esc(V.label + ' rendering') + '"><figcaption>' + esc(V.label) + ' <span>' + esc(rWhen(r.at)) + (stale ? ' · plan changed since' : '') + '</span></figcaption></figure>'; }).join('') + '</div>' +
        '<div class="sp-hint">AI concept illustrations, not designs: placement and heights follow the plan, the details are invented. Click one to see it full size, compare it with the massing, download or delete it. The two newest go on the Site Plan PDF.</div>' : '') + '</div>';
  }
  function wireRender(p, pl) {
    const $ = q => card.querySelector(q), on = (q, fn) => { const el = $(q); if (el) el.onclick = fn; };
    const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const vw = $('#spRView'); if (vw) vw.onchange = () => { ed.rview = vw.value; };
    const lk = $('#spRLook'); if (lk) lk.onchange = () => keep(RLOOK_KEY, lk.value);
    const tm = $('#spRTime'); if (tm) tm.onchange = () => keep(RTIME_KEY, tm.value);
    on('#spRenderGo', () => { const v = $('#spRView')?.value || 'corner', pr = rPrefs(), hero = RD.byId(RD.VIEWS, v, null)?.hero; renderViews(p, pl, v === 'all' ? RD.SITE_VIEWS : [v], pr.look, pr.time, hero ? heroFor(pl) : null); });
    on('#spRenderStop', () => { ed.rendering?.abort.abort(); });
    loadBudget();
    card.querySelectorAll('.sp-rth').forEach(f => { const r = (pl.renders || []).find(x => x.id === f.dataset.rid); if (!r) return;
      renderSrc(r.id).then(u => { const img = f.querySelector('img'); if (u && img) img.src = u; else if (img) { const g = document.createElement('span'); g.className = 'sp-rgone'; g.textContent = 'Not on this device' + (r.by ? ' (made by ' + r.by + ')' : ''); img.replaceWith(g); f.classList.add('gone'); } }); // a teammate's: a plain placeholder, not a broken picture
      f.onclick = () => openRender(p, pl, r); });
  }
  // the picture full size, with the massing it was made from a click away, Download and Delete
  // (from the plan's Render section or the project page's Renderings tab; from: the thumbnail, which gets the focus back)
  async function openRender(p, pl, r, from) {
    const V = { label: RD.renderLabel(r.view, r.target) }, src = await renderSrc(r.id), msrc = await renderSrc(r.id + ':m');
    if (!src) { ctx.toast('That picture isn’t on this device (renderings stay where they were made).'); return; }
    document.getElementById('spRView2')?.remove();
    const box = document.createElement('div'); box.id = 'spRView2'; box.className = 'sp-rview'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', V.label + ' rendering');
    box.innerHTML = '<div class="sp-rvin"><div class="sp-rvtop"><b>' + esc(pl.name) + ' · ' + esc(V.label) + '</b><span>' + esc(RD.byId(RD.LOOKS, r.look).label) + ' · ' + esc(RD.byId(RD.TIMES, r.time).label) + (r.model ? ' · ' + esc(r.model) : '') + ' · ' + esc(rWhen(r.at)) + (r.sig && r.sig !== planSig(pl) ? ' · <em class="sp-rvold">plan changed since this was made</em>' : '') + '</span><button type="button" class="sp-lb" data-x aria-label="Close">✕</button></div>' +
      '<div class="sp-rvimg"><img src="' + src + '" alt="' + esc(V.label + ' rendering') + '"></div>' +
      '<div class="sp-rvbar"><span class="sp-hint">AI concept illustration, not a design.</span><span class="sp-rvbtns">' + (msrc ? '<button type="button" class="btn sm" data-cmp aria-pressed="false">Show the massing</button>' : '') + '<button type="button" class="btn sm" data-dl>Download</button><button type="button" class="btn sm ghost" data-del>Delete</button></span></div></div>';
    document.body.appendChild(box); box.querySelector('[data-x]').focus({ preventScroll: true }); // the keyboard lands in the viewer
    const img = box.querySelector('img'), close = () => { box.remove(); document.removeEventListener('keydown', key, true); (from?.isConnected ? from : document.querySelector('[data-rid="' + CSS.escape(r.id) + '"]'))?.focus?.(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', key, true);
    box.onclick = e => { if (e.target === box) close(); };
    box.querySelector('[data-x]').onclick = close;
    const cmp = box.querySelector('[data-cmp]'); if (cmp) cmp.onclick = () => { const onM = cmp.getAttribute('aria-pressed') !== 'true'; cmp.setAttribute('aria-pressed', String(onM)); img.src = onM ? msrc : src; cmp.textContent = onM ? 'Show the rendering' : 'Show the massing'; };
    box.querySelector('[data-dl]').onclick = async () => { const b = await rget(r.id); if (b instanceof Blob) ctx.saveFile(fileName(p, pl) + '-' + r.view + '-rendering.jpg', b, 'image/jpeg'); };
    box.querySelector('[data-del]').onclick = () => { if (!confirm('Delete this rendering?')) return; deleteRenders(p.id, pl.id, [r.id]); close(); };
  }
  // renderings off an option (ids; all of them with none), from the plan's Render section, the viewer and the project
  // page alike: the list on the option (which syncs) and the pictures and massing on this device. The project as it is
  // now: a sync may have replaced the copy a viewer was opened from. Returns how many went.
  function deleteRenders(pid, plid, ids = null) {
    const P1 = db.projects.find(x => x.id === pid), pl = P1?.plans.find(x => x.id === plid) || (ed?.draftPlan?.id === plid ? ed.draftPlan : null); if (!pl) return 0;
    const keys = PJ.removeRenders(pl, ids); if (!keys.length) return 0;
    dropImages(keys); for (const k of keys) { const u = rurl.get(k); if (u) { URL.revokeObjectURL(u); rurl.delete(k); } }
    if (P1) save(P1); if (ed) panel(); return keys.length / 2;
  }
  // Delete all on the Renderings tab (the project's, or one option's): one question naming how many, then gone
  function deleteAllRenders(p, pl) {
    const list = pl ? [pl] : p.plans, n = list.reduce((s, x) => s + (x.renders || []).length, 0); if (!n) return;
    const theirs = list.reduce((s, x) => s + (x.renders || []).filter(r => r.by && r.by !== get(NAME_KEY)).length, 0);
    if (!confirm('Delete ' + (n === 1 ? 'the rendering' : 'all ' + n + ' renderings') + ' of ' + (pl ? pl.name : p.name) + '?' + (shared === true ? ' They go for the team too' + (theirs ? ', including ' + plural(theirs, 'picture') + ' teammates made' : '') + '.' : '') + ' This can’t be undone.')) return;
    let gone = 0; for (const x of list) gone += deleteRenders(p.id, x.id); ctx.toast('Deleted ' + plural(gone, 'rendering') + ' of ' + (pl ? pl.name : p.name) + '.');
  }
  // the two newest renderings that still match the plan, as data URLs for the PDF sheet, at up to 1600 px wide so the
  // sheet stays under the PDF service's request limit
  async function rendersForSheet(pl, max = 2) {
    const sig = planSig(pl), out = [];
    const small = async b => { try { const bmp = await createImageBitmap(b), k = Math.min(1, 1600 / bmp.width), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85); } catch (e) { return blobToData(b); } };
    for (const r of (pl.renders || []).slice().reverse()) { if (out.length >= max || (r.sig && r.sig !== sig)) continue; const b = await rget(r.id); if (b instanceof Blob) out.push({ src: await small(b), caption: RD.renderLabel(r.view, r.target) + ' · ' + RD.byId(RD.LOOKS, r.look).label + ' · ' + RD.byId(RD.TIMES, r.time).label }); }
    return out;
  }
  function geojson(p, pl) {
    const fc = SP.planFeatures(pl, null);
    fc.features = fc.features.filter(f => f.properties.k !== 'label').map(f => ({ ...f, properties: { ...f.properties, project: p.name, plan: pl.name } }));
    return { ...fc, properties: { project: p.name, plan: pl.name, ...GM(pl), ...(GON(pl) ? { label: G.LABEL, guardrails: 'Waller, scenario ' + G.settingsOf(pl).scenario } : {}) } };
  }
  function summary(p, pl) {
    const m = GM(pl), prog = SP.normalizeProgram(pl.program), parcel = p.parcels.find(x => x.key === pl.parcel);
    return [p.name + ' · ' + pl.name, parcel?.label, SP.USES[prog.use].label + ': ' + f0(m.gfa) + ' sf' + (m.units ? ' (about ' + m.units + ' units)' : '') + ' on ' + m.acres.toFixed(2) + ' acres',
      'Coverage ' + pct(m.coverage) + ', FAR ' + m.far.toFixed(2), 'Parking ' + m.spaces + ' spaces (' + m.required + ' needed)', m.pond ? 'Detention ' + (m.pond / 43560).toFixed(2) + ' acres' : '',
      ...GC(pl).map(i => '• ' + i.text), ...(GON(pl) ? guardSummary(pl) : [])].filter(Boolean).join('\n');
  }
  // a Waller plan's summary: the label, the scenarios as a range, the land-use reconciliation and the open risks
  function guardSummary(pl) {
    const sc = scenarios(pl) || {}, yl = ['A', 'B', 'C'].map(k => sc[k]).filter(Boolean), T = G.landTable(pl);
    return ['', G.LABEL, 'Waller guardrails · laid out as ' + G.settingsOf(pl).scenario + ' (' + G.SCENARIOS[G.settingsOf(pl).scenario].name + ')', 'Leasable ' + G.rangeText(G.range(yl, 'leasableSf'), ' sf') + ' across scenarios A–C (a range while inputs are unresolved)',
      'Land use:', ...T.rows.map(r => '  ' + r.label + ': ' + Math.abs(r.acres).toFixed(2) + ' ac · ' + r.basis + ' [' + r.cls + ']'), ...T.qty.map(q => '  ' + q.label + ': ' + q.qty + ' [' + q.cls + ']'),
      'Unresolved risks:', ...G.risks(pl).map(r => '  • ' + r.title + (r.stop ? ' (stop condition)' : ''))];
  }
  const scenYields = pl => { const sc = scenarios(pl) || {}; return Object.fromEntries(['A', 'B', 'C'].map(k => [k, sc[k] || null])); };

  // ---------- the Projects view ----------
  // All projects as cards or a list (the choice is kept in this browser), with search and sort. Click one for its page:
  // a header with its status, then tabs: Overview (information, the site's jurisdiction, parcels), Sites (each option
  // drawn with its numbers), Renderings and Ask. Text wraps rather than being cut off. A sync never redraws under someone typing (it waits
  // until they leave the field), so half-typed notes or a name aren't lost.
  const VIEW_KEY = 'fs-projects-view';
  const SORTS = { updated: 'Recently updated', name: 'Name', acres: 'Largest site', options: 'Most options', status: 'Status' };
  const PIN = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8z"/><circle cx="8" cy="6.6" r="1.6"/></svg>';
  const ICON_CARDS = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>';
  const ICON_LIST = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5.5 4h8.5M5.5 8h8.5M5.5 12h8.5"/><circle cx="2.6" cy="4" r=".6"/><circle cx="2.6" cy="8" r=".6"/><circle cx="2.6" cy="12" r=".6"/></svg>';
  let pq = '', psort = 'updated', mode = get(VIEW_KEY) === 'list' ? 'list' : 'cards', cur = null, adding = false, renaming = false, waiting = false;
  const thumbs = new Map(), infos = new Map();
  const plural = (n, w) => f0(n) + ' ' + w + (n === 1 ? '' : 's');
  const money = v => '$' + f0(v);
  const when = s => { const d = new Date(s), now = new Date(), days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
    return days === 0 ? 'today' : days === 1 ? 'yesterday' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }); };
  const acresOf = p => p.parcels.reduce((a, x) => a + (x.acres || 0), 0) || Math.max(0, ...p.plans.filter(x => x.ring.length >= 3).map(x => SP.ringArea(x.ring) / 43560));
  const ver = p => p.updated || p.created || '';
  // an option's numbers and the count of problems that block it; kept until the project changes
  function info(p, pl) {
    const k = pl.id + '|' + ver(p); let v = infos.get(k);
    if (!v) { const drawn = pl.ring.length >= 3, m = drawn ? GM(pl) : null; let fin = null; if (m?.gfa) try { fin = RUN.finOf(pfRun(p, pl)); } catch (e) { fin = null; } // the money as its Pro forma shows it
      const m1 = m?.gfa && pl.elements.some(e => e.phase === 2) ? GM({ ...pl, elements: pl.elements.filter(e => e.phase !== 2) }) : null; // Phase 1 first, as on the plan
      v = { drawn, m, m1, fin, bad: drawn ? GC(pl).filter(i => i.level === 'bad').length : 0 }; infos.set(k, v); if (infos.size > 400) infos.delete(infos.keys().next().value); }
    return v;
  }
  // the drawing for an option, street side down; kept until the project changes
  function thumb(p, pl) {
    const k = pl.id + '|' + ver(p); let s = thumbs.get(k);
    if (s == null) {
      try { s = planSVG(pl, { px: 320, pad: 14, labels: false, lines: false }).svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' preserveAspectRatio="xMidYMid meet" aria-hidden="true"'); } catch (e) { s = ''; }
      thumbs.set(k, s); if (thumbs.size > 300) thumbs.delete(thumbs.keys().next().value);
    }
    return s;
  }
  // where a new option goes: the newest drawn option's site (with its street side and setbacks), else the project's parcels
  const newestDrawn = p => p.plans.filter(x => x.ring.length >= 3).sort((a, b) => t(b.created) - t(a.created))[0];
  const keptOf = p => p.keptSite?.ring?.length >= 3 ? p.keptSite : null; // the site of the last drawn option deleted
  function siteFor(p) {
    const last = newestDrawn(p) || keptOf(p);
    if (last) return { origin: last.origin, ring: clone(last.ring), src: last.src, front: last.front, frontGuess: last.frontGuess, setbacks: { ...last.setbacks }, parcel: last.parcel, parcels: last.parcels, zoning: last.zoning || null, program: { use: SP.normalizeProgram(last.program).use } };
    const recs = p.parcels.filter(x => x.geometry), b = recs.length ? siteOf(recs) : null;
    return b?.ring?.length >= 3 ? { origin: b.origin, ring: b.ring, src: recs.length > 1 ? 'parcels' : 'parcel', parcel: recs[0].key, parcels: recs.map(r => r.key), elements: gapPieces(b, { elements: [] }) } : null;
  }
  // a project's picture: its newest option with buildings, else its newest drawn site, else the parcel outline
  function cover(p) {
    const drawn = p.plans.filter(x => x.ring.length >= 3).sort((a, b) => t(b.created) - t(a.created)), pl = drawn.find(x => x.elements.some(e => e.kind === 'building')) || drawn[0];
    if (pl) return thumb(p, pl);
    const s = siteFor(p); return s ? thumb(p, { id: 'site:' + p.id, ring: s.ring, origin: s.origin, front: null, elements: [], setbacks: { ...SP.SETBACKS }, program: { use: 'retail' } }) : '';
  }
  // the biggest option by floor area, for the summary
  function biggest(p) { let best = null; for (const pl of p.plans) { const { m } = info(p, pl); if (m?.gfa && (!best || m.gfa > best.m.gfa)) best = { pl, m }; } return best; }
  const addrOf = p => p.parcels.length ? esc(p.parcels[0].label) + (p.parcels.length > 1 ? ' and ' + plural(p.parcels.length - 1, 'more parcel') : '') : '';
  // New Option: a blank site from the newest drawn option (its lot, street sides, setbacks and easements; SP.blankOf), else
  // the parcels' outline, else the site is drawn first; it opens with the Build box ready
  function addOption(p) { const last = newestDrawn(p) || keptOf(p), s = last ? null : siteFor(p); if (!last && !s) return drawSite(p);
    const pl = last ? SP.blankOf(last, { id: uid(), name: nextName(p) }) : newPlan(p, s); p.plans.push(pl); save(p); openReady(p, pl, last?.name); }
  function drawSite(p) { // the map goes to the project's site first; the option is made when the drawing is finished (Cancel leaves nothing behind)
    const s = siteFor(p), c = map.getCenter(), at = s?.origin || p.parcels.find(x => x.center)?.center || [+c.lng.toFixed(6), +c.lat.toFixed(6)], pl = newPlan(p, { origin: at });
    open(p.id, pl.id, { draw: true, draftPlan: pl }); }

  // ----- all projects -----
  function shown() {
    const q = pq.trim().toLowerCase(), by = { updated: (a, b) => t(b.updated) - t(a.updated), name: (a, b) => a.name.localeCompare(b.name), acres: (a, b) => acresOf(b) - acresOf(a), options: (a, b) => b.plans.length - a.plans.length || t(b.updated) - t(a.updated), status: (a, b) => PJ.STATUSES.indexOf(PJ.statusOf(a)) - PJ.STATUSES.indexOf(PJ.statusOf(b)) || a.name.localeCompare(b.name) }[psort];
    return db.projects.filter(p => !q || [p.name, p.notes, p.by, ...p.parcels.flatMap(x => [x.label, x.owner]), ...p.plans.map(x => x.name)].join(' ').toLowerCase().includes(q)).sort(by);
  }
  // the status as the small coloured pill from the project page's header (nothing for a project that has none set)
  const stPill = p => p.status ? '<span class="pj-st" data-st="' + PJ.statusOf(p).id + '"><span class="pj-stp">' + esc(PJ.statusOf(p).label) + '</span></span>' : '';
  function cardHtml(p) {
    const ac = acresOf(p), big = biggest(p), addr = addrOf(p), c = cover(p);
    return '<button type="button" class="pj-card" data-open="' + esc(p.id) + '"><span class="pj-thumb">' + (c || '<i>No site yet</i>') + '</span><span class="pj-cb">' +
      '<b class="pj-cn">' + esc(p.name) + '</b>' + stPill(p) + (addr ? '<span class="pj-addr">' + PIN + '<span>' + addr + '</span></span>' : '') +
      '<span class="pj-facts">' + (ac ? '<span class="pj-fact"><b>' + ac.toFixed(2) + '</b> acres</span>' : '') + '<span class="pj-fact"><b>' + f0(p.plans.length) + '</b> option' + (p.plans.length === 1 ? '' : 's') + '</span>' +
        (big ? '<span class="pj-fact"><b>' + f0(big.m.gfa) + '</b> sq ft max</span>' : '') + '</span>' +
      '<span class="pj-upd">Updated ' + when(ver(p)) + (p.by ? ' by ' + esc(p.by) : '') + '</span></span></button>';
  }
  function rowHtml(p) {
    const ac = acresOf(p), big = biggest(p), addr = addrOf(p), c = cover(p);
    return '<button type="button" class="pj-row" data-open="' + esc(p.id) + '"><span class="pj-thumb pj-rthumb">' + (c || '<i>No site</i>') + '</span>' +
      '<span class="pj-rmain"><b>' + esc(p.name) + '</b>' + stPill(p) + (addr ? '<span class="pj-addr">' + PIN + '<span>' + addr + '</span></span>' : '') + '</span>' +
      '<span class="pj-rstats"><span class="pj-rc">' + (ac ? '<b>' + ac.toFixed(2) + '</b> acres' : '<em>No site</em>') + '</span><span class="pj-rc"><b>' + f0(p.plans.length) + '</b> option' + (p.plans.length === 1 ? '' : 's') + '</span>' +
        '<span class="pj-rc">' + (big ? '<b>' + f0(big.m.gfa) + '</b> sq ft' : '<em>Not laid out</em>') + '</span><span class="pj-rc pj-rupd">' + when(ver(p)) + (p.by ? ' by ' + esc(p.by) : '') + '</span></span>' +
      '<span class="pj-chev" aria-hidden="true">›</span></button>';
  }
  function listHtml() {
    if (!db.projects.length) return '<div class="pj-empty"><b>No projects yet</b><ol><li>On the map, zoom in to street level and click a parcel or building.</li><li>At the top of its card, click <b>Site plan</b>.</li><li>Lay out the site by hand, or describe what you want and use <b>Build with AI</b>.</li></ol><div class="btnrow"><button type="button" class="btn primary" data-go="map">Go to the Map</button></div></div>';
    const list = shown();
    if (!list.length) return '<div class="pj-empty">No projects match “' + esc(pq) + '”. <button type="button" class="lnk" data-clear="1">Show all projects</button></div>';
    return mode === 'list' ? '<div class="pj-list"><div class="pj-lh" aria-hidden="true"><span></span><span>Project</span><span>Site</span><span>Options</span><span>Largest option</span><span>Updated</span><span></span></div>' + list.map(rowHtml).join('') + '</div>'
      : '<div class="pj-grid">' + list.map(cardHtml).join('') + '</div>';
  }
  function indexHtml() {
    const all = db.projects, nPlans = all.reduce((s, p) => s + p.plans.length, 0);
    const share = shared === true ? 'shared with the team' : shared === false ? 'saved on this device only' : 'saved on this device';
    return '<div class="vhead"><div><div class="kicker">Site plans</div><h2>Projects</h2><div class="vsub">' + (all.length ? plural(all.length, 'project') + ' · ' + plural(nPlans, 'site plan option') + ' · ' : '') + share + '</div></div>' +
        '<div class="vctl">' + (adding ? '' : '<button type="button" class="btn primary" id="pjNew">+ New Project</button>') + '<div class="team-slot" id="pjTeam"></div></div></div>' +
      (adding ? '<form class="pj-new" id="pjForm"><label class="sr" for="pjNm">New project name</label><input id="pjNm" maxlength="120" placeholder="Project name" autocomplete="off"><span class="btnrow"><button class="btn primary">Create Project</button><button type="button" class="btn" id="pjCancel">Cancel</button></span>' +
        '<div class="rnote">You can add parcels and site plans to it next. To start from a parcel instead, click it on the map and use <b>Site plan</b> at the top of its card.</div></form>' : '') +
      (all.length ? '<div class="pj-bar"><label class="search sm pj-q"><input type="search" id="pjQ" placeholder="Search projects" value="' + esc(pq) + '" aria-label="Search projects, parcels, owners and notes"></label>' +
        '<div class="pj-ctl"><label class="pj-sort">Sort <select class="chip" id="pjSort">' + Object.entries(SORTS).map(([k, l]) => '<option value="' + k + '"' + (psort === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
        '<div class="seg seg2 pj-mode" role="group" aria-label="Show projects as">' + [['cards', 'Cards', ICON_CARDS], ['list', 'List', ICON_LIST]].map(([k, l, ic]) => '<button type="button" data-v="' + k + '" aria-pressed="' + (mode === k) + '">' + ic + l + '</button>').join('') + '</div></div></div>' : '') +
      '<div id="pjList">' + listHtml() + '</div>';
  }

  // ----- one project -----
  // A header (name, status, address, acres, who updated it) and five tabs: Overview (the project's information, the
  // site's jurisdiction and the parcels), Sites (the site plan options; id 'options'), Renderings (every option's
  // pictures), Plans (plan sets made from an option) and Ask
  // (questions about the whole project). The tab is kept per project for this visit and in the address (pt=).
  const ptab = new Map(), pasks = new Map(), siteRuns = new Map(), siteFail = new Map();
  const tabFor = p => PJ.tabOf(ptab.get(p.id));
  const rLabel = r => RD.renderLabel(r.view, r.target); // a rendering by its view, and the building it frames when it has one
  const laidOut = pl => pl.ring.length >= 3 && pl.elements.some(e => e.kind === 'building');
  // facts the app looked up (the site's jurisdiction, Regrid's city) aren't anyone's edit: looked up on each device and kept with the project on that device (teammates look it up themselves)
  // without changing who updated the project or when
  function quietSave(p) { if (!db.dirty.includes(p.id)) db.dirty.push(p.id); persist(); clearTimeout(syncT); syncT = setTimeout(sync, 1500); }

  // the option's one-line summary: use, floor area, units, parking against what's needed, coverage
  function planTile(p, pl) {
    const { drawn, m, m1, bad, fin } = info(p, pl), use = SP.USES[SP.normalizeProgram(pl.program).use], a = m1 || m, p2 = m1 ? K.headline(m, m1, null).p2 : '', nR = (pl.renders || []).length;
    const line = m?.gfa ? [esc(use.label), f0(a.gfa) + ' sq ft' + (m1 ? ' in Phase 1' : ''), a.units ? plural(a.units, 'unit') : '', '<span' + (m.spaces < m.required ? ' class="short"' : '') + '>' + f0(m.spaces) + ' of ' + f0(m.required) + ' spaces</span>', pct(m.coverage) + ' coverage'].filter(Boolean).join(' · ') : '';
    return '<div class="pj-plan"><button type="button" class="pj-popen" data-plan="' + esc(pl.id) + '" title="Open ' + esc(pl.name) + ' on the map">' +
      '<span class="pj-thumb">' + (drawn ? thumb(p, pl) : '<i>No site drawn</i>') + (bad ? '<span class="pj-iss">' + plural(bad, 'issue') + '</span>' : '') + (lastOpen?.plid === pl.id ? '<span class="pj-live" title="The option you had open last">Last opened</span>' : '') + '</span>' +
      '<span class="pj-ph"><b>' + esc(pl.name) + '</b></span>' +
      (line ? '<span class="pj-oline">' + line + '</span>' + (p2 ? '<span class="pj-p2">' + esc(p2) + '</span>' : '') +
        (fin ? '<span class="pj-fin" title="From this option’s Pro forma (land at ' + $M(fin.land) + ')">' + (fin.forSale ? $M(fin.cost) + ' cost · ' + pc2(fin.margin) + ' margin' : '≈ ' + $M(fin.value) + ' value · ' + pc2(fin.yoc) + ' yield on cost') + '</span>' : '')
        : '<span class="pj-none">' + (drawn ? m.acres.toFixed(2) + ' acres, nothing laid out yet' : 'Open it to draw the site on the map') + '</span>') + '</button>' +
      '<div class="pj-pact"><span class="pj-rn">' + (nR ? plural(nR, 'rendering') : drawn ? 'No renderings' : '') + '</span>' +
        (pl.ring.length < 3 ? '' : '<button type="button" class="lnk" data-copy="' + esc(pl.id) + '" title="A copy of ' + esc(pl.name) + ' as a new option, its layouts included">Copy</button>') + '<button type="button" class="lnk pj-pdel" data-delpl="' + esc(pl.id) + '">Delete</button></div></div>';
  }
  function headHtml(p) {
    const ac = acresOf(p), st = PJ.statusOf(p), addr = addrOf(p);
    return '<button type="button" class="lnk pj-back" data-back="1">‹ All projects</button><header class="pj-head"><div class="kicker">Project</div>' +
      (renaming ? '<form class="pj-ren" id="pjRenForm"><label class="sr" for="pjRen">Project name</label><textarea id="pjRen" rows="1" maxlength="120">' + esc(p.name) + '</textarea><span class="btnrow"><button class="btn primary">Save</button><button type="button" class="btn" id="pjRenX">Cancel</button></span></form>'
        : '<div class="pj-title"><h2>' + esc(p.name) + '</h2><button type="button" class="lnk" id="pjRename">Rename</button></div>') +
      '<div class="pj-hmeta"><span class="pj-st" data-st="' + st.id + '"><label class="sr" for="pjStatus">Status</label><select id="pjStatus" title="The project’s status (shared with the team)">' + PJ.STATUSES.map(x => '<option value="' + x.id + '"' + (x.id === st.id ? ' selected' : '') + '>' + x.label + '</option>').join('') + '</select></span>' +
        (addr ? '<span class="pj-addr">' + PIN + '<span>' + addr + '</span></span>' : '') + (ac ? '<span class="pj-hac"><b>' + ac.toFixed(2) + '</b> acres</span>' : '') +
        '<span class="pj-upd">Updated ' + when(ver(p)) + (p.by ? ' by ' + esc(p.by) : '') + (p.created ? ' · started ' + when(p.created) : '') + '</span></div></header>';
  }
  const rendersOf = p => p.plans.flatMap(pl => (pl.renders || []).map(r => ({ pl, r })));
  function tabsHtml(p, tab) {
    const n = { options: p.plans.length, renderings: rendersOf(p).length, plans: setsOf(p).length, files: (p.files || []).length }, busy = pasks.get(p.id)?.busy;
    return '<div class="mx-tabs pj-tabs" role="tablist" aria-label="Project sections">' + PJ.TABS.map(t => { const on = t.id === tab;
      return '<button type="button" role="tab" id="pjTab-' + t.id + '" data-tab="' + t.id + '" aria-selected="' + on + '" aria-controls="pjPanel" tabindex="' + (on ? 0 : -1) + '">' + t.label +
        (n[t.id] ? '<span class="pj-tn"> · ' + f0(n[t.id]) + '</span>' : '') + (t.id === 'ask' && busy ? '<span class="pj-tn"> · answering…</span>' : '') + '</button>'; }).join('') + '</div>';
  }
  function detailHtml(p) {
    const tab = tabFor(p), body = { overview: overviewHtml, options: optionsHtml, renderings: rendersHtml, plans: setsHtml, files: SF.html, ask: pAskHtml }[tab](p);
    return headHtml(p) + tabsHtml(p, tab) + '<div class="pj-panel pj-p-' + tab + '" id="pjPanel" role="tabpanel" aria-labelledby="pjTab-' + tab + '">' + body + '</div>';
  }

  // ----- Overview: the project's information, the site's jurisdiction, the parcels -----
  function overviewHtml(p) {
    const ac = acresOf(p), big = biggest(p), c = cover(p);
    const owners = [...new Set(p.parcels.map(x => x.owner).filter(Boolean))], value = p.parcels.reduce((s, x) => s + (x.marketValue || 0), 0), land = p.parcels.reduce((s, x) => s + (x.landValue || 0), 0);
    const fact = (k, v, sub) => '<div><dt>' + k + '</dt><dd>' + v + (sub ? '<small>' + sub + '</small>' : '') + '</dd></div>';
    const field = (id, label, input) => '<div class="pj-f"><label for="' + id + '">' + label + '</label>' + input + '</div>';
    return '<div class="pj-ov"><section class="pj-box pj-info" aria-labelledby="pjInfoH"><h3 class="pj-h3" id="pjInfoH">Project information</h3>' +
        '<div class="pj-ib"><div class="pj-thumb">' + (c || '<i>No site yet</i>') + '</div><dl class="pj-dl">' + fact('Site area', ac ? ac.toFixed(2) + ' acres' : 'Not set', ac ? f0(ac * 43560) + ' sq ft' : '') + fact('Parcels', f0(p.parcels.length)) +
          (owners.length ? fact(owners.length > 1 ? 'Owners' : 'Owner', esc(owners[0]), owners.length > 1 ? 'and ' + plural(owners.length - 1, 'other') : '') : '') +
          (value ? fact('Appraised value', money(value), land ? 'land ' + money(land) : '') : '') + fact('Site plan options', f0(p.plans.length)) +
          (big ? fact('Largest option', f0(big.m.gfa) + ' sq ft', esc(big.pl.name) + ' · ' + esc(SP.USES[SP.normalizeProgram(big.pl.program).use].label) + (big.m.units ? ' · ' + plural(big.m.units, 'unit') : '')) : '') + '</dl></div>' +
        '<div class="pj-fields">' + field('pjClient', 'Client / prepared for', '<input id="pjClient" maxlength="120" autocomplete="off" placeholder="Who it’s for" value="' + esc(p.client || '') + '">') +
          field('pjUse', 'Target use', '<input id="pjUse" maxlength="160" autocomplete="off" placeholder="e.g. Retail strip with two pads" value="' + esc(p.use || '') + '">') +
          '<div class="pj-f pj-fw">' + '<label for="pjNotes">Notes</label><textarea class="pj-notes" id="pjNotes" rows="' + Math.min(10, Math.max(3, (p.notes || '').split('\n').length + 1)) + '" placeholder="Asking price, broker, next steps…">' + esc(p.notes || '') + '</textarea></div>' +
          '<div class="rnote pj-fw">Saved as you go, and shared with the team.</div></div></section>' +
      jurHtml(p) + '</div>' +
      '<section class="pj-sec"><div class="lt">Parcels' + (p.parcels.length ? ' · ' + f0(p.parcels.length) : '') + '</div>' + (p.parcels.length ? '<div class="pj-prows">' + p.parcels.map(x => '<div class="pj-prow"><span class="pj-pi">' + PIN + '</span><div class="pj-pm"><b>' + esc(x.label) + '</b><span>' +
          [x.owner ? esc(x.owner) : '', x.acres ? x.acres.toFixed(2) + ' acres' : '', x.marketValue ? 'appraised ' + money(x.marketValue) : ''].filter(Boolean).join(' · ') + '</span></div><button type="button" class="btn" data-parcel="' + esc(x.key) + '">Show on Map</button></div>').join('') + '</div>'
        : startHtml(p)) + '</section>' +
      '<div class="pj-foot"><span></span><button type="button" class="lnk pj-del" data-delp="1">Delete Project</button></div>';
  }
  const startHtml = p => '<div class="pj-start"><b>No parcels yet</b><p>Find the parcel on the map, click it, then <b>Site plan</b> at the top of its card and choose <b>Add to ' + esc(p.name) + '</b>. Or click the corners of the site yourself.</p><div class="btnrow"><button type="button" class="btn primary" data-find="1">Find a Parcel</button><button type="button" class="btn" data-draw="1">Draw a Site</button></div></div>';

  // ----- the site's jurisdiction: looked up once (flood zone, districts, roads, EPA, utilities, the county and the city
  // limits) at the middle of the site and kept on the project (p.site), so the page never waits on it; Refresh asks again
  const race = (pr, ms) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]);
  const spots = new Map(); // per project version: siteFor merges the parcels' outlines, which is too slow to do several times a draw
  function siteSpot(p) { const k = p.id + '|' + ver(p) + '|' + p.parcels.length + '|' + p.plans.length; if (!spots.has(k)) { spots.set(k, spotOf(p)); if (spots.size > 60) spots.delete(spots.keys().next().value); } return spots.get(k); }
  function spotOf(p) { // the middle of the site (the newest drawn option's, else the parcels'), and its outline for the utilities
    const s = siteFor(p); let c = null, geom = null;
    if (s?.ring?.length >= 3) { const F = SP.frame(s.origin); c = F.toLL(SP.centroid(s.ring)); geom = { type: 'Polygon', coordinates: [s.ring.concat([s.ring[0]]).map(F.toLL)] }; }
    else { const x = p.parcels.find(y => y.center); if (x) { c = x.center; geom = x.geometry || null; } }
    if (!c) return null; c = c.map(v => +v.toFixed(5)); return { c, geom, key: c.join(',') };
  }
  const countyAt = c => (ctx.DATA?.counties || []).find(k => (k.outline || []).some(poly => SP.inRing(c, poly[0])))?.name || '';
  const factsOf = p => p.site?.facts ? { ...p.site.facts, ...PJ.regridFacts(p.parcels, p.plans) } : null;
  const SITE_V = 2; // 2: ground elevations (Oct 19)
  const needSite = p => { const at = siteSpot(p), f = siteFail.get(p.id); return !!at && !siteRuns.has(p.id) && (!p.site || p.site.key !== at.key || (p.site.v || 1) < SITE_V) && !(f && Date.now() - f < 6e4); };
  function gatherSite(p) {
    if (siteRuns.has(p.id)) return siteRuns.get(p.id);
    const at = siteSpot(p); if (!at) return Promise.resolve(null);
    const run = (async () => {
      const s0 = siteFor(p), [d, u, t] = await Promise.all([ctx.siteAt ? race(ctx.siteAt(at.c, '', ''), 15000).catch(e => ({ error: e.message || 'failed' })) : { error: 'none' },
        ctx.utilitiesAt ? race(ctx.utilitiesAt(at.c, at.geom), 15000).catch(() => null) : null, s0 ? race(terrainOf(s0), 55000).catch(() => null) : null]);
      let lines = null; try { lines = u ? ctx.utilityFacts(u) : null; } catch (e) { lines = null; }
      if (d?.error && !lines) throw new Error(d.error); // nothing came back: keep what was there and say so
      const x = db.projects.find(y => y.id === p.id); if (!x) return null;
      x.site = { v: SITE_V, at: new Date().toISOString(), key: at.key, facts: PJ.siteFactsFrom(d, { county: countyAt(at.c), utilities: lines, parcels: x.parcels.length, ground: t ? TR.groundFacts(t, s0.ring) : null }) }; siteFail.delete(p.id); quietSave(x);
      return x.site;
    })();
    siteRuns.set(p.id, run);
    run.catch(() => siteFail.set(p.id, Date.now())).finally(() => { siteRuns.delete(p.id); if (ctx.view === 'projects' && cur === p.id && tabFor(p) === 'overview') render(); });
    return run;
  }
  function jurHtml(p) {
    const at = siteSpot(p), S = p.site, f = factsOf(p), run = siteRuns.has(p.id) || needSite(p), failed = siteFail.has(p.id);
    const body = !S && !at ? '<p class="rnote">Add a parcel or draw the site, and its county, city, floodplain and districts are looked up here.</p>'
      : !S ? (run ? '<p class="rnote loading">Checking the county, city, floodplain and districts…</p>' : '<p class="rnote err">Couldn’t check the site just now. <button type="button" class="lnk" data-jref="1">Try again</button></p>')
      : '<dl class="pj-jur">' + PJ.jurisdictionRows(f).map(r => '<div class="pj-jr' + (r.tone ? ' ' + r.tone : '') + '"><dt>' + esc(r.label) + '</dt><dd><b>' + esc(r.value) + '</b>' +
          (r.list?.length > 1 ? '<ul>' + r.list.slice(1).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + (r.src ? '<span class="pj-src">' + esc(r.src) + '</span>' : '') + '</dd></div>').join('') + '</dl>';
    const foot = S ? '<div class="pj-jfoot"><span>Checked ' + when(S.at) + ' at the middle of the site' + (at && S.key !== at.key ? '; the site has changed since' : '') + (failed ? '; the last check failed' : '') + '</span><button type="button" class="lnk" data-jref="1"' + (run ? ' disabled' : '') + '>' + (run ? 'Checking…' : 'Refresh') + '</button></div>' : '';
    return '<section class="pj-box pj-jbox" aria-labelledby="pjJurH"' + (run ? ' aria-busy="true"' : '') + '><h3 class="pj-h3" id="pjJurH">Jurisdiction &amp; site</h3>' + body + foot +
      (S ? '<p class="rnote pj-jnote">From public map services, for a first look: confirm with the city, the county and a title company before relying on it.</p>' : '') + '</section>';
  }

  // ----- Options: the site plan options, each with its one-line summary and renderings -----
  function optionsHtml(p) {
    const can = !!siteFor(p);
    return '<section class="pj-sec pj-sec0"><div class="lt">Site plan options · ' + f0(p.plans.length) + '</div><div class="pj-plans">' + p.plans.map(pl => planTile(p, pl)).join('') +
        (can ? '<button type="button" class="pj-plan pj-add" data-add="1"><span class="pj-plus" aria-hidden="true">+</span><b>New Option</b><span class="pj-none">' + (p.plans.some(x => x.ring.length >= 3) || keptOf(p) ? 'A blank site: the same lot and street sides, nothing laid out' : 'A blank plan on ' + (p.parcels.length > 1 ? 'these parcels' : 'this parcel')) + '</span></button>'
          : p.parcels.length ? '<div class="pj-start"><b>No site outline</b><p>These parcels have no outline from the county. Click the corners of the site on the map.</p><div class="btnrow"><button type="button" class="btn" data-draw="1">Draw a Site</button></div></div>' : startHtml(p)) + '</div></section>' +
      (can ? '<div class="pj-foot"><span class="btnrow"><button type="button" class="btn" data-draw="1" title="Click the corners of a different site on the map">Draw a Different Site</button></span></div>' : '');
  }

  // ----- Renderings: every option's pictures, grouped by option. The pictures live on the device they were made on
  // (IndexedDB, see renderSrc); one a teammate made shows greyed, saying so. Click one for the full-size viewer.
  // Make renderings from here: pick the option, view, materials and light, and Render. The picture is taken from the
  // map's 3D massing, so the option opens on the map, renders there (progress in its panel) and comes back to this tab.
  const rsForm = new Map(); // per project: { plid, view }
  function rFormHtml(p) {
    const ready = p.plans.filter(laidOut); if (!ready.length) return '';
    const f = rsForm.get(p.id) || {}, pl = ready.find(x => x.id === f.plid) || ready[ready.length - 1], pr = rPrefs(), off = aiOff(), busy = !!ed?.rendering, T = RD.heroTarget(pl), v = f.view || 'corner', bg = bgRender.get(p.id);
    const opt = (list, cur) => list.map(x => '<option value="' + esc(x.id) + '"' + (x.id === cur ? ' selected' : '') + (x.tip ? ' title="' + esc(x.tip) + '"' : '') + '>' + esc(x.label) + '</option>').join('');
    const views = RD.VIEWS.filter(x => !x.hero).map(x => ({ id: x.id, label: x.label, tip: x.tip })).concat(T ? RD.VIEWS.filter(x => x.hero).map(x => ({ id: x.id, label: RD.renderLabel(x.id, T) })) : []).concat([{ id: 'all', label: 'All site views (four pictures)' }]);
    return '<section class="pj-box ps-form" aria-labelledby="rsH"><h3 class="pj-h3" id="rsH">Make renderings</h3>' +
      '<div class="ps-row2 rs-grid"><div class="ps-row"><label for="rsOpt">Option</label><select id="rsOpt">' + ready.map(x => '<option value="' + esc(x.id) + '"' + (x.id === pl.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' +
        '<div class="ps-row"><label for="rsView">View</label><select id="rsView">' + opt(views, views.some(x => x.id === v) ? v : 'corner') + '</select></div>' +
        '<div class="ps-row"><label for="rsLook">Materials</label><select id="rsLook">' + opt(RD.LOOKS, pr.look) + '</select></div>' +
        '<div class="ps-row"><label for="rsTime">Light</label><select id="rsTime">' + opt(RD.TIMES, pr.time) + '</select></div></div>' +
      '<p class="rnote">' + (off ? 'Renderings need the AI, which isn’t set up on this site.' : 'The picture is taken from the option’s 3D view behind the scenes and the AI paints it, about a minute a picture. You can stay here or use the rest of the app meanwhile.') + (budgetLine() ? ' ' + esc(budgetLine()) : '') + '</p>' +
      (bg ? '<p class="rnote loading" role="status">Rendering ' + (bg.i + 1) + ' of ' + bg.n + ' · ' + esc(bg.msg) + '</p>' : '') +
      '<div class="btnrow">' + (bg ? '<button type="button" class="btn" id="rsStop">Cancel</button>' : '<button type="button" class="btn primary" id="rsGo"' + (off || busy || rbUsed() ? ' disabled' : '') + '>' + (busy ? 'Rendering…' : 'Render') + '</button>') + '</div></section>';
  }
  function rendersHtml(p) {
    const ready = p.plans.filter(laidOut), groups = p.plans.filter(pl => pl.renders?.length || laidOut(pl));
    if (!rendersOf(p).length) return rFormHtml(p) + '<div class="pj-empty pj-rempty"><b>No renderings yet</b><p>A rendering is a photoreal picture of an option, painted by the AI from its 3D massing on the map: the buildings stay where the plan puts them, the materials and landscaping are the AI’s.</p>' +
      (ready.length ? '<p>Pick the option, view, materials and light above and press <b>Render</b>. Each picture takes about a minute, made behind the scenes while you carry on.</p>' : '') +
      (ready.length ? '' : (p.plans.length ? '<p>None of this project’s options has buildings yet: lay one out first.</p><div class="btnrow"><button type="button" class="btn" data-tabgo="options">Go to Options</button></div>'
        : siteFor(p) ? '<p>This project has no site plan options yet.</p><div class="btnrow"><button type="button" class="btn primary" data-add="1">New Option</button></div>'
        : '<p>This project has no site yet: add its parcel or draw it first.</p><div class="btnrow"><button type="button" class="btn primary" data-find="1">Find a Parcel</button><button type="button" class="btn" data-draw="1">Draw a Site</button></div>')) + '</div>'; // never a dead end
    return rFormHtml(p) + groups.map(pl => { const list = (pl.renders || []).slice().reverse(), sig = planSig(pl);
      return '<section class="pj-rg" aria-labelledby="pjRg-' + esc(pl.id) + '"><div class="pj-rgh"><h3 class="pj-h3" id="pjRg-' + esc(pl.id) + '">' + esc(pl.name) + ' <span class="pj-tn">' + (list.length ? plural(list.length, 'rendering') : 'none yet') + '</span></h3>' +
        '<span class="pj-rgl">' + (list.length ? '<button type="button" class="lnk pj-pdel" data-rdelall="' + esc(pl.id) + '" title="Delete every rendering of ' + esc(pl.name) + '">Delete all</button>' : '') + '</span></div>' +
        (list.length ? '<div class="pj-rgrid">' + list.map(r => { const stale = r.sig && r.sig !== sig, lab = rLabel(r);
          return '<figure class="pj-rth' + (stale ? ' stale' : '') + '" data-rid="' + esc(r.id) + '" data-pl="' + esc(pl.id) + '" tabindex="0" role="button" aria-label="' + esc(lab + ' rendering of ' + pl.name + ', ' + rWhen(r.at) + (stale ? ', the plan has changed since' : '')) + '">' +
            '<span class="pj-rimg"><img alt="" hidden><i>Loading…</i></span><figcaption>' + esc(lab) + '<span>' + esc(rWhen(r.at)) + (r.by ? ' · ' + esc(r.by) : '') + (stale ? ' · <em>plan changed since</em>' : '') + '</span></figcaption></figure>'; }).join('') + '</div>'
          : '<p class="rnote">No renderings of this option yet.</p>') + '</section>'; }).join('') +
      '<p class="rnote pj-rnote">AI concept illustrations, not designs: placement and heights follow the plan, the details are invented. The pictures are kept on the device they were made on; teammates see that they exist. Click one to see it full size, compare it with the massing, download or delete it.</p>' +
      '<div class="pj-foot"><span class="btnrow"><button type="button" class="btn ghost pj-pdel" data-rdelall="*">Delete All Renderings</button></span></div>';
  }
  function wireRenders(p) {
    const $ = q => root.querySelector(q), f = rsForm.get(p.id) || {}; rsForm.set(p.id, f);
    $('#rsOpt')?.addEventListener('change', e => { f.plid = e.target.value; render(true); });
    $('#rsView')?.addEventListener('change', e => { f.view = e.target.value; });
    $('#rsLook')?.addEventListener('change', e => { try { localStorage.setItem(RLOOK_KEY, e.target.value); } catch (er) {} });
    $('#rsTime')?.addEventListener('change', e => { try { localStorage.setItem(RTIME_KEY, e.target.value); } catch (er) {} });
    $('#rsGo')?.addEventListener('click', () => { const pr = rPrefs(), pl = p.plans.find(x => x.id === $('#rsOpt').value), v = $('#rsView').value || 'corner'; if (!pl) return;
      const hero = RD.byId(RD.VIEWS, v, null)?.hero; renderInBackground(p, pl, v === 'all' ? RD.SITE_VIEWS : [v], pr.look, pr.time, hero ? RD.heroTarget(pl) : null); });
    $('#rsStop')?.addEventListener('click', () => bgRender.get(p.id)?.abort.abort());
    root.querySelectorAll('.pj-rth').forEach(f => { const pl = p.plans.find(x => x.id === f.dataset.pl), r = pl?.renders?.find(x => x.id === f.dataset.rid); if (!r) return;
      renderSrc(r.id).then(u => { if (!f.isConnected) return; const img = f.querySelector('img'), ph = f.querySelector('.pj-rimg i');
        if (u) { img.src = u; img.alt = rLabel(r) + ' rendering'; img.hidden = false; ph?.remove(); }
        else { f.classList.add('gone'); ph.textContent = 'Not on this device' + (r.by && r.by !== get(NAME_KEY) ? ': ' + r.by + ' made it on theirs' : ': it was made on another one'); f.setAttribute('aria-disabled', 'true'); } });
      const go = () => { if (f.classList.contains('gone')) { ctx.toast('That picture isn’t on this device: renderings stay on the device they were made on.'); return; } openRender(p, pl, r, f); };
      f.onclick = go; f.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
  }
  // Render more: the option opens on the map with its panel at the Render section (the panel's section chip, as a click)
  function renderMore(p, pl) { open(p.id, pl.id); requestAnimationFrame(() => requestAnimationFrame(() => { if (PL()?.id === pl.id) jump('spRender'); })); }

  // ----- Plans: schematic design sets made from an option (lib/planset.mjs, lib/plandesign.mjs, api/planset.js) -----
  // Pick an option and the sections, then Make Plan Set. A set is a job of steps run in turn, shown as it goes:
  //   1. Claude writes the cover's notes and each discipline's notes and design criteria;
  //   2. Claude designs each building type's floor plans, checked here (PD.placeDesign) and sent back with the problems
  //      at most twice; a type that still fails, or any step without Claude, uses the rule-based design;
  //   3. every sheet is drawn here and printed on the title block by the server, three at a time;
  //   4. the pages are put together into one PDF here (pdf-lib), kept on this device and downloaded.
  // A big set (a hundred sheets, eight building types) can take most of an hour. Each finished step is saved on this
  // device (IndexedDB: the job, and each printed page), so a reload, a closed tab or Pause leaves it to Resume where it
  // stopped. The option keeps a short record of each issue (sheets, who, when, model), which syncs with the team.
  const psForm = new Map(); // per project: { plid, sections: Set, by, err }
  let psInfo = null, psInfoP = null; // api/planset GET: is Claude set up, the server's model and effort, this month's spend
  const loadPsInfo = (force) => { if (force) psInfoP = null; return psInfoP ||= fetch('api/planset').then(r => r.ok ? r.json() : null).catch(() => null).then(d => { psInfo = d || { error: true }; if (!d) setTimeout(() => { psInfoP = null; }, 6e4); /* asked again a minute later */ if (ctx.view === 'projects' && cur && tabFor(db.projects.find(x => x.id === cur) || {}) === 'plans') render(); return d; }); };
  const psModel = () => PS_PICK.model() || psInfo?.model || 'claude-opus-5-5', psEffort = () => PS_PICK.effort() || psInfo?.effort || 'medium';
  const setsOf = p => p.plans.flatMap(pl => (pl.sets || []).map(s => ({ pl, s })));
  const usd = v => '$' + (v >= 100 ? Math.round(v) : v.toFixed(2));
  const initials = n => String(n || '').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).join('').slice(0, 4);
  const dur = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  function psState(p) {
    let s = psForm.get(p.id); const ready = p.plans.filter(laidOut);
    if (!s) { s = { plid: ready[ready.length - 1]?.id || '', sections: new Set(PS.defaultSections()), err: '' }; psForm.set(p.id, s); }
    if (!ready.some(pl => pl.id === s.plid)) s.plid = ready[ready.length - 1]?.id || '';
    return s;
  }
  // the renderings a set can show: the newest that still match the plan, on this device (up to four)
  const setRenders = pl => (pl.renders || []).filter(r => !r.sig || r.sig === planSig(pl)).slice(-4);
  const typesOf = new Map(); // per plan signature: lib/plandesign.mjs buildingTypes (the form draws often)
  const typesFor = pl => { const k = pl.id + '|' + planSig(pl); if (!typesOf.has(k)) { typesOf.set(k, PD.buildingTypes(pl)); if (typesOf.size > 20) typesOf.delete(typesOf.keys().next().value); } return typesOf.get(k); };

  // ---- the job (one a project at a time), kept in IndexedDB as 'job:<project>' with its pages as 'jp:<job>:<sheet>' ----
  const jobs = new Map(); // project id -> job (in memory while it runs or after it was loaded)
  let jobLoaded = new Set(), jobTimer = 0;
  const saveJob = j => rput('job:' + j.pid, JSON.parse(JSON.stringify({ ...j, ctl: undefined, running: undefined }))).catch(() => {});
  async function loadJob(pid) { if (jobLoaded.has(pid)) return; jobLoaded.add(pid); const j = await rget('job:' + pid); if (j && !jobs.has(pid)) { jobs.set(pid, { ...j, running: false }); if (ctx.view === 'projects' && cur === pid) render(); } }
  const stepIcon = st => ({ todo: '○', doing: '◐', done: '●', failed: '✕', skipped: '–' }[st] || '○');
  function jobStats(j) {
    const steps = j.steps, by = k => steps.filter(s => s.kind === k), done = s => s.status === 'done' || s.status === 'skipped' || s.status === 'failed';
    const sheetsDone = by('sheet').filter(done), claudeDone = by('claude').filter(done), t = Date.now(), el = (j.elapsed || 0) + (j.running ? t - j.resumedAt : 0);
    const avg = (list, def) => { const ms = list.filter(s => s.ms).map(s => s.ms); return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : def; };
    const left = by('claude').length - claudeDone.length, sLeft = by('sheet').length - sheetsDone.length;
    const eta = left * avg(claudeDone, 90000) / 2 + sLeft * avg(sheetsDone, 8000) / 3 + (steps.find(s => s.kind === 'merge')?.status === 'done' ? 0 : 20000);
    const w = s => s.kind === 'claude' ? 10 : s.kind === 'merge' ? 4 : 1, total = steps.reduce((a, s) => a + w(s), 0), got = steps.filter(done).reduce((a, s) => a + w(s), 0);
    return { el, eta, pct: total ? got / total : 0, sheets: by('sheet').length, sheetsDone: sheetsDone.length, failed: steps.filter(s => s.status === 'failed').length };
  }
  function jobHtml(j) {
    const pl = db.projects.find(x => x.id === j.pid)?.plans.find(x => x.id === j.plid), S = jobStats(j), doing = j.steps.filter(s => s.status === 'doing');
    const groups = [['claude', 'Claude: notes and building designs'], ['sheet', 'Sheets'], ['merge', 'Putting the set together']];
    return '<section class="pj-box ps-job" id="psJob" aria-labelledby="psJobH" aria-busy="' + !!j.running + '"><h3 class="pj-h3" id="psJobH">' + (j.running ? 'Making the plan set' : j.state === 'done' ? 'Plan set finished' : 'Plan set paused') + ' · ' + esc(pl?.name || 'option') + ', issue ' + esc(j.no) + '</h3>' +
      '<div class="ps-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(S.pct * 100) + '"><i style="width:' + (S.pct * 100).toFixed(1) + '%"></i></div>' +
      '<div class="ps-stat"><b>' + Math.round(S.pct * 100) + '%</b><span>' + S.sheetsDone + ' of ' + S.sheets + ' sheets drawn</span><span>' + dur(S.el) + ' so far</span>' + (j.running ? '<span>about ' + dur(S.eta) + ' to go</span>' : '') + (S.failed ? '<span class="err">' + S.failed + ' failed</span>' : '') + '</div>' +
      (j.running ? '<div class="rnote loading" role="status">' + esc(doing.length ? doing.map(s => s.label + (s.note ? ' (' + s.note + ')' : '')).join(' · ') : 'Working…') + '</div>' : j.error ? '<p class="rnote err" role="alert">' + esc(j.error) + '</p>' : j.state !== 'done' ? '<p class="rnote">Stopped at ' + S.sheetsDone + ' of ' + S.sheets + ' sheets. Everything finished so far is kept on this device: <b>Resume</b> carries on from here.</p>' : '') +
      '<div class="btnrow">' + (j.running ? '<button type="button" class="btn" id="psPause">Pause</button>' : j.state !== 'done' ? '<button type="button" class="btn primary" id="psResume">Resume</button><button type="button" class="btn" id="psDiscard">Discard</button>' : '') + '</div>' +
      '<details class="ps-steps"' + (j.open ? ' open' : '') + '><summary>Every step (' + j.steps.length + ')</summary>' + groups.map(([k, label]) => { const list = j.steps.filter(s => s.kind === k); if (!list.length) return '';
        return '<div class="ps-sg"><b>' + label + '</b><ul>' + list.map(s => '<li class="st-' + s.status + '"><i aria-hidden="true">' + stepIcon(s.status) + '</i><span>' + esc(s.label) + '</span>' + (s.note ? '<em>' + esc(s.note) + '</em>' : '') + (s.ms ? '<small>' + Math.round(s.ms / 1000) + ' s</small>' : '') + '</li>').join('') + '</ul></div>'; }).join('') + '</details></section>';
  }
  // the job's panel and the tab's title, every second while it runs (the rest of the page isn't redrawn)
  function tickJob(p) {
    clearInterval(jobTimer); jobTimer = setInterval(() => {
      const j = jobs.get(p.id), el = root.querySelector('#psJob');
      if (j?.running) { const S = jobStats(j); document.title = '(' + S.sheetsDone + '/' + S.sheets + ') ' + (document.title.replace(/^\(\d+\/\d+\) /, '')); }
      if (!j?.running) { document.title = document.title.replace(/^\(\d+\/\d+\) /, ''); }
      if (el && j) { const open = el.querySelector('details')?.open; j.open = open; const t = document.createElement('div'); t.innerHTML = jobHtml(j); el.replaceWith(t.firstElementChild); wireJob(p); }
      if (!j?.running && !el) clearInterval(jobTimer);
    }, 1000);
  }

  function setsHtml(p) {
    const ready = p.plans.filter(laidOut);
    if (!psInfo && !psInfoP) loadPsInfo();
    loadJob(p.id);
    if (!ready.length) return '<div class="pj-empty"><b>No plan sets yet</b><p>A plan set is a schematic design drawing set made from one of this project’s site plan options, on the Finishes Solutions title block: cover and general notes, site and civil, landscape, floor plans, elevations, sections and schedules for each building type, structural, mechanical, plumbing, electrical, fire protection and life safety, and the renderings.</p>' +
      '<p>' + (p.plans.length ? 'None of this project’s options has buildings yet: lay one out first.' : 'This project has no site plan options yet.') + '</p><div class="btnrow"><button type="button" class="btn" data-tabgo="options">Go to Sites</button></div></div>';
    const s = psState(p), pl = ready.find(x => x.id === s.plid) || ready[0], nR = setRenders(pl).length, types = typesFor(pl), counts = PS.sectionCounts(pl, nR, types), I = psInfo, j = jobs.get(p.id);
    const busy = !!j && j.state !== 'done';
    const box = sec => { const none = sec.id === 'renderings' && !nR, on = (s.sections.has(sec.id) || sec.always) && !none, can = PS.built(sec) && !none, base = sec.needs && !s.sections.has(sec.needs), n = counts[sec.id];
      const why = none ? 'No renderings of this option on this device' : !can ? 'Coming in a later phase' : base ? 'Needs ' + PS.sectionById(sec.needs).label : '';
      return '<label class="ps-sec' + (can ? '' : ' off') + '"><input type="checkbox" data-pssec="' + sec.id + '"' + (on && can ? ' checked' : '') + (sec.always || !can || busy ? ' disabled' : '') + '>' +
        '<span><b>' + esc(sec.label) + '</b>' + (can && n ? '<em>' + plural(n, 'sheet') + '</em>' : '') + '<small>' + esc(why || sec.note || '') + '</small></span></label>'; };
    const sheets = PS.sheetList(pl, { sections: [...s.sections], renders: nR, types }), sup = types.filter(t => t.supported), later = types.filter(t => !t.supported);
    const discs = PS.pickSections([...s.sections]).filter(x => PS.SECTION_DISC[x] && sheets.some(q => q.section === x)).length, calls = 1 + discs + (s.sections.has('arch') ? sup.length * 1.4 : 0);
    const mins = Math.max(1, Math.round((calls * 90 / 2 + sheets.length * 8 / 3 + 20) / 60)), cost = 0.12 + discs * 0.12 + (s.sections.has('arch') ? sup.length * 0.55 : 0);
    const ai = !I ? 'Checking Claude…' : I.error ? 'Couldn’t check Claude just now: the set is made with Claude’s notes and designs if it answers.' : !I.configured ? 'Claude isn’t set up on this site (ANTHROPIC_API_KEY): the set uses rule-based building designs and standard notes.'
      : 'Claude: <b>' + esc(psModel()) + '</b> at ' + esc(psEffort()) + ' effort (Settings › AI model)' + (I.budget?.spent != null ? ' · this month ' + usd(I.budget.spent) + ' of ' + usd(I.budget.cap) : '') + '. About ' + usd(cost) + ' for this set.';
    const form = '<section class="pj-box ps-form" aria-labelledby="psH"><h3 class="pj-h3" id="psH">Make a plan set</h3>' +
      '<div class="ps-row"><label for="psOpt">Option</label><select id="psOpt"' + (busy ? ' disabled' : '') + '>' + ready.map(x => '<option value="' + esc(x.id) + '"' + (x.id === pl.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' +
      (types.length ? '<div class="ps-types"><b>Building types</b> ' + sup.map(t => '<span class="tag">' + esc(t.id) + '</span> ' + esc(t.label) + ' ' + t.W + '′ × ' + t.D + '′, ' + t.floors + ' fl · ' + t.count + (t.similar ? ' (incl. ' + t.similar + ' similar)' : '')).join(' &nbsp; ') +
        (later.length ? '<small>' + esc(later.map(t => t.label + ': ' + t.why).join('; ')) + ' (site sheets only).</small>' : '') + '</div>' : '') +
      '<fieldset class="ps-secs"><legend>Sections</legend>' + PS.SECTIONS.map(box).join('') + '</fieldset>' +
      '<div class="ps-row2"><div class="ps-row"><label for="psBy">Drawn by</label><input id="psBy" maxlength="12" autocomplete="off" value="' + esc(s.by ?? initials(get(NAME_KEY))) + '"' + (busy ? ' disabled' : '') + '></div>' +
        '<div class="ps-row"><label for="psNo">Project number</label><input id="psNo" maxlength="30" autocomplete="off" placeholder="Left blank" value="' + esc(p.projectNumber || '') + '"' + (busy ? ' disabled' : '') + '></div></div>' +
      '<p class="rnote"><b>' + plural(sheets.length, 'sheet') + '</b> on 24 × 36, about ' + dur(mins * 60000) + ' to make. ' + ai + ' You can leave this page while it works; keep the app open (or Resume later).</p>' +
      (s.err ? '<p class="rnote err" role="alert">' + esc(s.err) + '</p>' : '') +
      '<div class="btnrow"><button type="button" class="btn primary" id="psMake"' + (busy ? ' disabled title="A set is being made for this project: finish or discard it first"' : '') + '>Make Plan Set</button></div></section>';
    const made = setsOf(p).sort((a, b) => String(b.s.at).localeCompare(String(a.s.at)));
    const list = made.length ? '<section class="pj-sec"><div class="lt">Sets made · ' + made.length + '</div><div class="ps-list">' + made.map(({ pl: q, s: x }) => { const stale = x.sig && x.sig !== planSig(q);
      return '<div class="ps-item"><div><b>' + esc(q.name) + ' · Issue ' + esc(x.no) + '</b><span>' + esc(rWhen(x.at)) + (x.by ? ' · ' + esc(x.by) : '') + ' · ' + plural((x.sheets || []).length, 'sheet') + (x.model ? ' · Claude ' + esc(x.model) : x.noNotes ? ' · no Claude' : '') + (x.mins ? ' · made in ' + esc(dur(x.mins * 60000)) : '') + (stale ? ' · <em>plan changed since</em>' : '') + '</span>' +
        '<small>' + esc((x.sheets || []).join(', ')) + '</small></div><span class="btnrow"><button type="button" class="btn" data-psget="' + esc(q.id) + '|' + esc(x.id) + '">Download PDF</button><button type="button" class="lnk pj-pdel" data-psdel="' + esc(q.id) + '|' + esc(x.id) + '">Delete</button></span></div>'; }).join('') + '</div></section>' : '';
    return (j ? jobHtml(j) : '') + form + list + '<p class="rnote pj-rnote">Every sheet says “Preliminary — not for construction, bidding or permit”: schematic drawings for feasibility, pricing and coordination, made with AI assistance and rule-based engineering layouts, reviewed but not sealed. The PDF is kept on the device it was made on; teammates see that the set exists.</p>';
  }
  function wireJob(p) {
    const $ = q => root.querySelector(q), j = jobs.get(p.id); if (!j) return;
    $('#psPause')?.addEventListener('click', () => { j.ctl?.abort(); });
    $('#psResume')?.addEventListener('click', () => runJob(p, j));
    $('#psDiscard')?.addEventListener('click', async () => { if (!confirm('Discard this unfinished plan set? The sheets made so far go too.')) return; for (const s of j.steps) if (s.kind === 'sheet') rdel('jp:' + j.id + ':' + s.key); rdel('job:' + p.id); jobs.delete(p.id); render(true); });
    const d = root.querySelector('#psJob details'); if (d) d.ontoggle = () => { j.open = d.open; };
  }
  function wirePlans(p) {
    const s = psState(p), $ = q => root.querySelector(q);
    $('#psOpt')?.addEventListener('change', e => { s.plid = e.target.value; render(true); });
    root.querySelectorAll('[data-pssec]').forEach(b => b.onchange = () => { const id = b.dataset.pssec; if (b.checked) s.sections.add(id); else { s.sections.delete(id); for (const x of PS.SECTIONS) if (x.needs === id) s.sections.delete(x.id); } render(true); });
    const by = $('#psBy'); if (by) by.onchange = () => { s.by = by.value.trim().slice(0, 12); };
    const no = $('#psNo'); if (no) no.onchange = () => { const v = no.value.trim().slice(0, 30); if (v !== (p.projectNumber || '')) { p.projectNumber = v; save(p); } };
    $('#psMake')?.addEventListener('click', () => { if (by) s.by = by.value.trim().slice(0, 12); startJob(p); });
    wireJob(p); if (jobs.get(p.id)?.running) tickJob(p);
    const find = v => { const [a, b] = v.split('|'), q = p.plans.find(x => x.id === a); return { q, x: q?.sets?.find(y => y.id === b) }; };
    root.querySelectorAll('[data-psget]').forEach(b => b.onclick = async () => { const { q, x } = find(b.dataset.psget); if (!x) return;
      const blob = await rget('set:' + x.id); if (!(blob instanceof Blob)) { ctx.toast('That set’s PDF isn’t on this device: sets stay on the device they were made on' + (x.by ? ' (' + x.by + ' made it)' : '') + '. Make it again here.'); return; }
      ctx.saveFile(fileName(p, q) + '-plan-set-issue-' + x.no + '.pdf', blob, 'application/pdf'); });
    root.querySelectorAll('[data-psdel]').forEach(b => b.onclick = () => { const { q, x } = find(b.dataset.psdel); if (!x || !confirm('Delete issue ' + x.no + ' of ' + q.name + '’s plan set?')) return;
      q.sets = q.sets.filter(y => y.id !== x.id); rdel('set:' + x.id); save(p); });
  }
  window.addEventListener('beforeunload', e => { if ([...jobs.values()].some(j => j.running)) { e.preventDefault(); e.returnValue = ''; } }); // a set is being made: the browser asks first (Resume picks it up anyway)

  // a new job: the inputs gathered once (site facts, parcels, the vicinity map) and the list of steps
  async function startJob(p) {
    const s = psState(p), pl = p.plans.find(x => x.id === s.plid); if (!pl || (jobs.get(p.id) && jobs.get(p.id).state !== 'done')) return;
    s.err = ''; ctx.toast('Starting the plan set: gathering the site facts…');
    const keys = pl.parcels || (pl.parcel ? [pl.parcel] : []), parcels = keys.map(k => p.parcels.find(x => x.key === k)).filter(Boolean), F = SP.frame(pl.origin);
    const site = { type: 'Polygon', coordinates: [pl.ring.concat([pl.ring[0]]).map(F.toLL)] };
    let vicinity = ''; try { vicinity = areaMap([{ geometry: site, stroke: '#c0392b', fill: 'rgba(192,57,43,.25)', width: 2 }], { W: 400, H: 230, px: 400, minSpanM: 3500, maxTiles: 16 }); } catch (e) { /* no map */ }
    const facts = await siteFacts(pl).catch(() => []), county = (ctx.DATA?.counties || []).find(c => (c.outline || []).some(poly => SP.inRing(F.toLL(SP.centroid(pl.ring)), poly[0])))?.name;
    const types = PD.buildingTypes(pl), sections = PS.pickSections([...s.sections].filter(x => x !== 'renderings' || setRenders(pl).length)), nR = sections.includes('renderings') ? setRenders(pl).length : 0;
    const sheets = PS.sheetList(pl, { sections, renders: nR, types, renderLabels: setRenders(pl).slice().reverse().map(r => RD.renderLabel(r.view, r.target)) });
    const prev = (pl.sets || []), no = String(prev.length ? Math.max(...prev.map(x => +x.no || 0)) + 1 : 0), day = new Date(), short = d => new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    const revisions = prev.slice().sort((a, b) => (+a.no) - (+b.no)).map(x => ({ no: x.no, date: short(x.at), desc: x.desc || 'Schematic design set' })).concat([{ no, date: short(day), desc: no === '0' ? 'Schematic design set' : 'Schematic design set, re-issued' }]);
    const steps = [{ key: 'notes', kind: 'claude', label: 'Cover notes' }];
    for (const sec of sections) if (PS.SECTION_DISC[sec] && sheets.some(q => q.section === sec)) steps.push({ key: 'disc:' + PS.SECTION_DISC[sec], kind: 'claude', label: PS.sectionById(sec).label + ' notes' });
    if (sections.includes('arch')) for (const t of types.filter(t => t.supported)) steps.push({ key: 'design:' + t.id, kind: 'claude', label: 'Design: ' + PD.typeName(t) });
    for (const sh of sheets) steps.push({ key: sh.number, kind: 'sheet', label: sh.number + ' ' + sh.title });
    steps.push({ key: 'merge', kind: 'merge', label: 'Put ' + sheets.length + ' sheets together' });
    for (const x of steps) x.status = 'todo';
    const j = { id: uid(), pid: p.id, plid: pl.id, no, sig: planSig(pl), sections, bare: true, by: s.by ?? initials(get(NAME_KEY)), madeBy: get(NAME_KEY) || '', projectNumber: p.projectNumber || '', at: day.toISOString(), date: day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      revisions, types, sheets, steps, designs: {}, designBy: {}, disc: {}, text: null, model: '', base: { client: p.client || '', address: parcels[0]?.label || '', county: county ? county + ' County, Texas' : '', parcels, facts, notes: SP.check(pl).map(i => i.text), vicinity,
        boundarySource: pl.src === 'drawn' ? 'a boundary drawn on the map' : pl.src === 'regrid' ? 'the Regrid parcel outline' : (keys.length > 1 ? keys.length + ' county appraisal district parcel outlines, merged' : 'the county appraisal district parcel outline') }, elapsed: 0, state: 'paused', open: false };
    jobs.set(p.id, j); await saveJob(j); runJob(p, j);
  }
  // a small pool: run fn over items, n at a time, stopping when the signal aborts
  async function pool(items, n, fn, signal) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length && !signal.aborted) await fn(items[i++]); })); }
  async function claudeCall(body, signal) {
    const r = await fetch('api/planset', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, model: PS_PICK.model(), effort: PS_PICK.effort() }) });
    const d = await r.json().catch(() => ({})); if (psInfo && d.budget) psInfo.budget = d.budget;
    if (!r.ok) throw Object.assign(new Error(d.error || 'HTTP ' + r.status), { status: r.status });
    return d;
  }
  // run (or resume) a job's remaining steps; Pause aborts and keeps what's done
  async function runJob(p, j) {
    if (j.running) return; const ctl = new AbortController(); j.ctl = ctl; j.running = true; j.state = 'running'; j.error = ''; j.resumedAt = Date.now();
    const P1 = () => db.projects.find(x => x.id === p.id) || p, pl = P1().plans.find(x => x.id === j.plid);
    if (!pl) { j.running = false; j.error = 'That option was deleted.'; render(true); return; }
    render(true); tickJob(p);
    const st = key => j.steps.find(x => x.key === key), mark = async (x, status, note) => { x.status = status; if (note != null) x.note = note; await saveJob(j); };
    let claudeOff = '';
    try {
      const info = psInfo?.configured ? psInfo : await loadPsInfo(true); if (!info?.configured) claudeOff = info ? 'Claude isn’t set up' : 'the server didn’t answer';
      const base = { plan: pl, project: P1(), ...j.base, types: j.types }, brief = PS.notesBrief({ ...base, sheets: j.sheets });
      const ask = async (x, body, keep) => { // one Claude step: done, or skipped with the reason (the sheets use their defaults)
        if (x.status === 'done' || x.status === 'skipped') return; if (claudeOff) { await mark(x, 'skipped', claudeOff); return; }
        x.status = 'doing'; x.note = ''; const t0 = Date.now();
        try { const d = await claudeCall(body, ctl.signal); keep(d); j.model = d.model || j.model; x.ms = Date.now() - t0; await mark(x, 'done', d.fellBack ? 'answered by a fallback model' : ''); }
        catch (e) { if (ctl.signal.aborted) { x.status = 'todo'; throw e; } x.ms = Date.now() - t0; if (e.status === 402 || e.status === 503) claudeOff = e.status === 402 ? 'this month’s budget is used up' : 'Claude isn’t set up'; await mark(x, 'skipped', e.status === 402 || e.status === 503 ? claudeOff : 'no answer: ' + e.message.slice(0, 80)); }
      };
      // 1. notes: the cover, then each discipline (three at a time)
      await ask(st('notes'), { mode: 'notes', brief }, d => { j.text = d.notes; });
      await pool(j.steps.filter(x => x.key.startsWith('disc:')), 3, x => { const k = x.key.slice(5); return ask(x, { mode: 'disc', discipline: k, brief: PS.discBrief({ ...base, sheets: j.sheets }, k, j.types) }, d => { j.disc[k] = d.disc; }); }, ctl.signal);
      // 2. a design per building type (two at a time): Claude's, checked and fixed, else the rule-based one
      await pool(j.steps.filter(x => x.key.startsWith('design:')), 2, async x => {
        const t = j.types.find(y => y.id === x.key.slice(7)); if (!t || x.status === 'done' || x.status === 'skipped') return;
        const seed = PD.fallbackDesign(t), fallback = why => { j.designs[t.id] = PD.placeDesign(seed, t).design; j.designBy[t.id] = 'rule-based (' + why + ')'; };
        if (claudeOff) { fallback(claudeOff); await mark(x, 'skipped', 'rule-based design: ' + claudeOff); return; }
        x.status = 'doing'; const t0 = Date.now(); let prev = null, problems = [], ok = false, tries = 0;
        try {
          const brief2 = PD.designBrief(t, { county: j.base.county, address: j.base.address });
          for (; tries < 3 && !ok; tries++) {
            x.note = tries ? 'fixing ' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ', try ' + (tries + 1) : 'Claude is drawing it';
            const d = await claudeCall({ mode: 'design', type: t.id, brief: brief2, seed, previous: prev, problems }, ctl.signal); j.model = d.model || j.model;
            const r = PD.placeDesign(d.design, t); if (!r.problems.length) { j.designs[t.id] = r.design; j.designBy[t.id] = 'Claude'; ok = true; } else { prev = d.design; problems = r.problems; }
          }
          if (!ok) fallback('Claude’s plan kept failing ' + problems.length + ' check' + (problems.length === 1 ? '' : 's'));
          x.ms = Date.now() - t0; await mark(x, ok ? 'done' : 'skipped', ok ? (tries > 1 ? 'fixed in ' + tries + ' tries' : '') : 'rule-based design used: ' + problems[0]);
        } catch (e) { if (ctl.signal.aborted) { x.status = 'todo'; x.note = ''; throw e; } if (e.status === 402 || e.status === 503) claudeOff = e.status === 402 ? 'this month’s budget is used up' : 'Claude isn’t set up';
          fallback(claudeOff || 'no answer'); x.ms = Date.now() - t0; await mark(x, 'skipped', 'rule-based design: ' + (claudeOff || e.message.slice(0, 80))); }
      }, ctl.signal);
      for (const t of j.types.filter(t => t.supported)) if (!j.designs[t.id]) { j.designs[t.id] = PD.placeDesign(PD.fallbackDesign(t), t).design; j.designBy[t.id] = 'rule-based'; }
      await saveJob(j);
      // 3. the sheets, drawn here and printed on the title block, three at a time (a failure is tried again twice)
      const renders = j.sheets.some(sh => sh.kind === 'render') ? await rendersForSheet(pl, 4).catch(() => []) : [];
      const terrain = await Promise.race([terrainOf(pl), new Promise(res => setTimeout(() => res(null), 30000))]);
      const c = PS.setContext({ ...base, project: P1(), text: j.text, disc: j.disc, designs: j.designs, designBy: j.designBy, renders, date: j.date, drawnBy: j.by, projectNumber: j.projectNumber, revisions: j.revisions, terrain }, j.sheets);
      await pool(j.steps.filter(x => x.kind === 'sheet' && x.status !== 'done'), 3, async x => {
        const sh = j.sheets.find(y => y.number === x.key); x.status = 'doing'; x.note = ''; const t0 = Date.now(); let last = '';
        for (let k = 0; k < 3; k++) {
          try {
            const r = await fetch('api/planset', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'sheet', bare: !!j.bare, html: PS.docHTML(c, PS.sheetPage(c, sh)), title: P1().name + ' — ' + sh.number }) });
            if (r.ok && /pdf/.test(r.headers.get('content-type') || '')) { await rput('jp:' + j.id + ':' + x.key, await r.blob()); x.ms = Date.now() - t0; await mark(x, 'done', ''); return; }
            last = (await r.json().catch(() => ({}))).error || 'HTTP ' + r.status; if (r.status === 429) await new Promise(res => setTimeout(res, 15000));
          } catch (e) { if (ctl.signal.aborted) { x.status = 'todo'; throw e; } last = e.message; }
          x.note = 'trying again'; await new Promise(res => setTimeout(res, 3000));
        }
        x.ms = Date.now() - t0; await mark(x, 'failed', last.slice(0, 120));
      }, ctl.signal);
      if (ctl.signal.aborted) throw new DOMException('paused', 'AbortError');
      // 4. one PDF, in sheet order
      const m = st('merge'); m.status = 'doing'; const t0 = Date.now();
      const { PDFDocument } = await import('./lib/vendor/pdf-lib.esm.min.js'), out = await PDFDocument.create(), made = [];
      // bare sheets (jobs started since Oct 19) go on one copy of the border, shared by every page
      let bd = null; if (j.bare) { const r = await fetch('api/planset?border=1'); if (!r.ok) throw new Error('the title block border didn’t load (HTTP ' + r.status + ')'); [bd] = await out.embedPdf(await r.arrayBuffer(), [0]); }
      for (const sh of j.sheets) { const b = await rget('jp:' + j.id + ':' + sh.number); if (!(b instanceof Blob)) continue; const bytes = await b.arrayBuffer();
        if (bd) { const src = await PDFDocument.load(bytes); for (const pg of await out.embedPdf(src, src.getPageIndices())) { const w = pg.width, h = pg.height, page = out.addPage([w, h]); page.drawPage(bd, { x: 0, y: 0, width: w, height: h }); page.drawPage(pg, { x: 0, y: 0, width: w, height: h }); } }
        else { const src = await PDFDocument.load(bytes); for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg); }
        made.push(sh.number); }
      out.setTitle(P1().name + ' — ' + pl.name + ' — Schematic design set, issue ' + j.no); out.setCreator('Finishes Solutions'); out.setProducer('Finishes Solutions plan sets');
      const blob = new Blob([await out.save()], { type: 'application/pdf' }), id = uid(); await rput('set:' + id, blob); m.ms = Date.now() - t0; m.status = 'done';
      const q = P1().plans.find(x => x.id === pl.id) || pl, mins = Math.round(((j.elapsed || 0) + Date.now() - j.resumedAt) / 60000);
      q.sets = (q.sets || []).concat([{ id, no: j.no, at: j.at, by: j.madeBy, sheets: made, sections: j.sections, model: j.model, noNotes: !j.text || undefined, sig: j.sig, desc: j.revisions[j.revisions.length - 1].desc, mins, designs: { ...j.designBy } }]);
      while (q.sets.length > 12) rdel('set:' + q.sets.shift().id);
      for (const sh of j.sheets) rdel('jp:' + j.id + ':' + sh.number); rdel('job:' + p.id);
      j.running = false; j.state = 'done'; j.elapsed = (j.elapsed || 0) + Date.now() - j.resumedAt; save(P1());
      const failed = j.steps.filter(x => x.status === 'failed').length;
      await ctx.saveFile(fileName(P1(), pl) + '-plan-set-issue-' + j.no + '.pdf', blob, 'application/pdf');
      ctx.toast('Plan set issue ' + j.no + ' of ' + pl.name + ' is ready: ' + plural(made.length, 'sheet') + ' in ' + dur(j.elapsed) + '.' + (failed ? ' ' + plural(failed, 'sheet') + ' couldn’t be printed and ' + (failed === 1 ? 'is' : 'are') + ' left out.' : ''));
      setTimeout(() => { if (jobs.get(p.id) === j) { jobs.delete(p.id); if (ctx.view === 'projects' && cur === p.id) render(); } }, 20000); // the finished panel stays a moment
    } catch (e) {
      j.running = false; j.elapsed = (j.elapsed || 0) + Date.now() - j.resumedAt;
      for (const x of j.steps) if (x.status === 'doing') { x.status = 'todo'; x.note = ''; }
      j.state = 'paused'; if (!(e?.name === 'AbortError' || ctl.signal.aborted)) j.error = 'Stopped: ' + (e.message || 'something went wrong') + '. Resume to carry on.';
      await saveJob(j); if (ctl.signal.aborted) ctx.toast('Plan set paused. Resume carries on where it stopped.');
    } finally { document.title = document.title.replace(/^\(\d+\/\d+\) /, ''); if (ctx.view === 'projects' && cur === p.id) render(true); }
  }

  // ----- Ask: questions about the whole project, answered from its facts (lib/project.mjs projectFacts) -----
  const pAskLog = p => { let A = pasks.get(p.id); if (!A) pasks.set(p.id, A = { turns: [], draft: '' }); return A; };
  function pAskHtml(p) {
    const A = pAskLog(p), off = aiOff(), busy = !!A.busy, last = A.turns[A.turns.length - 1];
    const turns = A.turns.map(t => '<div class="sp-qa"><div class="sp-q">' + esc(t.q) + '</div><div class="sp-a">' + (t.a ? answerHtml(t.a) : t.err ? '<p class="sp-aerr">' + esc(t.err) + '</p>' : '<span class="ai-work" role="status"><span class="ai-wl">Thinking</span></span>') + '</div></div>').join('');
    const chips = busy ? [] : A.turns.length ? last?.followups || [] : PJ.ASK_STARTERS;
    return '<section class="pj-box sp-ai pj-ask" id="pjAskSec"><div class="sp-ai-h"><label class="pj-h3" for="pjQ">Ask about this project</label>' + (A.turns.length ? '<button type="button" class="sp-link" id="pjQClear"' + (busy ? ' disabled' : '') + ' title="Forget these questions and answers">Clear</button>' : '') + '</div>' +
      (A.turns.length ? '<div class="sp-convo" id="pjConvo" role="log" aria-live="polite" aria-label="Questions and answers about this project">' + turns + '</div>'
        : '<div class="rnote">Which option fits, what approvals the site needs, what to check before going under contract: the AI answers from this project’s own facts (its parcels and notes, the site’s jurisdiction, every option’s numbers) and says when something isn’t in them.</div>') +
      (chips.length && !off ? '<div class="sp-sugs sp-qsugs" role="group" aria-label="' + (A.turns.length ? 'Ask next' : 'Questions to try') + '">' + chips.map(q => '<button type="button" class="chip" data-askq="' + esc(q) + '" title="Ask this">' + esc(q) + '</button>').join('') + '</div>' : '') +
      '<textarea id="pjQ" rows="2" placeholder="' + (A.turns.length ? 'Ask a follow-up…' : 'e.g. which option has the best yield?') + '"' + (off ? ' disabled' : '') + '>' + esc(A.draft || '') + '</textarea>' +
      '<div class="sp-go2"><button type="button" class="btn primary askai' + (busy ? ' busy' : '') + '" id="pjQGo"' + (off || busy ? ' disabled' : '') + (busy ? ' aria-busy="true"' : '') + (off ? ' title="AI isn’t set up on this site"' : '') + '>' + (busy ? 'Answering…' : 'Ask') + '</button><span class="rnote pj-kbhint">Enter asks; Shift+Enter for a new line.</span></div>' +
      (off ? '<div class="rnote sp-aioff">AI isn’t set up on this site</div>' : '') + '</section>';
  }
  function wirePAsk(p) {
    const sec = root.querySelector('#pjAskSec'); if (!sec) return; const A = pAskLog(p), ta = sec.querySelector('#pjQ');
    if (ta) { ta.oninput = () => { A.draft = ta.value; }; ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askProject(p); } }; }
    const go = sec.querySelector('#pjQGo'); if (go) go.onclick = () => askProject(p);
    sec.querySelectorAll('[data-askq]').forEach(b => b.onclick = () => askProject(p, b.dataset.askq));
    const cl = sec.querySelector('#pjQClear'); if (cl) cl.onclick = () => { A.turns = []; paintPAsk(p); root.querySelector('#pjQ')?.focus({ preventScroll: true }); };
    const c = sec.querySelector('#pjConvo'); if (c) c.scrollTop = c.scrollHeight; // the latest turn in view
  }
  // just the Ask section and its tab again (the rest of the page stays as it is)
  function paintPAsk(p) {
    if (ctx.view !== 'projects' || cur !== p.id) return;
    const tb = root.querySelector('.pj-tabs'); if (tb) { const t = document.createElement('div'), had = document.activeElement?.closest?.('.pj-tabs') ? document.activeElement.id : ''; t.innerHTML = tabsHtml(p, tabFor(p)); tb.replaceWith(t.firstElementChild); wireTabs(p); if (had) root.querySelector('#' + had)?.focus(); }
    const el = root.querySelector('#pjAskSec'); if (!el) return;
    const typing = document.activeElement?.id === 'pjQ', t = document.createElement('div'); t.innerHTML = pAskHtml(p); el.replaceWith(t.firstElementChild); wirePAsk(p);
    if (typing) root.querySelector('#pjQ')?.focus({ preventScroll: true });
    root.querySelector('#pjAskSec .sp-qa:last-child')?.scrollIntoView({ block: 'nearest' });
  }
  // the fact sheet: the project, the site's jurisdiction (looked up now if it hasn't been, for up to 8 seconds) and each
  // option's numbers (lib/planask.mjs planFacts, cut down to its headline numbers by lib/project.mjs)
  async function projectSheet(p) {
    const at = siteSpot(p); if (at && (!p.site || p.site.key !== at.key)) await race(gatherSite(p), 8000).catch(() => null);
    const options = p.plans.map(pl => { const drawn = pl.ring.length >= 3; if (!drawn) return { name: pl.name, drawn: false };
      let pf = null, F = { option: pl.name }; try { pf = pfRun(p, pl); } catch (e) { pf = null; } try { F = ASK.planFacts(pl, { site: siteInfo(p, pl), pf, project: p.name }); } catch (e) { /* the name only */ }
      return { facts: F, name: pl.name, renderings: (pl.renders || []).length, drawn }; });
    const regrid = PJ.regridFacts(p.parcels, p.plans);
    return PJ.projectFacts(p, { acres: acresOf(p), jurisdiction: factsOf(p) || (Object.keys(regrid).length ? regrid : null), checkedAt: p.site?.at, options });
  }
  async function askProject(p, qIn) {
    const A = pAskLog(p), q = String(qIn ?? A.draft ?? '').trim();
    if (!q) { ctx.toast('Ask a question about this project, e.g. “which option fits best?”'); root.querySelector('#pjQ')?.focus(); return; }
    if (A.busy) return; if (aiOff()) { ctx.toast('AI isn’t set up on this site.'); return; }
    const turn = { q }; A.turns.push(turn); A.turns = A.turns.slice(-6); if (qIn == null) A.draft = ''; A.busy = true; paintPAsk(p);
    try {
      const project = await projectSheet(p), history = A.turns.filter(t => t !== turn && t.a).slice(-4).map(t => ({ q: t.q, a: t.a }));
      const rf = RF.refsForAI(p.files), d = await post({ mode: 'askProject', question: q, history, project, effort: ASK.effortOf(effortNow()).effort, ...(rf.length ? { refs: rf } : {}) }); // (with the facts confirmed from its reference files)
      turn.a = d.answer || 'No answer came back. Try asking another way.'; turn.followups = d.followups || [];
    } catch (e) { turn.err = e.status === 503 ? 'AI isn’t set up on this site.' : e.status === 429 ? 'Too many questions at once: try again in a minute.' : 'The AI didn’t answer just now. Try again in a moment.'; }
    A.busy = false; paintPAsk(p);
  }

  // now: the person asked for this redraw (a click, a sort); otherwise (a save or a sync) it waits while they type
  function render(now) {
    if (!root) return;
    const a = document.activeElement;
    if (now !== true && a && root.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.tagName === 'SELECT')) { waiting = true; return; } // redraw once they leave the field
    waiting = false;
    const key = a && root.contains(a) ? (a.id ? '#' + a.id : ['open', 'plan', 'v', 'parcel', 'rid', 'copy', 'rmore'].map(k => a.dataset[k] != null ? '[data-' + k + '="' + CSS.escape(a.dataset[k]) + '"]' : '').find(Boolean) || (a.classList[0] ? '.' + a.classList[0] : null)) : null;
    const p = cur && db.projects.find(x => x.id === cur); if (!p) { cur = null; renaming = false; }
    root.innerHTML = '<div class="pj-wrap">' + (p ? detailHtml(p) : indexHtml()) + '</div>'; ctx.scheduleHash?.(); // the open project (pj=) and its tab (pt=) go in the address, so a reload comes back to them
    ctx.team?.chip?.(root.querySelector('#pjTeam')); // who you are and whether projects are shared; opens Settings
    wire(p);
    if (key) try { root.querySelector(key)?.focus(); } catch (e) { /* the control is gone */ }
  }
  // the project page is in the address (#pj=<id>): opening one adds a history entry, so Back returns to the list (src/app.js)
  const pjMoved = was => { if (was !== cur) ctx.scheduleHash?.(ctx.view === 'projects' ? { push: true } : undefined); };
  function show(id, tab) { const was = cur; cur = id; renaming = false; adding = false; if (id && tab) ptab.set(id, PJ.tabOf(tab)); render(true); root.scrollTop = 0; pjMoved(was); }
  ctx.currentProject = () => ctx.view === 'projects' ? cur : null;
  ctx.openProject = (id, tab) => { if (ctx.view !== 'projects') ctx.setView('projects'); if (!id || db.projects.some(x => x.id === id)) show(id || null, tab); };
  function setTab(p, id, focus) { ptab.set(p.id, PJ.tabOf(id)); render(true); if (focus) root.querySelector('#pjTab-' + PJ.tabOf(id))?.focus(); }
  // the tabs: a click, or the arrow keys, Home and End along the row (the tab follows the focus)
  function wireTabs(p) {
    const tl = root.querySelector('.pj-tabs'); if (!tl) return;
    tl.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (b.dataset.tab !== tabFor(p)) setTab(p, b.dataset.tab, true); });
    tl.onkeydown = e => { const ids = PJ.TABS.map(t => t.id), i = ids.indexOf(tabFor(p)), to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key]; if (to == null) return;
      e.preventDefault(); setTab(p, ids[(to + ids.length) % ids.length], true); };
    // a fade on the right edge while the strip can scroll further (phones), and the open tab scrolled into view
    const fade = () => tl.classList.toggle('more', tl.scrollLeft + tl.clientWidth < tl.scrollWidth - 2);
    const on1 = tl.querySelector('[aria-selected="true"]'); if (on1 && tl.scrollWidth > tl.clientWidth) tl.scrollLeft = Math.max(0, on1.offsetLeft + on1.offsetWidth / 2 - tl.clientWidth / 2);
    tl.onscroll = fade; fade(); requestAnimationFrame(fade);
  }
  function wire(p) {
    const $ = s => root.querySelector(s), on = (s, f) => root.querySelectorAll(s).forEach(b => b.addEventListener('click', f));
    const grow = el => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };
    if (!p) {
      const newOne = () => { adding = true; render(true); $('#pjNm')?.focus(); };
      on('#pjNew', newOne); on('[data-new]', newOne);
      on('[data-go="map"]', () => ctx.setView('map'));
      on('[data-clear]', () => { pq = ''; render(true); });
      const form = $('#pjForm');
      if (form) {
        form.onsubmit = e => { e.preventDefault(); const name = $('#pjNm').value.trim(); if (!name) { $('#pjNm').focus(); return; }
          const np = { id: uid(), name, notes: '', parcels: [], plans: [], created: new Date().toISOString(), by: get(NAME_KEY) };
          db.projects.push(np); adding = false; pq = ''; document.activeElement?.blur(); const was = cur; cur = np.id; save(np); root.scrollTop = 0; pjMoved(was); };
        $('#pjCancel').onclick = () => { adding = false; render(true); };
        form.onkeydown = e => { if (e.key === 'Escape') $('#pjCancel').click(); };
      }
      const qi = $('#pjQ'); if (qi) qi.oninput = () => { pq = qi.value; $('#pjList').innerHTML = listHtml(); wireList(); };
      const so = $('#pjSort'); if (so) so.onchange = () => { psort = so.value; render(true); };
      on('[data-v]', e => { mode = e.currentTarget.dataset.v; try { localStorage.setItem(VIEW_KEY, mode); } catch (er) { /* kept for this visit */ } render(true); });
      const wireList = () => { root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => show(b.dataset.open)); root.querySelector('[data-clear]')?.addEventListener('click', () => { pq = ''; render(true); }); };
      wireList();
      return;
    }
    const tab = tabFor(p), planOf2 = id => p.plans.find(x => x.id === id);
    on('[data-back]', () => show(null));
    on('#pjRename', () => { renaming = true; render(true); const r = $('#pjRen'); if (r) { grow(r); r.focus(); r.select(); } });
    const rf = $('#pjRenForm');
    if (rf) {
      const r = $('#pjRen'); grow(r); r.oninput = () => grow(r);
      rf.onsubmit = e => { e.preventDefault(); const v = r.value.replace(/\s+/g, ' ').trim(); renaming = false; document.activeElement?.blur(); if (v && v !== p.name) { p.name = v; save(p); } render(true); };
      r.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); rf.requestSubmit(); } else if (e.key === 'Escape') $('#pjRenX').click(); };
      $('#pjRenX').onclick = () => { renaming = false; render(true); };
    }
    const st = $('#pjStatus'); if (st) st.onchange = () => { p.status = st.value; st.parentElement.dataset.st = st.value; save(p); };
    wireTabs(p);
    // the fields save when you leave them (Enter in a one-line field leaves it), like the notes always have
    const keep = (id, k, n) => { const el = $(id); if (!el) return; el.onchange = () => { const v = el.value.slice(0, n); if (v !== (p[k] || '')) { p[k] = v; save(p); } }; if (el.tagName === 'INPUT') el.onkeydown = e => { if (e.key === 'Enter') el.blur(); }; };
    keep('#pjClient', 'client', 120); keep('#pjUse', 'use', 160); keep('#pjNotes', 'notes', 8000);
    const nt = $('#pjNotes'); if (nt) nt.oninput = () => { if (nt.scrollHeight > nt.clientHeight + 2) grow(nt); };
    root.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { const pl = planOf2(b.dataset.plan), none = pl && pl.ring.length < 3; open(p.id, b.dataset.plan, { draw: none }); });
    root.querySelectorAll('[data-parcel]').forEach(b => b.onclick = () => { const x = p.parcels.find(y => y.key === b.dataset.parcel); ctx.setView('map'); map.easeTo({ center: x.center, zoom: Math.max(map.getZoom(), 17) }); ctx.openBuildingAt(x.center); });
    on('[data-add]', () => addOption(p));
    on('[data-draw]', () => drawSite(p));
    on('[data-find]', () => { pending = { id: p.id, t: Date.now() }; ctx.setView('map'); ctx.toast('Zoom in and click the parcel, then Site plan at the top of its card: it goes into ' + p.name + '.'); });
    // an option copied stays on the page (its layouts come along, its renderings don't: the pictures belong to the original)
    root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { const pl = planOf2(b.dataset.copy); if (!pl) return;
      const c = { ...clone(pl), id: uid(), name: nextName(p), created: new Date().toISOString() }; delete c.renders; if (c.lastRun) c.lastRun = { ...c.lastRun, ask: '' };
      p.plans.push(c); save(p); ctx.toast('Copied ' + pl.name + ' as ' + c.name + '.'); root.querySelector('[data-plan="' + CSS.escape(c.id) + '"]')?.focus(); });
    root.querySelectorAll('[data-delpl]').forEach(b => b.onclick = () => { const pl = planOf2(b.dataset.delpl); if (pl) deleteOption(p, pl); });
    root.querySelectorAll('[data-rmore]').forEach(b => b.onclick = () => { const pl = planOf2(b.dataset.rmore); if (pl) renderMore(p, pl); });
    root.querySelectorAll('[data-rdelall]').forEach(b => b.onclick = () => { const id = b.dataset.rdelall, pl = id === '*' ? null : planOf2(id); if (id === '*' || pl) deleteAllRenders(p, pl); });
    on('[data-tabgo]', e => setTab(p, e.currentTarget.dataset.tabgo, true));
    on('[data-jref]', () => { siteFail.delete(p.id); gatherSite(p); render(true); });
    on('[data-delp]', () => { if (!confirm('Delete the project ' + p.name + ' and its ' + plural(p.plans.length, 'plan') + '? ' + (shared === true ? 'This removes it for the team too.' : 'This removes it from this device.'))) return; db.projects = db.projects.filter(x => x.id !== p.id); db.dirty = db.dirty.filter(i => i !== p.id); db.gone.push(p.id); cur = null;
      for (const pl of p.plans) for (const r of pl.renders || []) { rdel(r.id); rdel(r.id + ':m'); } // its pictures on this device
      if (away?.pid === p.id) hideAway(); if (resume?.pid === p.id) clearResume(); save(); ctx.scheduleHash?.(); });
    if (tab === 'overview') { // Regrid fetched on one of the parcels' cards since: its city and zoning count now; the jurisdiction is looked up once
      let ch = false; for (const x of p.parcels) ch = regridOn(x) || ch; if (ch) { quietSave(p); setTimeout(() => render()); }
      if (needSite(p)) gatherSite(p); // (the card already says Checking…)
    }
    if (tab === 'renderings') wireRenders(p);
    if (tab === 'plans') wirePlans(p);
    if (tab === 'ask') wirePAsk(p);
    if (tab === 'files') SF.wire(p, root);
  }
  root?.addEventListener('focusout', () => setTimeout(() => { if (waiting && ctx.view === 'projects') render(); }));
  ctx.onView?.('projects', render);

  // ---------- for the assistant ----------
  // build: a plain-words request; project: an existing project's name to add to
  async function forAssistant({ request, project }) {
    if (!ed) {
      const b = ctx.currentBuilding?.(); if (!b) return { error: 'Open a parcel first (click a building or open ground at street zoom), or open a plan from Projects.' };
      if (!start(b)) return { error: 'Couldn’t start a plan here.' };
      const want = project && db.projects.find(p => p.name.toLowerCase() === String(project).toLowerCase());
      if (want) card.querySelector('input[name=spP][value="' + want.id + '"]')?.click();
      card.querySelector('#spStart')?.click();
    }
    const pl = PL(); if (!pl) return { error: 'The plan didn’t open.' };
    if (pl.ring.length < 3) return { started: true, note: 'There’s no parcel outline here, so the user needs to draw the site on the map first (click its corners).' };
    if (!request) return { started: true, project: P().name, plan: pl.name, acres: +(SP.ringArea(pl.ring) / 43560).toFixed(2) };
    if (ed.run) return { error: 'A build is already running on this plan. Wait for it to finish, or Cancel it in the plan panel.' };
    ed.ask = request; panel(); if (await build() === 'ask') return { started: true, needsConfirm: true, note: 'The layout on the map has the user’s own edits, so the plan panel now asks them whether to replace those edits (or save them as a new option first) before building.' };
    if (!PL()) return { error: 'The plan was closed before the layouts came back.' };
    const m = GM(PL()), issues = GC(PL());
    return { built: true, project: P().name, plan: PL().name, options: (ed.variants || []).map(v => ({ name: v.name, building_sf: Math.round(v.m.gfa), spaces: v.m.spaces, required: v.m.required, coverage_pct: Math.round(v.m.coverage * 100), passes_checks: K.passes(v.chk), notes: v.notes })),
      shown: { building_sf: Math.round(m.gfa), units: m.units, spaces: m.spaces, required: m.required, coverage_pct: Math.round(m.coverage * 100), far: +m.far.toFixed(2), detention_acres: +(m.pond / 43560).toFixed(2) }, issues: issues.map(i => i.text), note: ed.aiNote || '' };
  }

  // the projects a property card's parcel is already in (its Site plan button reads "Open site plan" then)
  function projectsFor(parcel, center) { if (!parcel && !center) return []; try { return RUN.projectsWith(db.projects, [parcelOf(parcel || {}, center || parcel?.center).key]); } catch (e) { return []; } }
  // Settings › Testing › Delete all projects: every project and option, their pictures on this device, the banners and
  // the address. With team sharing on (or set up and offline) they go for the team too, through the same tombstones
  // a single project's Delete uses, so other devices drop them; local: only this device's copies (the team's download
  // again on the next sync)
  const teamMode = () => shared === true || (shared == null && !!get(CODE_KEY));
  function deleteAll({ local = false } = {}) {
    if (ed) ctx.closeCard(); hideAway(); clearResume(); flushDeletes();
    const team = !local && teamMode(), r = PJ.deleteAll(db, { team }); dropImages(r.keys);
    cur = null; pending = null; lastOpen = null; ptab.clear(); pasks.clear(); thumbs.clear?.();
    save(); ctx.setView('projects'); show(null); ctx.scheduleHash?.();
    return r;
  }
  ctx.sitePlan = { start, open, close, get editing() { return !!ed; }, show: (id, tab) => { if (db.projects.some(x => x.id === id)) show(id, tab); }, has: (pid, plid) => !!db.projects.find(x => x.id === pid)?.plans.some(x => x.id === plid),
    // what the address keeps (reload, reopening the installed app): the open plan, else the project on the Projects page
    get where() { return ed && !ed.draftPlan ? { plan: ed.pid + '.' + ed.plid } : cur && ctx.view === 'projects' ? { project: cur, tab: PJ.tabOf(ptab.get(cur)) } : {}; }, forAssistant, get projects() { return db.projects; }, sync, projectsFor, // sync: Settings runs it after a new team passcode
    counts: () => ({ ...PJ.projectCounts(db.projects), team: teamMode() }), deleteAll,
    get pendingProject() { return pendingProject() && pending; }, set pendingProject(v) { pending = v?.id ? { id: v.id, t: v.t || Date.now() } : null; } };
}
