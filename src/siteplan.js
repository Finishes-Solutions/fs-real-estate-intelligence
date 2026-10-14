// Projects and site plans. From a property card (the Site plan button at the top), start a project or add the parcel to
// one, then lay out a site plan on the map: buildings, parking (stalls counted as you size it), drives, truck court,
// detention and landscape, checked against setbacks, with coverage, FAR and parking numbers. "Build with AI" turns a
// request ("25,000 sf retail strip") into a program (api/siteplan) and lib/siteplan.mjs lays out three options.
// Projects are kept on this device and shared with the team through /api/projects once it's set up. Exports DXF
// (AutoCAD, CADCraft and other CAD programs) and GeoJSON.
import * as SP from './lib/siteplan.mjs';
import { layoutOptions, refit, PARAMS } from './lib/sitelayout.mjs';
import * as PF from './lib/proforma.mjs';
import { sheetHTML, planSVG } from './lib/sitesheet.mjs';
import { BUILDING_TYPES, BUILDING_GROUPS, typeById, fromType } from './lib/buildings.mjs';
import * as ED from './lib/siteedit.mjs';
import { freeRect as openArea, fitPadding, planSections } from './lib/planview.mjs';
import * as RUN from './lib/planruns.mjs';
import * as K from './lib/planpick.mjs';
import * as MAP from './lib/planmap.mjs';
const typeOptions = cur => BUILDING_GROUPS.map(g => '<optgroup label="' + g + '">' + BUILDING_TYPES.filter(t => t.group === g).map(t => '<option value="' + t.id + '"' + (t.id === cur ? ' selected' : '') + '>' + t.name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>').join('') + '</optgroup>').join(''); // the building library, grouped
import { areaMap } from './reportkit.js';

const KEY = 'fs-projects-v1', CODE_KEY = 'fs-team-code', NAME_KEY = 'fs-team-name';
const ADD = ['building', 'pad', 'parking', 'garage', 'drive', 'truck', 'pond', 'green', 'play', 'court', 'pool', 'patio', 'trash'];
const ADD_LABEL = { pad: 'Restaurant pad (drive-thru)', play: 'Playground', court: 'Courts', pool: 'Pool', patio: 'Outdoor seating', garage: 'Parking garage' };
const SIZE = { building: [120, 100], parking: [180, 60], drive: [26, 80], truck: [200, 130], pond: [120, 80], green: [40, 40], trash: [24, 12], pad: [44, 50], garage: [180, 120], patio: [30, 20], play: [64, 48], court: [64, 44], pool: [60, 30] };
const PAVED = ['parking', 'drive', 'truck'];
const FORMS = [['bar', 'Bar'], ['L', 'L-shaped'], ['U', 'Courtyard (U)'], ['tower', 'Tower on a podium']];
const { COL, USE_COL } = MAP; // one palette for the map, the Plan key and the Draw buttons (lib/planmap.mjs)
const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const t = s => Date.parse(s || 0) || 0;
const clone = o => JSON.parse(JSON.stringify(o));

export function initSitePlan(ctx) {
  const { map, esc, fmtN } = ctx, card = ctx.card, root = document.getElementById('view-projects');
  let db = load(), ed = null, shared = null, syncT = 0, syncing = false, raf = 0;
  const f0 = v => Math.round(v).toLocaleString('en-US'), pct = v => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';

  // ---------- storage and team sync ----------
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return { projects: d.projects || [], dirty: d.dirty || [], gone: d.gone || [] }; } catch (e) { return { projects: [], dirty: [], gone: [] }; } }
  let persistT = 0; // written a moment after the last change, not on every one (a big plan is megabytes)
  function persistNow() { clearTimeout(persistT); persistT = 0; try { localStorage.setItem(KEY, JSON.stringify(db)); return; } catch (e) { /* full: try lighter */ }
    // the browser's store is full: the saved layouts of options that aren't open keep their numbers only (each is laid out again when clicked)
    if (RUN.lightenRuns(db.projects, ed?.plid)) try { localStorage.setItem(KEY, JSON.stringify(db)); return; } catch (e) { /* still full */ }
    ctx.toast('This browser won’t let the page save projects.'); }
  function persist() { clearTimeout(persistT); persistT = setTimeout(persistNow, 600); }
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
        if (!r.ok) { shared = r.status === 503 || r.status === 401 ? false : shared; return; }
        db.dirty = db.dirty.filter(id => !sent.some(([i, u]) => i === id && db.projects.find(p => p.id === id)?.updated === u)); db.gone = db.gone.filter(id => !gone.includes(id));
      }
      const r = await fetch('api/projects', { headers: h }); if (!r.ok) { shared = r.status === 503 || r.status === 401 ? false : shared; return; }
      const d = await r.json(); shared = true; let changed = false;
      for (const id of d.deleted || []) { const i = db.projects.findIndex(p => p.id === id); if (i >= 0 && !db.dirty.includes(id) && ed?.pid !== id) { db.projects.splice(i, 1); changed = true; } }
      for (const p of d.projects || []) {
        const i = db.projects.findIndex(x => x.id === p.id); if (ed?.pid === p.id || db.dirty.includes(p.id)) continue;
        if (i < 0) { db.projects.push(p); changed = true; } else if (t(p.updated) > t(db.projects[i].updated)) { db.projects[i] = p; changed = true; }
      }
      if (changed) { persist(); badge(); if (ctx.view === 'projects') render(); }
    } catch (e) { /* offline: try again on the next change or when back online */ }
    finally { syncing = false; if (ctx.view === 'projects') render(); }
  }
  window.addEventListener('online', sync);
  setTimeout(sync, 4000);
  function badge() { ctx.setBadge?.('projects', db.projects.length); } // a muted count beside the Projects sub-tab
  badge();

  const P = () => db.projects.find(p => p.id === ed?.pid), PL = () => P()?.plans.find(x => x.id === ed?.plid);
  const nextName = p => 'Option ' + String.fromCharCode(65 + Math.min(25, p.plans.length));
  const newPlan = (p, extra = {}) => ({ id: uid(), name: nextName(p), origin: null, ring: [], src: null, front: null, frontGuess: true, setbacks: { ...SP.SETBACKS }, program: { use: 'retail' }, zoning: null, elements: [], created: new Date().toISOString(), ...extra });
  const parcelKey = pc => pc.propId ? 'pid:' + pc.propId : 'pt:' + pc.center.map(v => v.toFixed(5)).join(',');

  // ---------- starting from a property card ----------
  // info: { center, title, parcel } from a property card, or { center, title, parcels: [...] } from the card's All tab
  const MAXP = 20;
  const llRound = g => g && JSON.parse(JSON.stringify(g, (k, v) => typeof v === 'number' ? +v.toFixed(7) : v));
  const parcelOf = (pc, center) => { const g = pc.geometry, r = g && (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates?.[0]?.[0]); const cc = r ? SP.centroid(r) : center;
    const rec = { key: '', label: pc.situs || pc.owner || 'Parcel', owner: pc.owner || '', propId: pc.propId || null, marketValue: pc.marketValue || null, landValue: pc.landValue || null, acres: g ? +(SP.ringArea(SP.boundaryFrom(g, center)?.ring || []) / 43560).toFixed(3) : null, center: cc.map(v => +v.toFixed(6)), geometry: llRound(g) || null };
    rec.key = parcelKey(rec); return rec; };
  // the site boundary for a set of parcels (one outline, or several merged)
  function siteOf(recs) { const g = recs.map(r => r.geometry).filter(Boolean); return g.length > 1 ? SP.unionParcels(g) : g.length ? { ...SP.boundaryFrom(g[0], recs[0].center), pieces: 1 } : null; }
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
    const recs = list.map(pc => parcelOf(pc, center)), b = siteOf(recs), many = recs.length > 1;
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
      '<div class="lt sp-lt-site" style="margin-top:12px">Site</div><div class="rnote">' + (b ? (many ? recs.length + ' parcel outlines from the county appraisal district, merged into one site (small gaps and overlaps between them are closed up).' : 'The parcel outline from ' + (list[0]?.regrid ? 'Regrid' : 'the county appraisal district') + ', dashed on the map.') + ' You can add or remove parcels, or redraw the site, in the plan.' : 'There’s no parcel outline here (in Harris and Waller County, use “Get owner, value &amp; zoning from Regrid” on the property card first). You’ll draw the site on the map.') + '</div>' +
      (b?.pieces > 1 ? '<div class="rnote sp-warn">Some parcels don’t touch the rest (a road or a gap wider than 6 ft between them), so they’re left out of the site.</div>' : '') +
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
      for (const r of recs) { const i = p.parcels.findIndex(x => x.key === r.key); if (i < 0) p.parcels.push(r); else if (!p.parcels[i].geometry && r.geometry) p.parcels[i] = r; }
      if (pending?.id === p.id) pending = null; // used
      const z = ctx.lastRegrid?.zoning && list.some(x => x.regrid) ? zoningOf(ctx.lastRegrid.zoning) : null;
      const plan = newPlan(p, b ? { origin: b.origin, ring: b.ring, src: many ? 'parcels' : list[0]?.regrid ? 'regrid' : 'parcel', parcel: recs[0].key, parcels: recs.map(r => r.key), zoning: z } : { parcel: recs[0]?.key, parcels: recs.map(r => r.key), origin: center });
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
    planState = { collapsed: !!ctx.panelCollapsed?.() };
    if (!planState.collapsed && !phone()) ctx.setPanelCollapsed?.(true);
    watchResize(); addScale(); if (phone()) ctx.foldLegend?.(true); // the Plan key starts folded on phones
  }
  function leavePlanning() {
    app.classList.remove('planning'); ro?.disconnect(); ro = null; clearTimeout(roT);
    dropScale(); ctx.foldLegend?.(null); mapUi.hidden = true; pillMode.hidden = true; modeKey = ''; keySig = ''; ctx.setLegend?.('siteplan', ''); app.style.removeProperty('--sp-above'); clearGone();
    if (planState && !!ctx.panelCollapsed?.() !== planState.collapsed) ctx.setPanelCollapsed?.(planState.collapsed); // exactly as it was
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
    cur = pid; renaming = false; lastOpen = { pid, plid }; killRun();
    ed = { pid, plid, sel: null, undo: [], redo: [], mode: o.draw || !(db.projects.find(x => x.id === pid)?.plans.find(x => x.id === plid)?.ring?.length >= 3) ? 'draw' : null, draft: [], variants: null, editing: false, run: null }; // editing: pieces can be moved only in Edit Layout
    restoreRun(PL());
    hideMapBits();
    addLayers(); draw(); panel();
    requestAnimationFrame(() => requestAnimationFrame(() => planFit()));
    const pl = PL(); if (pl?.ring.length >= 3 && (pl.frontGuess || pl.streets == null)) map.once('idle', () => { if (PL() === pl && (pl.frontGuess || pl.streets == null)) detectFront(pl); });
  }
  // the option's last build comes back with it: its layouts (the one on the map marked), the request and the AI's note
  function restoreRun(pl) {
    const r = pl?.lastRun; if (!r?.variants?.length) return;
    let vs = clone(r.variants); if (vs.some(v => !v.key)) { const k = RUN.layoutKeys(vs); vs = vs.map((v, i) => ({ ...v, key: v.key || k[i] })); }
    const on = pl.variant && !pl.variant.edited && vs.find(v => v.key === pl.variant.key && !v.elements); if (on) on.elements = clone(pl.elements); // the team copy keeps numbers only: the one on the map is the option's own pieces
    for (const v of vs) derive(v, pl);
    ed.variants = vs; ed.aiNote = r.note || ''; ed.aiSummary = r.summary || ''; ed.sortBy = r.sort || 'rec'; ed.ask = r.ask || ''; ed.runMeta = { ask: r.ask || '', at: r.at }; if (r.ideas?.list?.length) ed.ideas = r.ideas; if (r.read) ed.readAs = r.read; ed.aiPick = r.pick || null;
    refreshFin(true);
  }
  // the plan closes (Done, ×, another card, leaving the map): say where it was saved and leave a way back to it
  function close() {
    card.classList.remove('sp-mode');
    if (!ed) { if (startGhost && !resume) clearResume(); startGhost = false; return; } // the Start card went: its outline too
    const p = P(), pl = PL(), was = { pid: ed.pid, plid: ed.plid, at: performance.now() }; killRun();
    ed = null; fromCard = ''; draw(); showMapBits(); leavePlanning();
    if (persistT) persistNow();
    if (!p || !pl) return; // deleted
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
    mapUi.hidden = false;
  }
  function addScale() { if (scale || !window.maplibregl?.ScaleControl) return; try { scale = new maplibregl.ScaleControl({ unit: 'imperial', maxWidth: 120 }); mapUi.querySelector('.sp-scale').appendChild(scale.onAdd(map)); } catch (e) { scale = null; } }
  function dropScale() { try { scale?.onRemove(); } catch (e) {} scale = null; }
  // the mode: a tool (draw, street side, side street, entrance, parcels), shaping a piece, or Edit Layout
  function modeOf() {
    if (!ed) return null; const pl = PL(), touch = coarse(), cl = touch ? 'Tap' : 'Click';
    switch (ed.mode) {
      case 'draw': return pl?.ring.length >= 3 ? { k: 'redraw', t: 'Redraw the site', d: cl + ' each corner · ' + cl.toLowerCase() + ' the first again' + (touch ? '' : ' or press Enter') + ' to finish', b: 'Cancel' } : { k: 'draw', t: 'Draw the site', d: cl + ' each corner · ' + cl.toLowerCase() + ' the first again' + (touch ? '' : ' or press Enter') + ' to finish' };
      case 'front': return { k: 'front', t: 'Street Side', d: cl + ' the lot line along the street', b: 'Cancel' };
      case 'street': return { k: 'street', t: 'Side Street', d: cl + ' a lot line to add or remove a side street', b: 'Done' };
      case 'entrance': return { k: 'entrance', t: 'Add Entrance', d: cl + ' the lot line where the driveway comes in', b: 'Cancel' };
      case 'parcels': return { k: 'parcels', t: 'Add or remove parcels', d: cl + ' a parcel next to the site to add it, or one in it to take it out', b: 'Done' };
    }
    if (ed.shape && ed.editing) return { k: 'shape', t: 'Editing the shape', d: 'Drag a point · drag a + to add one · double-' + cl.toLowerCase() + ' a point to remove it', b: 'Done' };
    if (ed.editing) return { k: 'edit', t: 'Editing layout', d: touch ? 'Drag to move · drag a corner to resize · the green dot turns' : 'Drag to move · R turns · Del removes · Esc done', b: 'Done' };
    return null;
  }
  function paintMode() {
    placeMapUi(); const m = modeOf(), k = m ? m.k : '';
    if (k !== modeKey) { modeKey = k; if (k) ctx.clearToast?.(); if (ed && ed.mode !== 'front' && ed.mode !== 'street') ed.hover = null; } // a new mode: an old instruction toast goes
    if (!m) { pillMode.hidden = true; pillMode.innerHTML = ''; return; }
    const html = '<span class="sp-mp-dot" aria-hidden="true"></span><span class="sp-mp-t"><b>' + esc(m.t) + '</b><span class="sp-mp-d">' + esc(m.d) + '</span></span>' + (m.b ? '<button type="button" class="sp-mp-b' + (m.b === 'Done' ? ' done' : '') + '">' + m.b + '</button>' : '');
    if (pillMode.innerHTML !== html) { pillMode.innerHTML = html; const b = pillMode.querySelector('button'); if (b) b.onclick = () => leaveMode(); }
    pillMode.hidden = false;
  }
  // the pill's button: Cancel a tool, or Done with it (Side Street, parcels), shaping, or editing
  function leaveMode() {
    if (!ed) return;
    if (ed.mode) { ed.mode = null; ed.draft = []; ed.hover = null; }
    else if (ed.shape) ed.shape = null;
    else ed.editing = false;
    draw(); panel();
  }

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
        map.addLayer({ id: 'fs-sp-ghost', type: 'line', source: GSRC, paint: { 'line-color': ctx.isDark() ? '#8acda3' : '#0a7a36', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': .75 } });
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
        if (/path|track|rail|transit|ferry|cable|bridleway|pier/.test(f.properties?.class || '')) continue;
        const g = f.geometry, parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        for (const c of parts) { const ft = c.map(F.toFt); if (ft.some(([x, y]) => Math.abs(x) < 2500 && Math.abs(y) < 2500)) lines.push(ft); }
      }
    } catch (e) {}
    const f = pl.frontGuess ? SP.frontFromRoads(pl.ring, lines) : pl.front;
    if (f != null) { pl.front = f; pl.frontGuess = false; if (!pl.streetsSet) pl.streets = SP.streetsFromRoads(pl.ring, lines, f); save(P()); draw(); panel(); }
  }

  function snapshot() { const pl = PL(); return clone({ zones: pl.zones || [], elements: pl.elements, front: pl.front, frontGuess: pl.frontGuess, streets: pl.streets || [], streetsSet: !!pl.streetsSet, setbacks: pl.setbacks, program: pl.program, ring: pl.ring, origin: pl.origin, src: pl.src, params: pl.params || null, recipe: pl.recipe || null, variant: pl.variant || null }); }
  // a layout on the map that's been changed by hand or by Change With AI is "edited": new settings never replace it silently
  let applying = false;
  const markEdited = pl => { if (pl?.variant && !pl.variant.edited) pl.variant = { ...pl.variant, edited: true }; };
  const dirty = pl => !!(pl && (pl.variant ? pl.variant.edited : pl.elements.some(e => e.pinned)));
  function change(fn, keepPanel) {
    const pl = PL(); if (!pl) return; ed.undo.push(snapshot()); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = [];
    const watch = !applying && pl.variant && !pl.variant.edited, before = watch ? JSON.stringify(pl.elements) : '';
    const runOn = !applying && ed.run && !ed.run.applied && LAYS.includes(ed.run.kind), b0 = runOn && !watch ? JSON.stringify(pl.elements) : before;
    fn(pl); const moved = (watch || runOn) && JSON.stringify(pl.elements) !== b0; if (watch && moved) markEdited(pl); if (runOn && moved) handEdit();
    pl.updated = new Date().toISOString(); save(P()); draw(); if (!keepPanel) panel(); else nums();
  }
  // say: the person asked (the buttons, ⌘Z / Ctrl+Y): a short toast with the way back ("Undone · Redo")
  function undo(back = true, say = false) {
    const pl = PL(), from = back ? ed.undo : ed.redo, to = back ? ed.redo : ed.undo; if (!pl || !from.length) { if (say) ctx.toast(back ? 'Nothing to undo.' : 'Nothing to redo.'); return; }
    to.push(snapshot()); Object.assign(pl, from.pop()); if (ed.run) ed.pickedByUser = true; if (ed.sel && !pl.elements.some(e => e.id === ed.sel)) ed.sel = null; save(P()); draw(); panel();
    if (say) ctx.toast(back ? 'Undone.' : 'Redone.', { action: { label: back ? 'Redo' : 'Undo', run: () => { if (ed) undo(!back, true); } } });
  }
  // a piece deleted (the Delete key or button): the toast names it and can bring it back
  function delEl(el) { const name = ED.labelOf(el), n = ed.undo.length; change(x => dropEl(x, el)); ed.sel = null; draw(); panel();
    ctx.toast('Deleted ' + name + '.', { action: { label: 'Undo', run: () => { if (ed && ed.undo.length === n + 1) undo(true); } } }); }

  // ---------- map layers ----------
  // Drawn bottom to top: the ground (lawn, paving, pieces, stalls), the setback, the trees, the site boundary over them
  // (a white casing under it), the buildings (Phase 2 fainter, the selected one lit up and the others dimmed), outlines
  // (problems red, Phase 2 dashed, the selection green on white), the labels (the selected piece's always shows; parking
  // counts from zoom 17.5), then the drawing line, the hovered street edge and the handles. Colours come from one palette
  // (lib/planmap.mjs) in light or dark; a theme or basemap change rebuilds them all (onOverlays below).
  const SRC = 'fs-sp', HSRC = 'fs-sp-h', DSRC = 'fs-sp-d', XSRC = 'fs-sp-x', EMPTY = { type: 'FeatureCollection', features: [] };
  const coarse = () => matchMedia('(pointer:coarse)').matches; // fingers: bigger handles, a wider reach, the turn dot further out
  let ids = [], dimmed = null;
  function addLayers() {
    if (map.getSource(SRC)) return;
    const kind = k => ['==', ['get', 'k'], k], dark = ctx.isDark(), P = MAP.palette(dark), C = P.col, Ln = P.lines, Lb = P.label, big = coarse();
    const add = def => { map.addLayer(def); ids.push(def.id); };
    ids = []; dimmed = null;
    map.addSource(SRC, { type: 'geojson', data: EMPTY }); map.addSource(HSRC, { type: 'geojson', data: EMPTY }); map.addSource(DSRC, { type: 'geojson', data: EMPTY }); map.addSource(XSRC, { type: 'geojson', data: EMPTY });
    const sel1 = ['==', ['get', 'sel'], 1], ph2 = ['==', ['get', 'ph'], 2], bk = ['in', ['get', 'k'], ['literal', ['building', 'garage']]];
    const useCol = f => ['match', ['get', 'use'], ...Object.entries(P.use).map(([k, v]) => [k, f(v)]).flat(), f(C.building)];
    const bcol = f => ['case', ['==', ['get', 'bad'], 1], Ln.bad, ['==', ['get', 'k'], 'garage'], f(C.garage), ph2, useCol(c => f(P.p2(c))), useCol(f)];
    const id = c => c, lit = c => P.sel(c);
    add({ id: 'fs-sp-lot', type: 'fill', source: SRC, filter: ['all', kind('lot'), ['==', ['get', 'site'], 1]], paint: { 'fill-color': C.lawn, 'fill-opacity': P.lotOpacity } }); // the site is landscape under everything on it
    add({ id: 'fs-sp-zone', type: 'line', source: SRC, filter: kind('zone'), layout: { 'line-cap': 'round' }, paint: { 'line-color': Ln.zone, 'line-width': 1.1, 'line-dasharray': [0.1, 2.6] } }); // dotted
    // paving is drawn once as a whole (one colour, one curb line round it); the pieces under it stay clear, and show
    // only when picked, so drives and parking rows read as one surface without seams or darker overlaps
    add({ id: 'fs-sp-pave', type: 'fill', source: SRC, filter: kind('paved'), paint: { 'fill-color': C.parking, 'fill-opacity': .82 } });
    add({ id: 'fs-sp-curb', type: 'line', source: SRC, filter: kind('paved'), paint: { 'line-color': Ln.curb, 'line-width': 1.2, 'line-opacity': .9 } });
    add({ id: 'fs-sp-fill', type: 'fill', source: SRC, filter: ['in', ['get', 'k'], ['literal', ['parking', 'drive', 'truck', 'pond', 'green', 'plaza', 'court', 'pool', 'play', 'trail', 'trash', 'patio']]],
      paint: { 'fill-color': ['match', ['get', 'k'], 'trail', C.trail, 'trash', C.trash, 'patio', C.patio, 'parking', C.parking, 'drive', C.drive, 'truck', C.truck, 'pond', C.pond, 'plaza', C.plaza, 'court', C.court, 'pool', C.pool, 'play', C.play, C.green],
        'fill-opacity': ['case', sel1, .5, ['in', ['get', 'k'], ['literal', PAVED]], 0.01, ['all', ['==', ['get', 'k'], 'green'], ['==', ['get', 'nm'], 0]], 0.01, .75] } });
    add({ id: 'fs-sp-lots', type: 'line', source: SRC, filter: ['all', kind('lot'), ['!=', ['get', 'site'], 1]], minzoom: 17, layout: { 'line-cap': 'round' }, paint: { 'line-color': Ln.lots, 'line-width': 1, 'line-dasharray': [0.1, 2.4] } }); // house lots, dotted, close in
    add({ id: 'fs-sp-walk', type: 'fill', source: SRC, filter: kind('walk'), paint: { 'fill-color': Ln.walk, 'fill-opacity': .85 } });
    add({ id: 'fs-sp-yard', type: 'fill', source: SRC, filter: kind('yard'), minzoom: 16, paint: { 'fill-color': Ln.yard, 'fill-opacity': .9 } });
    add({ id: 'fs-sp-fence', type: 'line', source: SRC, filter: kind('fence'), minzoom: 16, paint: { 'line-color': Ln.fence, 'line-width': 1 } });
    add({ id: 'fs-sp-stall', type: 'line', source: SRC, filter: kind('stall'), minzoom: 16, paint: { 'line-color': Ln.stall, 'line-width': 1, 'line-opacity': dark ? .7 : .9 } });
    add({ id: 'fs-sp-isl', type: 'fill', source: SRC, filter: kind('island'), paint: { 'fill-color': C.green, 'fill-opacity': .9 } });
    add({ id: 'fs-sp-ada', type: 'fill', source: SRC, filter: kind('ada'), minzoom: 16, paint: { 'fill-color': '#2f6db5', 'fill-opacity': .9 } });
    add({ id: 'fs-sp-mark', type: 'line', source: SRC, filter: kind('mark'), minzoom: 16, paint: { 'line-color': ['get', 'c'], 'line-width': ['get', 'w'], 'line-opacity': .95 } });
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
    add({ id: 'fs-sp-edge', type: 'line', source: SRC, filter: ['all', ['in', ['get', 'k'], ['literal', ['building', 'garage', 'patio', 'parking', 'drive', 'truck', 'pond', 'green', 'plaza', 'court', 'pool', 'play', 'trash']]], ['any', ['!', ['in', ['get', 'k'], ['literal', [...PAVED, 'green']]]], ['==', ['get', 'nm'], 1], sel1, ['==', ['get', 'bad'], 1]]], // paving: outlined only when picked or wrong
      paint: { 'line-color': ['case', ['==', ['get', 'bad'], 1], Ln.bad, dark ? 'rgba(255,255,255,.5)' : 'rgba(11,13,12,.45)'], 'line-width': ['case', ['==', ['get', 'bad'], 1], 2.5, 1] } });
    add({ id: 'fs-sp-p2', type: 'line', source: SRC, filter: ['all', kind('building'), ph2, ['!', sel1], ['!=', ['get', 'bad'], 1]], paint: { 'line-color': Ln.p2, 'line-width': 1.3, 'line-dasharray': [2, 1.6] } }); // Phase 2: dashed
    // the selection: green on a white casing (a red casing when it's also a problem)
    const pieces = ['all', ['has', 'id'], ['!', ['in', ['get', 'k'], ['literal', ['label', 'b3']]]]];
    add({ id: 'fs-sp-selc', type: 'line', source: SRC, filter: ['all', pieces, sel1], layout: { 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'bad'], 1], Ln.bad, Ln.selCase], 'line-width': ['case', ['==', ['get', 'bad'], 1], 6, 5] } });
    add({ id: 'fs-sp-sell', type: 'line', source: SRC, filter: ['all', pieces, sel1], layout: { 'line-join': 'round' }, paint: { 'line-color': Ln.sel, 'line-width': 3 } });
    add({ id: 'fs-sp-flash', type: 'line', source: SRC, filter: ['all', pieces, ['==', ['get', 'fl'], 1]], layout: { 'line-join': 'round' }, paint: { 'line-color': Ln.accent, 'line-width': 4, 'line-opacity': 1 } }); // what Change With AI just changed
    add({ id: 'fs-sp-gone', type: 'line', source: XSRC, paint: { 'line-color': dark ? '#e8ecea' : '#0b0d0c', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': .8 } }); // …and what it removed, fading
    // labels: the most important first (lib/planmap.mjs); parking counts only close in; the selected piece's always
    const txt = { 'text-field': ['step', ['zoom'], ['get', 't1'], 17.5, ['get', 't2'], 18.25, ['get', 't']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 16, ['case', ['==', ['get', 'big'], 1], 9, 8.5], 18, ['case', ['==', ['get', 'big'], 1], 12, 11], 20, 15], 'text-max-width': 18, 'text-padding': 4, 'symbol-sort-key': ['get', 'pri'] };
    const roof = ['in', ['get', 'kind'], ['literal', ['building', 'garage']]], ink = { 'text-color': dark ? ['case', roof, Lb.roofInk, Lb.ink] : Lb.ink, 'text-halo-color': dark ? ['case', roof, Lb.roofHalo, Lb.halo] : Lb.halo, 'text-halo-width': 1.6 };
    add({ id: 'fs-sp-lab-p', type: 'symbol', source: SRC, minzoom: 17.5, filter: ['all', kind('label'), ['==', ['get', 'lp'], 1], ['!', sel1]], layout: { ...txt, 'text-allow-overlap': false }, paint: ink });
    add({ id: 'fs-sp-lab', type: 'symbol', source: SRC, filter: ['all', kind('label'), ['!=', ['get', 'lp'], 1], ['!', sel1]], layout: { ...txt, 'text-allow-overlap': false }, paint: ink });
    add({ id: 'fs-sp-lab-sel', type: 'symbol', source: SRC, filter: ['all', kind('label'), sel1], layout: { ...txt, 'text-allow-overlap': true }, paint: ink }); // always, and the others make way for it (it's on top, so placed first); as short as the others zoomed out, so it doesn't hide the outline it names
    // drawing: the line being drawn, the street edge under the pointer (Street Side, Side Street), the handles
    add({ id: 'fs-sp-hv', type: 'line', source: DSRC, filter: ['==', ['get', 'hv'], 1], layout: { 'line-cap': 'round' }, paint: { 'line-color': Ln.frontage, 'line-width': 9, 'line-opacity': .6 } });
    add({ id: 'fs-sp-dl', type: 'line', source: DSRC, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'hv'], 1]], paint: { 'line-color': Ln.accent, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    add({ id: 'fs-sp-dp', type: 'circle', source: DSRC, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': big ? 7 : 5, 'circle-color': Ln.accent, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    const hr = big ? [10, 6, 9] : [7, 4, 6]; // the turn dot, a + point, a corner
    add({ id: 'fs-sp-h', type: 'circle', source: HSRC, paint: { 'circle-radius': ['case', ['==', ['get', 'r'], 1], hr[0], ['==', ['get', 'm'], 1], hr[1], hr[2]], 'circle-color': ['case', ['==', ['get', 'r'], 1], Ln.accent, ['==', ['get', 'm'], 1], '#9fd3ff', '#ffffff'], 'circle-opacity': ['case', ['==', ['get', 'm'], 1], .85, 1], 'circle-stroke-color': ['case', ['==', ['get', 'r'], 1], '#ffffff', '#0b0d0c'], 'circle-stroke-width': big ? 2 : 1.5 } }); // corners, the turn dot, and (editing a shape) points and + midpoints
    draw();
  }
  ctx.onOverlays?.(() => { for (const id of ids) if (map.getLayer(id)) map.removeLayer(id); ids = [];
    for (const s of [SRC, HSRC, DSRC, XSRC]) if (map.getSource(s)) map.removeSource(s); if (map.getSource(GSRC)) { for (const id of ['fs-sp-ghost', 'fs-sp-ghost-f']) if (map.getLayer(id)) map.removeLayer(id); map.removeSource(GSRC); }
    if (ed) { keySig = ''; addLayers(); hideMapBits(); } else if (resume) { const x = planOf(resume); if (x) ghost(x.pl); } });
  function handles(pl) {
    const e = ed.editing && pl.elements.find(x => x.id === ed.sel); if (!e) return [];
    if (ed.shape === e.id && e.poly) { const F = SP.frame(pl.origin), P = e.poly; // shape editing: every point, and a + between points to add one
      return P.map((p, i) => ({ i: 'v' + i, at: F.toLL(p), ft: p })).concat(P.map((p, i) => { const q = P[(i + 1) % P.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return { i: 'm' + i, at: F.toLL(m), ft: m }; })); }
    if (SP.isFree(e)) { const o = SP.outline(e), xs = o.map(p => p[0]), ys = o.map(p => p[1]), F = SP.frame(pl.origin); // curved pieces: corner handles scale the whole shape
      return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]].map((p, i) => ({ i: 's' + i, at: F.toLL(p), ft: p })); }
    const F = SP.frame(pl.origin), c = SP.corners(e), top = [e.x, e.y], a = (e.rot || 0) * Math.PI / 180, L = e.d / 2 + Math.max(14, e.d * 0.15) + (coarse() ? 26 * ftPerPx() : 0); // fingers: the turn dot further out
    return c.map((p, i) => ({ i, at: F.toLL(p) })).concat([{ i: 'r', at: F.toLL([top[0] - Math.sin(a) * L, top[1] + Math.cos(a) * L]) }]);
  }
  const ftPerPx = () => 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (512 * 2 ** map.getZoom()) * 3.28084;
  // layouts run in a worker (sp-worker.js) so the page stays responsive; straight in the page if workers aren't there
  let worker = null, wseq = 0; const wait = new Map();
  function laid(fn, ...args) {
    try { if (!worker) { worker = new Worker(new URL('./sp-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = ({ data }) => { const w = wait.get(data.id); if (!w) return; wait.delete(data.id); data.ok ? w.ok(data.result) : w.no(new Error(data.error)); }; worker.onerror = e => { for (const w of wait.values()) w.no(new Error(e.message || 'layout worker failed')); wait.clear(); worker = null; }; } }
    catch (e) { worker = null; }
    if (!worker) return new Promise((ok, no) => setTimeout(() => { try { ok(fn === 'refit' ? refit(...args) : layoutOptions(...args)); } catch (e) { no(e); } }, 30));
    const id = ++wseq; return new Promise((ok, no) => { wait.set(id, { ok, no }); worker.postMessage({ id, fn, args: JSON.parse(JSON.stringify(args)) }); });
  }
  let lastKeep = null, keySig = '';
  function draw() {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const pl = ed && PL(), s = map.getSource(SRC); if (!s) return;
      const fc = pl?.ring.length >= 3 ? SP.planFeatures(pl, ed.sel, drag?.moved ? lastKeep : null) : EMPTY, P0 = P(); lastKeep = fc.keep || null; // mid-drag: last planting and checks
      if (fc !== EMPTY) MAP.decorate(fc, pl, { flash: ed.flash?.ids }); // labels know their piece, priorities, Phase 2 labels (one pass)
      if (fc !== EMPTY && (pl.parcels?.length > 1 || ed.mode === 'parcels')) for (const k of pl.parcels || []) { const r = P0.parcels.find(x => x.key === k); if (r?.geometry) fc.features.push({ type: 'Feature', properties: { k: 'pline' }, geometry: r.geometry }); }
      s.setData(fc);
      map.getSource(HSRC)?.setData(pl?.ring.length >= 3 ? { type: 'FeatureCollection', features: handles(pl).map(h => ({ type: 'Feature', properties: { r: h.i === 'r' ? 1 : 0, m: String(h.i)[0] === 'm' ? 1 : 0 }, geometry: { type: 'Point', coordinates: h.at } })) } : EMPTY);
      const F = pl?.origin && SP.frame(pl.origin), d = ed?.mode === 'draw' && F ? ed.draft.map(F.toLL) : [], hv = F && ed.hover != null && (ed.mode === 'front' || ed.mode === 'street') && pl.ring.length >= 3 ? [pl.ring[ed.hover], pl.ring[(ed.hover + 1) % pl.ring.length]].filter(Boolean).map(F.toLL) : [];
      map.getSource(DSRC)?.setData({ type: 'FeatureCollection', features: d.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })).concat(d.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: d } }] : [], hv.length === 2 ? [{ type: 'Feature', properties: { hv: 1 }, geometry: { type: 'LineString', coordinates: hv } }] : []) });
      // something picked: the other buildings step back (extrusion opacity is per layer, so it's set here, only on a change)
      const dim = !!(ed?.sel && pl?.elements.some(e => e.id === ed.sel)); if (dim !== dimmed && map.getLayer('fs-sp-bldg')) { dimmed = dim; map.setPaintProperty('fs-sp-bldg', 'fill-extrusion-opacity', dim ? .75 : .88); map.setPaintProperty('fs-sp-bldg2', 'fill-extrusion-opacity', dim ? .5 : .6); map.setPaintProperty('fs-sp-b3', 'fill-extrusion-opacity', dim ? .75 : .95); }
      if (!drag?.moved) planKey(pl); // never mid-drag
    });
  }
  // the Plan key in the map's legend card: what this plan uses, Phase 1 and 2, the lines, Problem (rebuilt only when that changes)
  function planKey(pl) {
    if (!ed || !pl) { if (keySig) { keySig = ''; ctx.setLegend?.('siteplan', ''); } return; }
    const dark = ctx.isDark(), sig = MAP.keySig(pl, dark); if (sig === keySig) return; keySig = sig;
    ctx.setLegend?.('siteplan', MAP.keyHtml(pl, { dark }));
  }

  // ---------- pointer: select, move, resize, rotate ----------
  const ftAt = (pl, lngLat) => SP.frame(pl.origin).toFt([lngLat.lng, lngLat.lat]);
  const SHAPEABLE = ['building', 'plaza', 'green', 'pond', 'court', 'pool', 'patio', 'play', 'garage']; // pieces whose outline can be edited point by point
  const ORDER = ['building', 'pool', 'court', 'play', 'plaza', 'pond', 'drive', 'truck', 'parking', 'trail', 'green'];
  function hit(pl, e) {
    let best = null, bd = coarse() ? 22 : 12; for (const h of handles(pl)) { const p = map.project(h.at), dd = Math.hypot(p.x - e.point.x, p.y - e.point.y); if (dd < bd) { bd = dd; best = h; } } if (best) return { h: best.i }; // the nearest handle; a finger needs more room than a mouse
    const ft = ftAt(pl, e.lngLat);
    for (const k of ORDER) { const el = pl.elements.slice().reverse().find(x => x.kind === k && SP.hitRect(x, ft)); if (el) return { el }; }
    return null;
  }
  let drag = null;
  function down(e) {
    const pl = ed && PL(); if (!pl || ed.mode || ctx.view !== 'map' || pl.ring.length < 3) return;
    const oe = e.originalEvent; if (oe?.button > 0 || oe?.touches?.length > 1) return;
    const h = hit(pl, e); if (!h) return;
    if (!ed.editing) { if (h.el && ed.sel !== h.el.id) { ed.sel = h.el.id; panel(); draw(); } return; } // looking, not editing: a click selects and the map still pans
    e.preventDefault(); // stops the map's own drag-to-pan for this press
    const el = h.el || pl.elements.find(x => x.id === ed.sel); if (!el) return;
    if (h.el && ed.sel !== el.id) { ed.sel = el.id; panel(); draw(); }
    if (typeof h.h === 'string' && (h.h[0] === 'v' || h.h[0] === 'm')) { // a point of the shape (a + inserts one there first)
      let k = +h.h.slice(1); const snap = snapshot(); if (h.h[0] === 'm') { const P = el.poly, q = P[(k + 1) % P.length]; P.splice(k + 1, 0, [(P[k][0] + q[0]) / 2, (P[k][1] + q[1]) / 2]); k++; }
      drag = { type: 'vertex', k, id: el.id, from: ftAt(pl, e.lngLat), orig: clone(el), snap, moved: h.h[0] === 'm' }; draw(); return; }
    const hs = typeof h.h === 'string' && h.h[0] === 's' ? handles(pl).find(q => q.i === h.h) : null;
    drag = { type: h.h == null ? 'move' : h.h === 'r' ? 'rot' : hs ? 'scale' : 'size', k: h.h, corner: hs?.ft, id: el.id, from: ftAt(pl, e.lngLat), orig: clone(el), snap: snapshot(), moved: false };
    if (drag.type === 'move') { const att = SP.attachedTo(pl, el); drag.att = att.map(a => ({ id: a.id, orig: clone(a) })); if (el.kind === 'building' || el.kind === 'garage') drag.obs = SP.spotObstacles(pl, el, att); } // what moves with it, and what it has to stay clear of
  }
  function move(e) {
    if (!drag) return; const pl = PL(), el = pl?.elements.find(x => x.id === drag.id); if (!el) return;
    const p = ftAt(pl, e.lngLat), o = drag.orig; drag.moved = true;
    if (drag.type === 'vertex') { // the point follows the pointer, lining up with its neighbours (within 3 ft, square to the piece) unless Alt is held
      const P = el.poly, n = P.length, k = drag.k, r = (el.rot || 0), loc = q => SP.rotPt(q, -r), back = q => SP.rotPt(q, r); let q = loc(p);
      if (!e.originalEvent?.altKey) for (const nb of [P[(k - 1 + n) % n], P[(k + 1) % n]]) { const b = loc(nb); if (Math.abs(q[0] - b[0]) < 3) q = [b[0], q[1]]; if (Math.abs(q[1] - b[1]) < 3) q = [q[0], b[1]]; }
      P[k] = back(q).map(v => +v.toFixed(2)); const c = SP.centroid(P); el.x = +c[0].toFixed(2); el.y = +c[1].toFixed(2); draw(); readout(el); return;
    }
    if (drag.type === 'move') { // snaps to its neighbours' edges, stays out of the setbacks and (a building) off the drives and other buildings; hold Alt for a free move
      const free = e.originalEvent?.altKey, carry = () => (drag.att || []).map(a => pl.elements.find(x => x.id === a.id)).filter(Boolean);
      if (SP.isFree(o)) Object.assign(el, SP.moveBy(clone(o), p[0] - drag.from[0], p[1] - drag.from[1])); else { el.x = +(o.x + p[0] - drag.from[0]).toFixed(2); el.y = +(o.y + p[1] - drag.from[1]).toFixed(2); if (!free) { const [sx, sy] = SP.settleShift(pl, el); el.x = +(el.x + sx).toFixed(2); el.y = +(el.y + sy).toFixed(2); } }
      const mv = () => { const dx = el.x - o.x, dy = el.y - o.y; for (const a of drag.att || []) { const t = pl.elements.find(x => x.id === a.id); if (t) Object.assign(t, SP.moveBy(clone(a.orig), dx, dy)); } };
      mv(); drag.blocked = false;
      if (!free && drag.obs) { const c = SP.clearSpot(pl, el, { carry: carry(), obs: drag.obs }); if (c) { if (c[0] || c[1]) { SP.moveBy(el, c[0], c[1]); mv(); } } else drag.blocked = true; } // the nearest clear spot to the pointer
    }
    else if (drag.type === 'scale') { const c = [o.x, o.y], f = Math.max(0.2, Math.min(5, Math.hypot(p[0] - c[0], p[1] - c[1]) / (Math.hypot(drag.corner[0] - c[0], drag.corner[1] - c[1]) || 1))); Object.assign(el, SP.scaleBy(clone(o), f, c)); }
    else if (drag.type === 'size') {
      const sx = [-1, 1, 1, -1][drag.k], sy = [-1, -1, 1, 1][drag.k], opp = [-sx * o.w / 2, -sy * o.d / 2], q = SP.toLocal(o, p);
      const w = Math.max(8, Math.abs(q[0] - opp[0])), d = Math.max(8, Math.abs(q[1] - opp[1])), mid = [opp[0] + sx * w / 2, opp[1] + sy * d / 2], a = (o.rot || 0) * Math.PI / 180;
      Object.assign(el, { w: +w.toFixed(2), d: +d.toFixed(2), x: +(o.x + mid[0] * Math.cos(a) - mid[1] * Math.sin(a)).toFixed(2), y: +(o.y + mid[0] * Math.sin(a) + mid[1] * Math.cos(a)).toFixed(2) });
    } else {
      let r = Math.atan2(p[1] - o.y, p[0] - o.x) * 180 / Math.PI - 90; const base = frameAngle(pl);
      if (!e.originalEvent?.shiftKey) { const rel = ((r - base) % 90 + 90) % 90; r = rel < 4 ? r - rel : rel > 86 ? r + 90 - rel : Math.round(r / 5) * 5; }
      el.rot = +(((r % 360) + 360) % 360).toFixed(2);
    }
    draw(); readout(el);
  }
  function up() {
    if (!drag) return; const d = drag; drag = null;
    if (!d.moved) return;
    ed.undo.push(d.snap); ed.redo = []; const pl = PL(), el = pl.elements.find(x => x.id === d.id); markEdited(pl); handEdit();
    if (el) { el.pinned = true; if (el.kind === 'parking') delete el.ext; /* placed by hand: this is its length now */
      const went = d.type === 'move' ? [d.orig, ...(d.att || []).map(a => a.orig)] : [d.orig]; makeRoom(el, went);
      for (const a of d.att || []) { const t = pl.elements.find(x => x.id === a.id); if (t) { t.pinned = true; makeRoom(t); } } }
    if (d.blocked) ctx.toast('No clear spot there: it overlaps a drive or another building. Hold Alt (Option) to place it anyway.');
    pl.updated = new Date().toISOString(); save(P()); draw(); panel();
  }
  map.on('mousedown', down); map.on('touchstart', down); map.on('mousemove', move); map.on('touchmove', move); map.on('mouseup', up); map.on('touchend', up);
  window.addEventListener('mouseup', up);
  map.on('mousemove', e => { // cursor feedback
    const pl = ed && PL(); if (!pl || drag || ctx.view !== 'map') return;
    const c = map.getCanvas(); if (ed.mode) { c.style.cursor = 'crosshair';
      if ((ed.mode === 'front' || ed.mode === 'street') && pl.ring.length >= 3) { const k = SP.nearestEdge(pl.ring, ftAt(pl, e.lngLat)); if (k !== ed.hover) { ed.hover = k; draw(); } } // the lot edge a click would pick, in orange
      return; }
    const h = pl.ring.length >= 3 && hit(pl, e); c.style.cursor = !h ? '' : h.h === 'r' ? 'grab' : h.h != null ? 'nwse-resize' : 'move';
  });
  const frameAngle = pl => pl.ring.length >= 3 ? SP.mainAngle(pl.ring) : 0; // the lot's main lines: new pieces square up with them

  // clicks while the plan is open: draw the boundary, pick the street side, or select; never open other cards
  ctx.mapClickHandlers.unshift(e => {
    const pl = ed && PL(); if (!pl) return false;
    if (ed.mode === 'draw') {
      const F = SP.frame(pl.origin), p = F.toFt([e.lngLat.lng, e.lngLat.lat]), first = ed.draft[0] && map.project(F.toLL(ed.draft[0]));
      if (first && ed.draft.length >= 3 && Math.hypot(first.x - e.point.x, first.y - e.point.y) < 14) finishDraw(); else { ed.draft.push(p); draw(); panel(); }
      return true;
    }
    if (ed.mode === 'parcels') { pickParcel(e.lngLat); return true; }
    if (ed.mode === 'front') { const p = ftAt(pl, e.lngLat); change(x => { x.front = SP.nearestEdge(x.ring, p); x.frontGuess = false; }); ed.mode = null; panel(); return true; }
    if (ed.mode === 'entrance') { // a driveway in from the street where the lot line was clicked
      const p = ftAt(pl, e.lngLat), k = SP.nearestEdge(pl.ring, p), d = SP.segDist(p, pl.ring[k], pl.ring[(k + 1) % pl.ring.length]);
      if (d > 60) { ctx.toast('Click on the lot line along the street, where the driveway should come in.'); return true; }
      const r = SP.addEntrance(pl, p, { id: uid() }); if (r.error) { ctx.toast(r.error); return true; }
      change(x => { x.elements = r.elements; x.streets = r.streets; if (r.streets.length) x.streetsSet = true; }); ed.sel = r.entrance.id; ed.mode = null; ed.editing = true;
      draw(); panel(); ctx.toast(r.entrance.name + ' added.' + (r.note ? ' ' + r.note : '')); return true;
    }
    if (ed.mode === 'street') { const p = ftAt(pl, e.lngLat); change(x => { const k = SP.nearestEdge(x.ring, p), st = new Set(x.streets || []); if (k !== (x.front ?? SP.longestEdge(x.ring))) { if (st.has(k)) st.delete(k); else st.add(k); } x.streets = [...st]; x.streetsSet = true; }); return true; } // a side street on or off; it stays armed for the next one until Done
    if (!hit(pl, e) && ed.sel) { ed.sel = null; draw(); panel(); }
    return true;
  });
  map.on('dblclick', e => {
    if (ed?.mode === 'draw') { e.preventDefault(); finishDraw(); return; }
    const pl = ed?.editing && ed.shape && PL(), el = pl?.elements.find(x => x.id === ed.shape); if (!el?.poly || el.poly.length <= 3) return;
    const h = hit(pl, e); if (typeof h?.h === 'string' && h.h[0] === 'v') { e.preventDefault(); change(() => { el.poly.splice(+h.h.slice(1), 1); const c = SP.centroid(el.poly); el.x = +c[0].toFixed(2); el.y = +c[1].toFixed(2); }); draw(); } // a point removed
  });
  // move a plan to a new boundary (and origin), keeping every piece where it is on the ground
  function reorigin(x, b, src) {
    const G = SP.frame(x.origin), N = SP.frame(b.origin);
    const to = p => N.toFt(G.toLL(p)).map(v => +v.toFixed(2));
    x.elements.forEach(e => { [e.x, e.y] = to([e.x, e.y]); if (e.path) e.path = e.path.map(to); if (e.poly) e.poly = e.poly.map(to); });
    x.origin = b.origin; x.ring = b.ring; x.src = src; x.front = null; x.frontGuess = true; x.streets = []; x.streetsSet = false;
  }
  function setParcels(keys) {
    const p = P(), recs = keys.map(k => p.parcels.find(x => x.key === k)).filter(r => r?.geometry), b = siteOf(recs);
    if (!b) { ctx.toast('Those parcels have no outline to plan on.'); return; }
    const pl = PL(); change(x => { reorigin(x, b, recs.length > 1 ? 'parcels' : 'parcel'); x.parcels = recs.map(r => r.key); x.parcel = recs[0].key; });
    if (b.pieces > 1) ctx.toast('Some parcels don’t touch the rest (a road or a gap wider than 6 ft), so they’re left out of the site.');
    map.once('idle', () => PL() === pl && detectFront(pl));
  }
  async function pickParcel(lngLat) {
    const p = P(), pl = PL(), c = [lngLat.lng, lngLat.lat], keys = pl.parcels || (pl.parcel ? [pl.parcel] : []);
    const inside = keys.map(k => p.parcels.find(x => x.key === k)).find(r => r?.geometry && inGeom(c, r.geometry));
    if (inside) { if (keys.length === 1) { ctx.toast('A site needs at least one parcel.'); return; } setParcels(keys.filter(k => k !== inside.key)); return; }
    if (keys.length >= MAXP) { ctx.toast('Up to ' + MAXP + ' parcels in one site.'); return; }
    ctx.toast('Looking up the parcel…');
    try {
      const r = await fetch('api/building?' + new URLSearchParams({ lat: c[1].toFixed(6), lon: c[0].toFixed(6), part: 'parcel' })), d = await r.json();
      if (!r.ok || !d.parcel) throw new Error(d.error || 'No parcel here.');
      if (!d.parcel.geometry) { ctx.toast('The county has no outline for that parcel (Harris and Waller need Regrid details).'); return; }
      const rec = parcelOf(d.parcel, c); if (!p.parcels.some(x => x.key === rec.key)) p.parcels.push(rec);
      if (keys.includes(rec.key)) return; setParcels([...keys, rec.key]);
    } catch (e) { ctx.toast('Couldn’t look up that parcel: ' + e.message); }
  }
  function finishDraw() {
    const pl = PL(); if (!pl || ed.draft.length < 3) { ctx.toast('Click at least three corners of the site.'); return; }
    const F = SP.frame(pl.origin), ll = ed.draft.map(F.toLL), b = SP.boundaryFrom({ type: 'Polygon', coordinates: [ll.concat([ll[0]])] });
    if (!b) return; const old = pl.origin;
    change(x => reorigin(x, b, 'drawn'));
    ed.mode = null; ed.draft = []; draw(); panel(); map.once('idle', () => PL() === pl && detectFront(pl));
  }

  document.addEventListener('keydown', e => {
    const pl = ed && PL(), typing = /^(TEXTAREA)$/.test(e.target.tagName) || e.target.tagName === 'INPUT' && !/^(checkbox|radio|button|range)$/.test(e.target.type) || e.target.isContentEditable;
    if (pl && ctx.view === 'map' && !typing && (e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); undo(e.key.toLowerCase() === 'z' ? !e.shiftKey : false, true); return; } // undo and redo work whatever button was last clicked
    if (pl && ctx.view === 'map' && e.key === 'Escape' && card.classList.contains('sp-mode') && e.target.tagName !== 'SELECT') { escStep(e, typing); return; }
    if (!pl || ctx.view !== 'map' || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const used = () => { e.preventDefault(); e.stopPropagation(); };
    const k = e.key, el = pl.elements.find(x => x.id === ed.sel), mod = e.metaKey || e.ctrlKey;
    if (mod && k.toLowerCase() === 'z') { used(); undo(!e.shiftKey, true); return; }
    if (mod && k.toLowerCase() === 'y') { used(); undo(false, true); return; }
    if (k === 'Enter' && ed.mode === 'draw') { finishDraw(); return; }
    if (!el || !ed.editing) return;
    if (k === 'Delete' || k === 'Backspace') { used(); delEl(el); return; }
    const step = e.shiftKey ? 10 : 1, a = frameAngle(pl) * Math.PI / 180, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
    if (mv) { used(); const pl0 = PL(), att = pl0 ? SP.attachedTo(pl0, el) : []; change(() => { const dx = step * (mv[0] * Math.cos(a) - mv[1] * Math.sin(a)), dy = step * (mv[0] * Math.sin(a) + mv[1] * Math.cos(a)); ed.nudged = [...(ed.nudged || []), clone(el), ...att.map(clone)].slice(-12); for (const t of [el, ...att]) { SP.moveBy(t, dx, dy); t.pinned = true; } }, true); refitSoon(); return; } // what belongs to it moves too
    if ((k === 'r' || k === 'R') && !mod && !SP.isFree(el)) { used(); turnEl(el); }
  }, true);

  // Esc steps back one thing at a time and never closes the plan (× or Done does): a tool → the selection → Edit Layout.
  // A pop-over that's open (Layers, a menu, Filters) closes first; in a text box, Esc just leaves the box.
  function escStep(e, typing) {
    if (document.querySelector('#layers.on, .fpop:not([hidden]), details.vmenu[open], .msheet.on, .rpop:not([hidden]), .app.sel-open, #settingsSheet:not([hidden])')) return;
    if (typing && !card.contains(e.target)) return; // the assistant's box and other fields handle their own Esc
    e.preventDefault(); e.stopPropagation();
    if (typing) { e.target.blur(); return; }
    if (ed.mode === 'draw' && PL()?.ring.length < 3) { if (ed.draft.length) { ed.draft = []; draw(); panel(); } return; } // no site yet: Esc clears the corners, drawing goes on (there's nothing to go back to)
    if (ed.mode) { ed.mode = null; ed.draft = []; draw(); panel(); return; }
    if (ed.sel || ed.shape) { ed.sel = null; ed.shape = null; draw(); panel(); return; }
    if (ed.editing) { ed.editing = false; draw(); panel(); } // the mode pill on the map goes away
  }

  // ---------- the panel ----------
  // the dark summary under the header, as on a property card: what the plan holds and whether it passes
  function overview(pl, prog) {
    if (!pl.elements.length && ed.run?.kind === 'build') return '<div class="kicker">Building</div><div><b>Laying out “' + esc(ed.run.ask) + '”.</b> The layouts appear here as soon as they’re drawn.</div>';
    if (!pl.elements.length) return '<div class="kicker">Step 1 of 3</div><div><b>Describe what to build</b> under Build with AI, then Build Layouts. <button type="button" class="sp-link sp-quiet" data-jump="spDrawSec">or draw pieces by hand</button></div>';
    // a decision strip: which layout is on the map, Phase 1 first, parking, coverage, the money, and whether it passes
    const m = SP.metrics(pl), issues = SP.check(pl), cl = K.checkLabel(K.checksOf(issues, m)), ph = pl.elements.some(e => e.phase === 2);
    const m1 = ph ? SP.metrics({ ...pl, elements: pl.elements.filter(e => e.phase !== 2) }) : null, h = K.headline(m, m1, K.askedOf(prog));
    let f = null; try { f = RUN.finOf(pfRun(P(), pl)); } catch (e) { f = null; }
    const v = pl.variant, neg = x => x != null && x < 0 ? ' class="neg"' : '', d = f ? K.moneyDigits([f.cost, f.value]) : 1;
    const st = (k, big, sub, tip) => '<div class="sp-ov-s"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><small>' + k + '</small><b>' + big + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</div>';
    const probs = issues.filter(i => i.level === 'bad' || /^Parking is/.test(i.text)), open = !!ed.ovOpen && cl.level !== 'ok';
    return '<div class="kicker">' + (ed.editing ? 'Editing · drag a piece; only it changes' : 'On the map') + '</div>' +
      '<div class="sp-ov-n"><b>' + esc(v ? numOf(v) : pl.name) + '</b>' + (v ? '<span>' + esc(RUN.baseName(v.name)) + '</span>' : '<span>drawn by hand</span>') + (v?.edited ? '<i>edited</i>' : '') + '</div>' +
      '<div class="sp-ov-g">' + st(m1 ? 'Phase 1' : h.units ? 'Units' : 'Floor area', esc(h.big), h.fit ? '<em class="neg">Fits ' + esc(h.fit) + '</em>' : esc(h.sub)) +
        st('Parking', f0(m.spaces) + '/' + f0(m.required), m.spaces < m.required ? '<em class="neg">' + f0(m.required - m.spaces) + ' short</em>' : 'spaces / required') + st('Coverage', pct(m.coverage), 'FAR ' + m.far.toFixed(2)) +
        (f ? (f.forSale ? st('Cost · margin', K.fmtM(f.cost, d), '<em' + neg(f.margin) + '>' + K.fmtPct(f.margin) + ' margin</em>', 'From the Pro forma') : st('Value / cost', K.fmtM(f.value, d) + ' / ' + K.fmtM(f.cost, d), '<em' + neg(f.yoc) + '>' + K.fmtPct(f.yoc) + ' yield</em>' + (f.spread != null ? ' · <em' + neg(f.spread) + '>' + K.fmtPct(f.spread) + ' spread</em>' : ''), 'From the Pro forma: stabilized value, total cost with land, yield on cost and the spread over the market cap rate')) : '') + '</div>' +
      (h.p2 ? '<div class="sp-ov-p2">' + esc(h.p2) + '</div>' : '') +
      '<div class="sp-ov-a"><button type="button" class="sp-ck ' + cl.level + '" id="spOvCk"' + (cl.level === 'ok' ? ' disabled title="Inside the lot and setbacks, no overlaps, enough parking"' : ' aria-expanded="' + open + '" aria-controls="spOvProbs" title="Show what to fix"') + '>' + esc(cl.text) + (cl.level === 'ok' ? '' : '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>') + '</button>' +
        (ed.variants?.length > 1 ? '<button type="button" class="sp-link sp-ov-cmp" data-jump="spLayouts">Compare layouts</button>' : '') + '</div>' +
      (open ? '<ul class="sp-ov-probs" id="spOvProbs">' + probs.map(i => '<li>' + (i.id ? '<button type="button" data-issue="' + esc(i.id) + '" title="Select it on the map">' + esc(i.text) + '</button>' : '<span>' + esc(i.text) + '</span>') + '</li>').join('') + '</ul>' : '');
  }
  const ICO = {
    undo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 3 2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H7"/></svg>',
    redo: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 3l3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H9"/></svg>',
    edit: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 13.5l.6-3L10.8 2.8a1.5 1.5 0 0 1 2.1 0l.3.3a1.5 1.5 0 0 1 0 2.1L5.5 12.9z"/><path d="M9.5 4l2.5 2.5"/></svg>',
    done: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>'
  };
  // an option pill's tooltip: what it holds, from the same numbers as the Projects page
  function optTip(p, x) { const { drawn, m, m1 } = info(p, x), a = m1 || m; return drawn && m?.gfa ? [(a.units ? plural(a.units, 'unit') : f0(a.gfa) + ' sq ft') + (m1 ? ' in Phase 1' : ''), f0(m.spaces) + ' parking', pct(m.coverage) + ' coverage'].join(' · ') : drawn ? 'Nothing laid out yet' : 'No site drawn yet'; }
  const plansHtml = (p, pl, extra) => '<div class="sp-plans' + (extra ? ' ' + extra : '') + '" role="group" aria-label="Options">' + p.plans.map(x => '<button type="button" class="chip" aria-pressed="' + (x.id === pl.id) + '" data-plan="' + esc(x.id) + '" title="' + esc(x.name + ': ' + optTip(p, x)) + '">' + esc(x.name) + '</button>').join('') +
    '<button type="button" class="chip sp-newopt" data-newopt="1" title="Start another option from this one">+ New Option</button></div>';
  function panel() {
    const p = P(), pl = PL(); if (!p || !pl) return;
    const sel = pl.elements.find(e => e.id === ed.sel), prog = SP.normalizeProgram(pl.program), noRing = pl.ring.length < 3, drawing = noRing || ed.mode === 'draw', has = pl.elements.length > 0;
    const parcel = p.parcels.find(x => x.key === pl.parcel), addr = parcel?.label || '', acres = noRing ? '' : (SP.ringArea(pl.ring) / 43560).toFixed(2) + ' acres';
    const selNew = !!sel && sel.id !== ed.shownSel; ed.shownSel = sel?.id || null; // a new piece picked: the card goes to the top, where Selected is
    const scroll = selNew ? 0 : card.classList.contains('sp-mode') ? card.scrollTop : 0;
    const act = document.activeElement, focusId = act && act !== card && card.contains(act) ? act.id : ''; // keep the focus across the redraw
    const sub = addr && addr.trim().toLowerCase() !== p.name.trim().toLowerCase() ? esc(addr) + (acres ? ' · ' + acres : '') : acres;
    const back = fromCard && ctx.cardChild?.() === 'open' ? '<button type="button" class="cback sp-cback" title="Back to ' + esc(fromCard) + '">' + ICO.back + '<span>' + esc(fromCard) + '</span></button>' : '';
    // one list (lib/planview.mjs): the section chips and the sections come from it, in its order, so they can't drift apart
    const HTML = {
      spDrawSite: () => '<div class="bsec sp-draw" id="spDrawSite"><div class="lt">Draw the site</div><p>Click each corner of the site on the map. Click the first corner again (or double-click, or press Enter) to finish.' + (ed.draft.length ? ' ' + ed.draft.length + ' corner' + (ed.draft.length > 1 ? 's' : '') + ' so far.' : '') + '</p><div class="bacts" style="padding:0"><button class="btn askai" id="spFinish"' + (ed.draft.length < 3 ? ' disabled' : '') + '>Finish</button><button class="btn" id="spClearDraw">Start Over</button>' + (noRing ? '' : '<button class="btn" id="spCancelDraw">Keep the Old Site</button>') + '</div></div>',
      spSel: () => '<div class="bsec" id="spSel">' + selHtml(sel, prog) + '</div>',
      spLayouts: () => '<div class="bsec" id="spLayouts">' + layoutsHead() + '<div id="spVariants">' + variantsHtml() + '</div></div>',
      spChgSec: () => '<div class="bsec sp-ai" id="spChgSec"><label class="lt" for="spChg">Change With AI</label><textarea id="spChg" rows="2" placeholder="e.g. make Apt Bldg 7 four stories · turn the clubhouse into a 7,500 sf one · remove Bldg 3 · swap Bldg 2 and Bldg 5">' + esc(ed.chg || '') + '</textarea>' +
        '<div class="rnote">' + (sel ? 'About <b>' + esc(ED.labelOf(sel)) + '</b> (selected), or name any piece as it’s labelled on the plan.' : 'Name pieces as they’re labelled on the plan, or select one and say “it”.') + '</div>' +
        '<div class="bacts sp-go"><button class="btn askai" id="spChgGo">Make Changes</button></div>' + (pl.recipe ? '<label class="sp-sw sp-revsw"><input type="checkbox" id="spChgFit"' + (ed.chgFit ? ' checked' : '') + '> Re-fit the rest of the site around the changes (otherwise only those pieces change)</label>' : '') +
        chgHtml(pl) + '</div>',
      spAiSec: () => buildHtml(pl),
      spNums: () => '<div class="bsec" id="spNums"></div>',
      spPfSec: () => '<div id="spPf">' + pfHtml(p, pl) + '</div>',
      spSiteSec: () => siteHtml(p, pl),
      spDrawSec: () => '<div class="bsec" id="spDrawSec"><div class="lt">Draw by hand</div><div class="sp-tools">' + ADD.map(k => '<button class="btn sp-add" data-add="' + k + '"><i style="background:' + (k === 'pad' ? USE_COL.restaurant : COL[k] || COL.building) + '"></i>' + (ADD_LABEL[k] || SP.KINDS[k].label) + '</button>').join('') + '<button class="btn" id="spTrees" aria-pressed="' + (pl.params?.trees !== false) + '" title="Show or hide the trees on the plan, the map and the PDF">Trees ' + (pl.params?.trees !== false ? 'On' : 'Off') + '</button></div>' +
        '<label class="sp-lib">From the building library (' + BUILDING_TYPES.length + ' types)<select id="spLib"><option value="">Pick a building type to add…</option>' + typeOptions('') + '</select></label></div>',
      spParams: () => paramsHtml(pl, prog),
      spExport: () => '<div class="bsec" id="spExport"><div class="lt">Export</div><div class="bacts" style="padding:0 0 8px"><button class="btn askai" id="spPdf" title="A conceptual site plan sheet: the plan to scale with title block, site data, program and parking, parcels, notes and legend">Site Plan PDF</button><select class="chip" id="spSheet" aria-label="Sheet size"><option value="tabloid">11 × 17</option><option value="archd">24 × 36</option></select></div><div class="bacts" style="padding:0"><button class="btn" id="spDxf" title="Opens in AutoCAD, CADCraft, LibreCAD and most CAD programs">CAD (DXF)</button><button class="btn" id="spGeo">Map File (GeoJSON)</button><button class="btn" id="spSum">Copy Summary</button></div></div>'
    };
    const secs = planSections({ drawing, selected: !!sel, layouts: !!ed.variants, laidOut: has }).map(x => ({ ...x, html: HTML[x.id] }));
    const editBtn = has && !noRing ? '<button type="button" class="btn sm sp-edit' + (ed.editing ? ' on' : '') + '" aria-pressed="' + !!ed.editing + '" id="spEdit" title="Move, resize and turn pieces of the plan; only the piece you move changes">' + ICO.edit + '<span>' + (ed.editing ? 'Stop Editing' : 'Edit Layout') + '</span></button>' : '';
    card.innerHTML = '<div class="top sp-top"><div class="sp-head">' + back +
        '<nav class="sp-crumb" aria-label="Where you are"><button type="button" class="sp-cr" data-crumb="all">Projects</button><span aria-hidden="true">›</span><button type="button" class="sp-cr" data-crumb="project" title="Open the project page: ' + esc(p.name) + '">' + esc(p.name) + '</button><span aria-hidden="true">›</span></nav>' +
        '<div class="sp-ttl"><h2><input id="spPlanName" class="sp-title" value="' + esc(pl.name) + '" aria-label="Option name"></h2>' + (sub ? '<div class="bsub">' + sub + '</div>' : '') + '</div>' +
        '<div class="sp-hact"><button type="button" class="sp-ib" id="spUndo"' + (ed.undo.length ? '' : ' disabled') + ' aria-label="Undo" title="Undo (⌘Z / Ctrl+Z)">' + ICO.undo + '</button><button type="button" class="sp-ib" id="spRedo"' + (ed.redo.length ? '' : ' disabled') + ' aria-label="Redo" title="Redo (⇧⌘Z / Ctrl+Y)">' + ICO.redo + '</button>' +
          editBtn + '<button type="button" class="btn sm primary sp-done" id="spDone" title="Close the plan (it’s saved as you go)">' + ICO.done + '<span>Done</span></button>' + xBtn() + '</div></div>' +
      plansHtml(p, pl) + (ed.run ? runHtml(ed.run) : '') +
      ctx.cardNav(secs.map(x => [x.id, x.label])) + '</div>' +
      (noRing ? '' : '<div class="bover" id="spOver">' + overview(pl, prog) + '</div>') + plansHtml(p, pl, 'sp-plans-ph') +
      '<div class="sp-body">' + secs.map(x => x.html()).join('') +
      (drawing ? '' : '<div class="sp-foot"><button type="button" class="sp-link sp-del" id="spDelPlan">Delete This Option</button></div>') + '</div>';
    card.classList.add('open', 'sp-mode');
    const $ = q => card.querySelector(q), on = (q, fn) => { const el = $(q); if (el) el.onclick = fn; };
    card.scrollTop = scroll;
    if (selNew && phone() && !card.classList.contains('half') && !card.classList.contains('full')) { sheetQuiet = true; card.classList.remove('min'); card.classList.add('half'); } // phones: the sheet comes up to show it
    if (focusId) { const f = card.querySelector('#' + CSS.escape(focusId)); if (f && f !== document.activeElement) try { f.focus({ preventScroll: true }); } catch (e) {} }
    on('.x', closePlan); on('#spDone', closePlan); on('.sp-cback', closePlan);
    card.querySelectorAll('[data-crumb]').forEach(b => b.onclick = () => { const pid = p.id; ctx.setView('projects'); show(b.dataset.crumb === 'project' ? pid : null); });
    $('#spPlanName').onchange = e => change(x => { x.name = e.target.value.trim() || x.name; }, true);
    card.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { if (b.dataset.plan === pl.id) return; open(p.id, b.dataset.plan); });
    card.querySelectorAll('[data-newopt]').forEach(b => b.onclick = () => { const c = { ...clone(pl), id: uid(), name: nextName(p), created: new Date().toISOString() }; p.plans.push(c); save(p); open(p.id, c.id); });
    card.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => card.querySelector('.bnav [data-sec="' + b.dataset.jump + '"]')?.click());
    const wireOver = () => { card.querySelectorAll('#spOver [data-issue]').forEach(b => b.onclick = () => { ed.sel = b.dataset.issue; draw(); panel(); }); const ck = card.querySelector('#spOvCk'); if (ck) ck.onclick = () => { ed.ovOpen = !ed.ovOpen; card.querySelector('#spOver').innerHTML = overview(pl, prog); wireOver(); }; card.querySelectorAll('#spOver [data-jump]').forEach(b => b.onclick = () => card.querySelector('.bnav [data-sec="' + b.dataset.jump + '"]')?.click()); };
    wireOver();
    on('#spUndo', () => undo(true, true)); on('#spRedo', () => undo(false, true));
    on('#spFinish', finishDraw); on('#spClearDraw', () => { ed.mode = 'draw'; ed.draft = []; draw(); panel(); }); on('#spCancelDraw', () => { ed.mode = null; ed.draft = []; draw(); panel(); });
    if (drawing) { nums(); lockRun(); paintMode(); return; }
    wireBuild(pl);
    const chg = $('#spChg'); if (chg) { chg.oninput = e => { ed.chg = e.target.value; }; chg.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) aiChange(); }; }
    on('#spChgGo', aiChange); const cf = $('#spChgFit'); if (cf) cf.onchange = () => { ed.chgFit = cf.checked; }; wireChg();
    wireVariants();
    card.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { ed.editing = true; addEl(b.dataset.add); }); // adding a piece is editing
    const lib = $('#spLib'); if (lib) lib.onchange = () => { const t = typeById(lib.value); if (t) { ed.editing = true; addType(t); } };
    const tb = card.querySelector('#spTrees'); if (tb) tb.onclick = () => { change(x => { x.params = { ...(x.params || {}), trees: x.params?.trees === false }; }); panel(); };
    on('#spEdit', () => { ed.editing = !ed.editing; draw(); panel(); });
    on('#spFront', () => { ed.mode = ed.mode === 'front' ? null : 'front'; panel(); });
    on('#spStreet', () => { ed.mode = ed.mode === 'street' ? null : 'street'; panel(); });
    on('#spEntr', () => { ed.mode = ed.mode === 'entrance' ? null : 'entrance'; panel(); }); // the pill on the map says what to do
    on('#spRedraw', () => { ed.mode = 'draw'; ed.draft = []; ed.sel = null; draw(); panel(); });
    on('#spParcels', () => { ed.mode = ed.mode === 'parcels' ? null : 'parcels'; ed.sel = null; draw(); panel(); });
    card.querySelectorAll('[data-rmp]').forEach(b => b.onclick = () => { const keys = (pl.parcels || []).filter(k => k !== b.dataset.rmp); if (keys.length) setParcels(keys); });
    wireParams(pl); wirePf(p, pl);
    wireSel(sel);
    on('#spPdf', () => exportPdf(p, pl, card.querySelector('#spSheet').value));
    on('#spDxf', () => ctx.saveFile(fileName(p, pl) + '.dxf', SP.toDXF(pl, p.name + ' - ' + pl.name), 'application/dxf'));
    on('#spGeo', () => ctx.saveFile(fileName(p, pl) + '.geojson', JSON.stringify(geojson(p, pl), null, 1), 'application/geo+json'));
    on('#spSum', async () => { const s = summary(p, pl); try { await navigator.clipboard.writeText(s); ctx.toast('Summary copied.'); } catch (e) { prompt('Copy the summary', s); } });
    card.querySelectorAll('details.bsec').forEach(d => d.addEventListener('toggle', tailRoom));
    on('#spDelPlan', () => { if (!confirm('Delete ' + pl.name + ' from ' + p.name + '?')) return; p.plans = p.plans.filter(x => x.id !== pl.id); save(p); ctx.closeCard(); ctx.setView('projects'); ctx.toast('Deleted ' + pl.name + ' from ' + p.name + '.'); });
    nums(); tailRoom(); lockRun(); paintMode();
  }
  // Build: the request box with suggestions sized to this site, how to run it (Quick, or AI-reviewed) and whether to fill
  // the rest of the site, then what the request was read as. A suggestion only fills the box; Enter or Build Layouts runs
  // it. Once there are layouts it folds to one line: Built from "…" · Edit request · New request.
  function buildHtml(pl) {
    const off = aiOff(), rev = !off && aiReviewOn(), building = ed.run?.kind === 'build', asked = building ? ed.run.ask : ed.runMeta?.ask || '';
    const why = off ? '<div class="rnote sp-aioff" id="spAiOff">AI isn’t set up on this site</div>' : ''; // the one line that says so (no note repeating it)
    const note = ed.aiNote && !/^AI isn’t set up/.test(ed.aiNote) ? '<div class="rnote sp-ainote" id="spAiNote">' + esc(ed.aiNote) + '</div>' : '';
    const ideas = '<div id="spIdeas">' + ideasHtml() + '</div>';
    if (!ed.buildOpen && asked && (ed.variants || building))
      return '<div class="bsec sp-ai sp-built" id="spAiSec"><div class="lt">Build with AI</div><div class="sp-built-l">' + (building ? 'Building from ' : 'Built from ') + '<q>' + esc(asked) + '</q> <span class="sp-built-a"><button type="button" class="sp-link" data-bedit="1">Edit request</button> · <button type="button" class="sp-link" data-bnew="1">New request</button></span></div>' +
        readHtml(asked) + ideas + note + why + '</div>';
    const acres = SP.ringArea(pl.ring) / 43560, sugs = RUN.presets(acres, SP.edgeLen(pl.ring, pl.front ?? SP.longestEdge(pl.ring)), { aiOff: off });
    return '<div class="bsec sp-ai" id="spAiSec"><div class="sp-ai-h"><label class="lt" for="spAsk">Build with AI</label>' + (asked && ed.variants ? '<button type="button" class="sp-link" data-bfold="1" title="Keep the last request and fold this away">Hide</button>' : '') + '</div>' +
      '<textarea id="spAsk" rows="2" placeholder="What should go here? e.g. ' + esc(sugs[0]?.text || '25,000 sf retail strip') + '">' + esc(ed.ask || '') + '</textarea>' +
      '<div class="sp-sugs" role="group" aria-label="Suggestions for this ' + acres.toFixed(1) + '-acre site">' + sugs.map(x => '<button type="button" class="chip" data-sug="' + esc(x.text) + '" title="Put this in the box; then Build Layouts (or Enter)">' + esc(x.text) + '</button>').join('') + '</div>' +
      '<div class="sp-runopts"><div class="sp-modes" role="radiogroup" aria-label="How to build">' +
        '<button type="button" role="radio" data-rmode="quick" aria-checked="' + !rev + '" title="Layouts in seconds' + (off ? '' : '; the AI reads the request but doesn’t review the layouts') + '"><b>Quick</b><small>seconds</small></button>' +
        '<button type="button" role="radio" data-rmode="ai" aria-checked="' + rev + '"' + (off ? ' disabled title="AI isn’t set up on this site"' : ' title="The AI reviews the layouts as a planner would, and revises the program when they miss"') + '><b>AI-reviewed</b><small>1–2 min</small></button></div>' +
        '<label class="sp-sw" title="What you ask for is Phase 1; the rest of the land holds more of the same as Phase 2. The same setting as under Site parameters."><input type="checkbox" id="spFill"' + (pl.params?.fill !== false ? ' checked' : '') + '> Fill the rest of the site (Phase 2)</label></div>' +
      '<div class="bacts sp-go"><button class="btn askai" id="spGo"><span>Build Layouts</span>' + (off ? '<small>From your words (AI off)</small>' : '') + '</button><button class="btn" id="spBest"' + (off ? ' disabled title="AI isn’t set up on this site"' : ' title="The AI reads what the app knows about this site and its surroundings and suggests what to build"') + '>What Should Go Here?</button></div>' +
      why + (asked && ed.variants ? readHtml(asked) : '') + ideas + note + '</div>';
  }
  // what the last request was read as: the program as chips, anything named in it that the program doesn't have, and Edit
  function readHtml(asked) {
    const R = ed.readAs; if (!R?.chips?.length || R.ask !== asked) return '';
    const tip = R.by === 'ai' ? 'The program the AI made from your request' : 'The program read from your words (without the AI)';
    return '<div class="sp-readas" title="' + tip + '"><span class="sp-ra-l">Read as</span>' + R.chips.map(c => '<span class="sp-rc">' + esc(c) + '</span>').join('') +
      (R.miss || []).map(m => '<span class="sp-rc miss" title="Your request names this, but the program that was laid out doesn’t have it' + (R.by === 'ai' ? '' : ' (without the AI, only sizes, counts, stories and the use are read from the words)') + '">Not understood: ' + esc(m) + '</span>').join('') +
      '<button type="button" class="sp-link" data-raedit="1" title="Put the request back in the box">Edit</button></div>' +
      (R.assumed?.length ? '<div class="rnote sp-assumed">Assumed: ' + R.assumed.map(esc).join(' · ') + '</div>' : '');
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
    each('[data-bfold]', () => { ed.buildOpen = false; panel(); });
    each('[data-rmode]', b => { try { localStorage.setItem('fs-sp-review', b.dataset.rmode === 'ai' ? '1' : '0'); } catch (e) {} panel(); card.querySelector('[data-rmode="' + b.dataset.rmode + '"]')?.focus(); });
    const fl = $('#spFill'); if (fl) fl.onchange = () => { change(x => { x.params = { ...(x.params || {}), fill: fl.checked }; }); if (ed.autoSolve !== false && (pl.recipe || ed.variants)) resolveSoon('Fill the rest of the site ' + (fl.checked ? 'on' : 'off')); }; // the same setting as Settings' "Fill the whole site"
    each('[data-ideas]', b => { ed.ideasOpen = b.dataset.ideas === 'open'; panel(); });
    each('[data-ideaedit]', b => { const it = ed.ideas?.list?.[+b.dataset.ideaedit]; if (it) fillAsk(it.request); });
    each('[data-idea]', b => { const i = +b.dataset.idea, it = ed.ideas?.list?.[i]; if (!it || ed.run) return; ed.ask = it.request; ed.ideas = { ...ed.ideas, used: i }; ed.runSrc = '[data-idea="' + i + '"]'; build(); });
  }
  // room under the last sections, so a chip near the end (Draw) can still bring its section to the top of the card
  function tailRoom() {
    const f = card.querySelector('.sp-foot'), d = card.querySelector('#spDrawSec'), top = card.querySelector(':scope>.top'); if (!f || !d || !top) return;
    f.style.paddingBottom = ''; const need = d.offsetTop - top.offsetHeight - 8 + card.clientHeight - card.scrollHeight;
    if (need > 0) f.style.paddingBottom = Math.ceil(need) + 'px';
  }
  // the site: its parcels, the street sides and entrances, and redrawing it
  function siteHtml(p, pl) {
    const keys = pl.parcels || (pl.parcel ? [pl.parcel] : []), recs = keys.map(k => p.parcels.find(x => x.key === k)).filter(Boolean), on = ed.mode === 'parcels';
    return '<div class="bsec" id="spSiteSec"><div class="lt">Site · ' + recs.length + ' parcel' + (recs.length === 1 ? '' : 's') + ' · ' + (SP.ringArea(pl.ring) / 43560).toFixed(2) + ' ac</div>' +
      (recs.length > 1 ? '<div class="sp-parcels">' + recs.map(r => '<span class="chip">' + esc(r.label) + (r.acres ? ' · ' + r.acres.toFixed(2) + ' ac' : '') + '<button class="sp-x" data-rmp="' + esc(r.key) + '" aria-label="Remove ' + esc(r.label) + ' from the site">×</button></span>').join('') + '</div>' : '') +
      '<div class="sp-tools"><button class="btn" aria-pressed="' + on + '" id="spParcels" title="Click parcels on the map to add them to the site (up to ' + MAXP + ') or take them out">' + (on ? 'Done Adding Parcels' : 'Add or Remove Parcels') + '</button>' +
        '<button class="btn" aria-pressed="' + (ed.mode === 'front') + '" id="spFront" title="Then click the lot line along the street">' + 'Street Side' + '</button><button class="btn" aria-pressed="' + (ed.mode === 'street') + '" id="spStreet" title="A second street along the lot (a corner lot): click its lot line to add it, or again to remove it">' + 'Side Street' + '</button><button class="btn" aria-pressed="' + (ed.mode === 'entrance') + '" id="spEntr" title="A driveway in from the street: click the lot line where it should come in; it runs straight in to the nearest drive">' + 'Add Entrance' + '</button><button class="btn" id="spRedraw">Redraw Site</button></div>' +
      (on ? '<div class="rnote">Click a parcel next to the site to add it, or one in the site to take it out. Small gaps between parcels are closed up; parcels across a road stay separate.</div>' : '') +
      (pl.frontGuess ? '<div class="rnote sp-warn">The street side (orange line) is a guess. Use <b>Street Side</b> to pick the lot line along the street; front setbacks and drives follow it.</div>' : '') + '</div>';
  }
  const num = (k, label, v, step) => '<label>' + label + '<input type="number" inputmode="decimal" min="0" step="' + step + '" data-k="' + k + '" value="' + (v ?? '') + '"></label>';
  const fileName = (p, pl) => (p.name + ' ' + pl.name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'site-plan';

  // ---------- site parameters (like TestFit's): program, unit or home mix, setbacks and buffers, parking, buildings, look ----------
  function paramsHtml(pl, prog) {
    const sb = { ...SP.SETBACKS, ...(pl.setbacks || {}) }, pp = { ...PARAMS, ...(pl.params || {}), style: { ...PARAMS.style, ...(pl.params?.style || {}) } }, u = prog.use;
    const sw = (k, label, on) => '<label class="sp-sw"><input type="checkbox" data-sw="' + k + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';
    const pick = (k, label, v, opts) => '<label>' + label + '<select data-st="' + k + '">' + opts.map(([o, t]) => '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>';
    const mix = u === 'multifamily' ? '<div class="sp-sub">Unit mix</div><table class="sp-mix"><tr><th>Type</th><th>SF</th><th>%</th><th>Beds</th><th></th></tr>' + (prog.mix || SP.UNIT_MIX).map((t, i) =>
      '<tr><td><input data-mix="' + i + ':name" value="' + esc(t.name) + '"></td><td><input type="number" min="250" step="10" data-mix="' + i + ':sf" value="' + t.sf + '"></td><td><input type="number" min="0" max="100" step="1" data-mix="' + i + ':pct" value="' + t.pct + '"></td><td><input type="number" min="0" max="6" step="1" data-mix="' + i + ':beds" value="' + (t.beds ?? 1) + '"></td><td><button class="sp-x" data-mixdel="' + i + '" title="Remove">×</button></td></tr>').join('') +
      '</table><div class="rnote">Average unit ' + f0(prog.unitSf) + ' sf · ' + (prog.mix || SP.UNIT_MIX).reduce((s, t) => s + +t.pct, 0) + '% <button class="sp-link" id="spMixAdd">+ Add a type</button></div>' : '';
    const homes = u === 'sfr' ? '<div class="sp-sub">Home mix</div><div class="sp-grid">' + [1, 2, 3].map(n => { const t = (prog.homeMix || SP.HOME_MIX).find(h => h.stories === n), T = SP.HOME_TYPES[n];
      return '<label>' + n + '-story %<input type="number" min="0" max="100" step="5" data-home="' + n + '" value="' + (t?.pct ?? 0) + '"><small>' + f0(T.sf) + ' sf · ' + T.lotW + ' ft lot</small></label>'; }).join('') + num('lotD', 'Lot depth (ft)', prog.lotD, 5) + '</div>' : '';
    return '<details class="bsec sp-prog" id="spParams"' + (ed.progOpen ? ' open' : '') + '><summary class="lt">Site parameters</summary>' +
      '<div class="sp-sub">Program</div><div class="sp-grid">' +
        '<label>Use<select id="spUse">' + Object.entries(SP.USES).map(([k, x]) => '<option value="' + k + '"' + (k === u ? ' selected' : '') + '>' + x.label + '</option>').join('') + '</select></label>' +
        (u === 'multifamily' ? num('perUnit', 'Parking per unit', prog.perUnit, 0.05) + num('floors', 'Floors', prog.floors, 1) + num('eff', 'Efficiency (net ÷ gross)', prog.eff, 0.01)
          : SP.USES[u]?.garage ? num('perUnit', 'Parking per home', prog.perUnit, 0.25) : num('ratio', 'Parking per 1,000 sf', prog.ratio, 0.1) + num('floors', 'Floors', prog.floors, 1) + num('depth', 'Building depth (ft)', prog.depth, 5)) +
        '</div><div class="sp-grid">' + sw('fill', 'Fill the whole site (what you ask for is Phase 1, the rest more of the same as Phase 2)', pp.fill !== false) + '</div>' + mix + homes + stormHtml(pl, prog, pp) +
      '<div class="sp-sub">Setbacks</div><div class="sp-grid">' + sw('buildOn', 'Building setbacks', sb.buildOn !== false) + sw('paveOn', 'Landscape buffer', sb.paveOn !== false) +
        ['front', 'side', 'rear'].map(k => num('sb-' + k, k[0].toUpperCase() + k.slice(1) + ' building (ft)', sb[k], 1)).join('') +
        [['paveFront', 'Front'], ['paveSide', 'Side'], ['paveRear', 'Rear']].map(([k, l]) => num('sb-' + k, l + ' buffer (ft)', sb[k] ?? sb.paving, 1)).join('') + '</div>' +
      '<div class="sp-sub">Parking</div><div class="sp-grid">' + num('pp-stallW', 'Stall width (ft)', pp.stallW, 0.5) + num('pp-stallD', 'Stall depth (ft)', pp.stallD, 0.5) + num('pp-aisle', 'Drive aisle (ft)', pp.aisle, 1) + '</div>' +
      '<div class="sp-sub">Buildings</div><div class="sp-grid">' + pick('form', 'Building shape', pp.form || 'bar', FORMS.map(([k, t]) => [k, t + (k === 'U' ? ' (apartments, offices)' : k === 'tower' ? ' (4+ floors)' : '')])) + pick('streets', 'Neighbourhood streets', pp.streets || 'curved', [['curved', 'Curving'], ['straight', 'Straight']]) + num('pp-bldgDepth', 'Apartment depth (ft)', pp.bldgDepth, 1) + num('pp-maxLen', 'Longest building (ft)', pp.maxLen, 10) + num('pp-bldgGap', 'Space between (ft)', pp.bldgGap, 1) + '</div>' +
      '<div class="sp-sub">Look</div><div class="sp-grid">' + sw('trees', 'Trees', pp.trees !== false) +
        pick('ponds', 'Ponds and pools', pp.style.ponds, [['organic', 'Natural curves'], ['rounded', 'Rounded rectangles'], ['square', 'Rectangles']]) +
        pick('islands', 'Parking row ends', pp.style.islands, [['rounded', 'Rounded islands'], ['square', 'Square']]) +
        pick('corners', 'Drive corners', pp.style.corners, [['curved', 'Curved'], ['square', 'Square']]) + '</div>' +
      (ed.solveBar ? '<div class="sp-solvebar" id="spSolveBar" role="status"><b>Settings changed.</b> The layout on the map has your changes, so it wasn’t replaced.<span class="btnrow">' + (pl.recipe ? '<button type="button" class="btn sm primary" id="spRefitMine" title="Lay out everything else again with these settings, keeping the pieces you placed">Re-fit around my changes</button>' : '') + '<button type="button" class="btn sm" id="spNewLay" title="New layouts from these settings; the layout on the map, with your changes, is replaced (Undo brings it back)">New layouts (replaces your edits)</button></span></div>' : '') +
      '<div class="bacts" style="padding:8px 0 0"><button class="btn" id="spResolve"' + (pl.recipe || ed.variants ? '' : ' disabled') + ' title="Lays the layouts out again with these settings. It replaces the layout on the map, including any changes you made by hand (Undo brings them back).">New layouts from these settings</button>' + sw('auto', 'New layouts as I change settings (never over your edits)', ed.autoSolve !== false) + '</div>' +
      '<div class="rnote">Typical suburban numbers to start with. Check the city’s or county’s rules (Houston has no zoning but has building lines and parking rules).</div></details>';
  }
  // stormwater (detention, retention, underground or none) and trash enclosures
  function stormHtml(pl, prog, pp) {
    const st = { ...SP.STORM, ...(pp.storm || {}) }, tr = pp.trash || {}, sn = pl.elements?.length ? SP.stormOf(pl) : null;
    const sel = (attr, label, v, opts) => '<label>' + label + '<select ' + attr + '>' + opts.map(([o, t]) => '<option value="' + o + '"' + (o === (v ?? '') ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>';
    const pnum = (k, label, v, step, ph = '') => '<label>' + label + '<input type="number" inputmode="decimal" min="0" step="' + step + '" data-k="' + k + '" value="' + (v ?? '') + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '></label>';
    return '<div class="sp-sub">Stormwater</div><div class="sp-grid">' +
        sel('data-pr="storm"', 'Method', prog.storm, [['', 'Detention pond (default)'], ['retention', 'Retention (wet) pond'], ['underground', 'Underground vaults'], ['none', 'None (regional / small site)']]) +
        pnum('ps-storm.rate', 'Storage (ac-ft per acre)', st.rate, 0.05) + pnum('ps-storm.depth', 'Pond depth (ft)', st.depth, 0.5) + pnum('detentionPct', 'Pond size (% of site)', prog.detentionPct, 1, 'from storage') + '</div>' +
        (sn ? '<div class="rnote">' + (sn.mode === 'none' ? 'No on-site storage.' : 'Needs about ' + sn.volume.toFixed(1) + ' acre-feet for ' + sn.acres.toFixed(1) + ' developed acres' + (sn.mode === 'underground' ? ', all in vaults under the parking.' : '; pond drawn ' + (sn.pond / 43560).toFixed(2) + ' ac' + (sn.vault > 0.05 ? ', about ' + sn.vault.toFixed(1) + ' ac-ft more would go underground.' : '.'))) + ' Local drainage rules (Harris County, the city) set the real number.</div>' : '') +
      '<div class="sp-sub">Trash</div><div class="sp-grid">' + sel('data-ps="trash.mode"', 'Enclosures', tr.mode || (SP.normalizeProgram(pl.program).trash ? 'commercial' : 'none'), [['none', 'None (add by hand, or ask for them)'], ['commercial', 'Shops, restaurants, offices'], ['auto', 'Every building by the rules']]) +
        pnum('ps-trash.perUnits', 'Apartments per enclosure', tr.perUnits ?? 50, 5) + pnum('ps-trash.perSf', 'Commercial sf per enclosure', tr.perSf ?? 25000, 1000) + '</div>' +
      '<div class="rnote">Homes roll carts to the curb. Apartments: a double enclosure (trash and recycling) per about 50 units, a compactor from 200. Shops and offices: one per about 25,000 sf, none more than about 250 ft away. Add or move them with Draw.</div>';
  }
  function wireParams(pl) {
    const $ = s => card.querySelector(s), after = i => { if (ed.autoSolve !== false && (pl.recipe || ed.variants)) resolveSoon(i && settingLabel(i)); };
    $('.sp-prog').ontoggle = e => { ed.progOpen = e.target.open; };
    $('#spUse').onchange = e => { change(x => { x.program = { ...x.program, use: e.target.value, ratio: null, perUnit: null, floors: null, depth: null, truck: null, mix: null, homeMix: null }; }); after(e.target); };
    card.querySelectorAll('.sp-prog input[data-k]').forEach(i => i.onchange = () => { change(x => { const k = i.dataset.k, v = i.value === '' ? null : +i.value;
      if (k.startsWith('sb-')) x.setbacks = { ...SP.SETBACKS, ...(x.setbacks || {}), [k.slice(3)]: v ?? SP.SETBACKS[k.slice(3)] ?? x.setbacks?.paving };
      else if (k.startsWith('pp-')) x.params = { ...(x.params || {}), [k.slice(3)]: v };
      else if (k.startsWith('ps-')) { const [g, f] = k.slice(3).split('.'); x.params = { ...(x.params || {}), [g]: { ...(x.params?.[g] || {}), [f]: v } }; }
      else x.program = { ...x.program, [k]: v }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-sw]').forEach(i => i.onchange = () => { const k = i.dataset.sw;
      if (k === 'auto') { ed.autoSolve = i.checked; return; }
      change(x => { if (k === 'trees' || k === 'fill') x.params = { ...(x.params || {}), [k]: i.checked }; else x.setbacks = { ...SP.SETBACKS, ...(x.setbacks || {}), [k]: i.checked }; }); if (k !== 'trees') after(i); });
    card.querySelectorAll('.sp-prog [data-pr]').forEach(i => i.onchange = () => { change(x => { x.program = { ...x.program, [i.dataset.pr]: i.value || null }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-ps]').forEach(i => i.onchange = () => { const [g, f] = i.dataset.ps.split('.'); change(x => { x.params = { ...(x.params || {}), [g]: { ...(x.params?.[g] || {}), [f]: i.value } }; }); after(i); });
    card.querySelectorAll('.sp-prog [data-st]').forEach(i => i.onchange = () => { change(x => { x.params = i.dataset.st === 'form' || i.dataset.st === 'streets' ? { ...(x.params || {}), [i.dataset.st]: i.value } : { ...(x.params || {}), style: { ...(x.params?.style || {}), [i.dataset.st]: i.value } }; }); after(i); });
    const mixOf = x => clone(SP.normalizeProgram(x.program).mix || SP.UNIT_MIX);
    card.querySelectorAll('[data-mix]').forEach(i => i.onchange = () => { const [n, f] = i.dataset.mix.split(':'); change(x => { const m = mixOf(x); m[+n][f] = f === 'name' ? i.value : +i.value; x.program = { ...x.program, mix: m }; }); after(i); });
    card.querySelectorAll('[data-mixdel]').forEach(b => b.onclick = () => { change(x => { const m = mixOf(x); m.splice(+b.dataset.mixdel, 1); x.program = { ...x.program, mix: m }; }); after(); });
    const add = $('#spMixAdd'); if (add) add.onclick = () => change(x => { const m = mixOf(x); m.push({ name: 'New', sf: 900, pct: 0, beds: 2 }); x.program = { ...x.program, mix: m }; });
    card.querySelectorAll('[data-home]').forEach(i => i.onchange = () => { change(x => { const m = clone(SP.normalizeProgram(x.program).homeMix || SP.HOME_MIX), t = m.find(h => h.stories === +i.dataset.home); if (t) t.pct = +i.value; else m.push({ stories: +i.dataset.home, pct: +i.value }); x.program = { ...x.program, homeMix: m }; }); after(i); });
    const rs = $('#spResolve'); if (rs) rs.onclick = () => resolve({ force: true });
    const rm = $('#spRefitMine'); if (rm) rm.onclick = () => { ed.solveBar = false; refitNow(true); };
    const nl = $('#spNewLay'); if (nl) nl.onclick = () => resolve({ force: true, src: '#spNewLay' });
  }
  // a setting as words for the toast after new layouts: "Front setback 35 ft", "Floors 4", "Trees off"
  function settingLabel(i) {
    const lab = i.closest('label'), t = (lab ? [...lab.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ') : '').replace(/\s+/g, ' ').trim(), k = i.dataset.k || '';
    const v = i.type === 'checkbox' ? (i.checked ? 'on' : 'off') : i.tagName === 'SELECT' ? i.selectedOptions[0]?.textContent || i.value : i.value;
    if (k.startsWith('sb-')) return t.replace(/ building \(ft\)/, ' setback').replace(/ \(ft\)/, '') + ' ' + v + ' ft';
    const unit = /\(ft\)/.test(t) ? ' ft' : /\(%\)/.test(t) ? '%' : '';
    return (t.replace(/\s*\((?:ft|%)\)/, '') || 'Setting') + ' ' + v + unit;
  }
  // re-fit: everything not pinned is laid out again around the pinned pieces
  let refitTimer = 0;
  // a local edit: the piece stays where it was put and parking under it gives way (whole stalls); nothing else moves.
  // Laying out everything else again is the Re-fit Plan button's job, never automatic.
  // delete a piece; the rest of a parking row it was part of stays as it is now (it doesn't grow back over the gap)
  function dropEl(x, el) { const k = el.ext && JSON.stringify(el.ext); x.elements = x.elements.filter(y => y.id !== el.id); if (k) for (const y of x.elements) if (y.ext && JSON.stringify(y.ext) === k) delete y.ext; }
  // left: where it was (and what moved with it); parking it had cut there grows back
  function makeRoom(el, left = []) {
    const pl = PL(); if (!pl || !el || el.kind === 'parking' || el.kind === 'green' || el.kind === 'lot' || el.kind === 'trail') return;
    const pad = el.kind === 'building' || el.kind === 'garage' ? 5 : 1, spare = pl.spareRows = (pl.spareRows || []).slice(-40); // rows cut away whole, kept to grow back
    pl.elements = SP.cutRows(pl.elements, SP.outline(el), pad, spare);
    for (const o of left) pl.elements = SP.regrowRows(pl.elements, SP.outline(o), 5, spare);
  }
  function refitSoon() { clearTimeout(refitTimer); refitTimer = setTimeout(() => { const pl = PL(), el = pl?.elements.find(x => x.id === ed.sel); if (!el) return; makeRoom(el, ed.nudged || []); ed.nudged = null; pl.updated = new Date().toISOString(); save(P()); draw(); panel(); }, 250); }
  async function refitNow(asked) {
    const pl = PL(); if (!pl?.recipe) return;
    let r = null; ctx.toast('Re-fitting the plan around the pieces you placed…'); try { r = await laid('refit', pl); } catch (err) { console.warn('refit', err); } if (PL() !== pl) return;
    if (!r) { if (asked) ctx.toast('Couldn’t re-fit the plan around that; it stays as you left it.'); return; }
    pl.elements = r.elements; pl.spareRows = []; if (r.recipe) pl.recipe = clone(r.recipe); markEdited(pl); ed.solveBar = false; ed.refitNote = r.notes.join(' '); if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null;
    pl.updated = new Date().toISOString(); save(P()); draw(); panel();
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
    const before = pl.elements.some(e => e.kind === 'building') ? SP.metrics(pl) : null, was = pl.variant ? { ...pl.variant } : null, hadAi = !!ed.variants?.some(v => v.ai);
    const run = startRun('resolve', ['Laying out new layouts with these settings'], o.src || '#spResolve'); if (!run) return;
    let out = []; try { out = await laid('options', { ...pl }, pl.program, { count: ed.variants?.length > 3 ? 12 : 3 }); } catch (e) { console.warn('layout', e); }
    if (!live(run) || PL() !== pl) return;
    const variants = named(out, { ...pl });
    if (!variants.some(v => v.elements.length)) { endRun(run); ctx.toast('Nothing fits with these settings.'); return; }
    run.applied = true; ed.variants = variants; ed.reviewCleared = hadAi; ed.runMeta = { ask: ed.runMeta?.ask || pl.lastRun?.ask || '', at: new Date().toISOString() };
    if (hadAi) { ed.aiNote = 'Settings changed: AI review cleared.'; ed.aiSummary = ''; ed.aiPick = null; }
    const r = RUN.matchLayout(variants, was?.key, was?.name);
    const ok = await useVariant(r.index >= 0 ? r.index : variants.findIndex(v => v.elements.length)); endRun(run); if (!ok) return;
    const now = PL()?.variant, lost = was?.key && !r.exact ? numOf(was) + ' no longer fits; showing the nearest (' + numOf(now) + '). ' : '';
    const depth = ed.undo.length, back = () => { if (!ed || PL() !== pl) return; if (mark != null && ed.undo.length === depth) { while (ed.undo.length > mark) undo(true); } else undo(true); }; // the new layout and, after a setting change, the setting
    ctx.toast(lost + RUN.deltaText(label || 'New settings', before, SP.metrics(PL())), { action: { label: 'Undo', run: back } });
  }

  function selHtml(e, prog) {
    if (!e) return '<div class="lt">Selected</div><div class="rnote">' + (ed.editing ? 'Click a piece of the plan to move it. Drag a white corner to resize it, the green dot to turn it; it lines up with its neighbours and stays out of the setbacks (hold Alt to move it freely). Arrow keys nudge it, R turns it 90°, Delete removes it. Only that piece moves; parking under a building gives way.' : 'Click a piece of the plan to see it. Use <b>Edit Layout</b> to move, resize or turn pieces.') + '</div>';
    const free = SP.isFree(e);
    return '<div class="lt">' + esc(SP.KINDS[e.kind]?.label || e.kind) + (free ? ' · curved' : '') + '</div><fieldset class="sp-fs"' + (ed.editing ? '' : ' disabled') + ' style="border:0;padding:0;margin:0;min-width:0"><div class="sp-grid">' +
      (free ? '' : '<label>Width (ft)<input type="number" min="8" step="1" data-e="w" value="' + Math.round(e.w) + '"></label><label>Depth (ft)<input type="number" min="8" step="1" data-e="d" value="' + Math.round(e.d) + '"></label>' +
      '<label>Turn (°)<input type="number" step="1" data-e="rot" value="' + ((Math.round(e.rot || 0) % 360 + 360) % 360) + '"></label>') +
      (e.kind === 'building' ? '<label>Floors<input type="number" min="1" max="40" step="1" data-e="floors" value="' + (e.floors || 1) + '"></label>' +
        '<label>Use<select data-use="1">' + Object.entries(SP.USES).map(([k, u]) => '<option value="' + k + '"' + (k === (e.use || prog.use) ? ' selected' : '') + '>' + u.label + '</option>').join('') + '</select></label>' +
        (SP.USES[e.use || prog.use]?.garage ? '<label>Homes<input type="number" min="1" max="40" step="1" data-e="units" value="' + (e.units || 1) + '"></label>' : '') +
        '<label>Building shape<select data-form="1">' + FORMS.map(([k, t]) => '<option value="' + k + '"' + ((e.form || 'bar') === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
        (e.form === 'tower' ? '<label>Podium floors<input type="number" min="1" max="6" step="1" data-e="podium" value="' + (e.podium || 2) + '"></label>' : '') : '') +
      (e.kind === 'garage' ? '<label>Levels<input type="number" min="1" max="12" step="1" data-e="levels" value="' + (e.levels || 4) + '"></label>' : '') +
      (['pond', 'pool', 'green', 'plaza', 'court'].includes(e.kind) ? '<label>Shape<select data-shape="1">' + [['organic', 'Natural curves'], ['rounded', 'Rounded rectangle'], ['square', 'Rectangle']].map(([k, t]) => '<option value="' + k + '"' + ((e.poly ? 'organic' : e.shape === 'round' ? 'rounded' : 'square') === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' : '') +
      (e.kind === 'building' ? '<label class="sp-wide">Type<select data-type="1">' + (e.type ? '' : '<option value="" selected>Custom (drawn or sized by hand)</option>') + typeOptions(e.type || '') + '</select></label>' : '') +
      '<label class="sp-wide">Name<input type="text" maxlength="40" data-name="1" value="' + esc(e.name || '') + '" placeholder="e.g. Building B, Pad A"></label>' +
      '</div><div class="rnote" id="spRead"></div>' + (!ed.editing ? '<div class="rnote">Use <b>Edit Layout</b> to change it.</div>' : PL()?.recipe ? '<div class="rnote">' + (e.pinned ? '📌 Placed by you: <b>Re-fit Plan</b> keeps it and lays out the rest again around it. <button class="sp-link" id="spUnpin">Let it move</button>' : 'Move or resize it and only it changes. <b>Re-fit Plan</b> lays out the rest again around the pieces you placed.') + '</div>' : '') +
      '<div class="bacts" style="padding:8px 0 0">' + (free ? '' : '<button class="btn" id="spRot">Turn 90°</button>') + (SHAPEABLE.includes(e.kind) ? '<button class="btn" id="spShape" aria-pressed="' + (ed.shape === e.id) + '" title="Drag its points; drag a blue + to add a point; double-click a point to remove it">' + (ed.shape === e.id ? 'Done Shaping' : 'Edit Shape') + '</button>' : '') + (PL()?.recipe ? '<button class="btn" id="spRefit" title="Lay out everything else again around the pieces you placed">Re-fit Plan</button>' : '') + '<button class="btn" id="spDup">Copy</button><button class="btn" id="spAskSel" title="Say what to change about this piece">Change With AI</button><button class="btn sp-del" id="spDel">Delete</button></div></fieldset>';
  }
  function readout(e) {
    const el = card.querySelector('#spRead'); if (!el || !e) return;
    el.textContent = e.kind === 'building' ? f0(SP.footArea(e)) + ' sf footprint · ' + f0(SP.gfaOf(e)) + ' sf total' : e.kind === 'parking' ? SP.stalls(e).count + ' spaces (9 × 18 ft stalls, 24 ft aisles)' : e.kind === 'pond' ? (SP.elArea(e) / 43560).toFixed(2) + ' acres' : f0(SP.elArea(e)) + ' sf' + (SP.isFree(e) ? ' · drag to move it' : '');
    for (const k of ['w', 'd']) { const i = card.querySelector('[data-e="' + k + '"]'); if (i && document.activeElement !== i) i.value = Math.round(e[k]); }
    const r = card.querySelector('[data-e="rot"]'); if (r && document.activeElement !== r) r.value = (Math.round(e.rot || 0) % 360 + 360) % 360;
    if (!drag) nums();
  }
  function wireSel(e) {
    if (!e) return; readout(e);
    card.querySelectorAll('[data-e]').forEach(i => i.onchange = () => { const v = +i.value; if (!isFinite(v)) return; change(() => { const k = i.dataset.e; e[k] = k === 'floors' || k === 'units' || k === 'levels' || k === 'podium' ? Math.max(1, Math.round(v)) : k === 'rot' ? ((v % 360) + 360) % 360 : Math.max(8, v); e.pinned = true; }, true); readout(e); refitSoon(); });
    card.querySelector('[data-shape]')?.addEventListener('change', ev => { change(() => { SP.reshape(e, ev.target.value); e.pinned = true; }); refitSoon(); });
    const up1 = card.querySelector('#spUnpin'); if (up1) up1.onclick = () => change(() => { delete e.pinned; });
    const rf = card.querySelector('#spRefit'); if (rf) rf.onclick = () => refitNow(true);
    card.querySelector('[data-type]')?.addEventListener('change', ev => { const t = typeById(ev.target.value); if (!t) return; change(() => { const keep = { id: e.id, name: e.name, rot: e.rot }; for (const k of ['poly', 'form', 'wing', 'podium', 'unitW', 'sf', 'units', 'jog', 'shape']) delete e[k]; Object.assign(e, fromType(t, [e.x, e.y], e.rot || 0), keep, { pinned: true }); makeRoom(e); }); ed.shape = null; draw(); panel(); }); // the same spot, another building from the library
    card.querySelector('[data-use]')?.addEventListener('change', ev => change(() => { e.use = ev.target.value; }));
    card.querySelector('[data-form]')?.addEventListener('change', ev => { change(() => { const f = ev.target.value; if (f === 'bar') delete e.form; else e.form = f; if (f === 'tower') { e.podium = e.podium || 2; e.floors = Math.max(e.floors || 1, 8); } if ((f === 'L' || f === 'U') && e.d < 100) e.d = Math.min(150, e.d * 2); e.pinned = true; }); panel(); refitSoon(); });
    card.querySelector('[data-name]')?.addEventListener('change', ev => change(() => { e.name = ev.target.value.trim().slice(0, 40); }, true));
    if (card.querySelector('#spRot')) card.querySelector('#spRot').onclick = () => turnEl(e);
    const shp = card.querySelector('#spShape'); if (shp) shp.onclick = () => { // its outline as points to drag: any shape, in plan
      if (ed.shape === e.id) { ed.shape = null; draw(); panel(); return; }
      change(() => { if (!e.poly) { e.poly = SP.outline(e).map(q => q.map(v => +v.toFixed(2))); delete e.form; delete e.jog; delete e.shape; delete e.path; } e.pinned = true; }); ed.shape = e.id; draw(); panel(); };
    const as = card.querySelector('#spAskSel'); if (as) as.onclick = () => { const ta = card.querySelector('#spChg'); if (!ta) return; ta.scrollIntoView({ block: 'center' }); ta.focus(); };
    card.querySelector('#spDup').onclick = () => { const c = { ...clone(e), id: uid() }, a = (e.rot || 0) * Math.PI / 180, off = e.w + 20; SP.moveBy(c, off * Math.cos(a), off * Math.sin(a)); change(x => x.elements.push(c)); ed.sel = c.id; draw(); panel(); };
    card.querySelector('#spDel').onclick = () => delEl(e);
  }
  // Numbers: one grid of tiles, the zoning limit beside its figure; with a Phase 2, Phase 1 and the full site side by side
  function nums() {
    const el = card.querySelector('#spNums'), pl = PL(); if (!el || !pl) return;
    if (pl.ring.length < 3) { el.innerHTML = ''; return; }
    const m = SP.metrics(pl), issues = SP.check(pl), prog = SP.normalizeProgram(pl.program), z = pl.zoning || {}, ph = pl.elements.some(e => e.phase === 2);
    const m1 = ph ? SP.metrics({ ...pl, elements: pl.elements.filter(e => e.phase !== 2) }) : null;
    const tile = (k, v, sub, cls = '') => '<div class="sp-tile' + cls + '"><span>' + k + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    const two = (k, f, sub, cls = '') => m1 ? '<div class="sp-tile two' + cls + '"><span>' + k + '</span><div class="sp-tv"><b>' + f(m1) + '<small>Phase 1</small></b><b>' + f(m) + '<small>Full site</small></b></div>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' : tile(k, f(m), sub, cls);
    const max = (v, lim, fmt) => +lim ? ' <span class="sc' + (v > +lim ? ' over' : '') + '">/ max ' + fmt(+lim) + '</span>' : '';
    const ratioAt = new Set(pl.elements.filter(e => e.kind === 'building').map(e => e.use || prog.use)).size > 1 ? 'each use’s ratio' : prog.use === 'multifamily' ? prog.perUnit + '/unit' : prog.ratio + '/1,000 sf';
    const homes = pl.elements.filter(e => e.kind === 'building' && e.use === 'sfr'), byStory = [1, 2, 3].map(n => [n, homes.filter(e => e.floors === n).length]).filter(([, c]) => c);
    el.innerHTML = '<div class="lt">Numbers</div>' + (m1 ? '<div class="rnote">Phase 1 is what was asked for; the full site includes Phase 2. Parking, paving and ponds are counted for the whole site.</div>' : '') + '<div class="sp-tiles">' +
      tile('Site', m.acres.toFixed(2) + ' ac', f0(m.siteSf) + ' sf') +
      two('Floor area', x => x.gfa ? f0(x.gfa) + ' sf' : '—', m.gfa ? plural(m.buildings, 'building') + (m.nrsf ? ' · ' + f0(m.nrsf) + ' net rentable' : '') : '') +
      (m.units ? two('Units', x => f0(x.units || 0), m.duAc.toFixed(1) + ' per acre' + (m.beds ? ' · ' + f0(m.beds) + ' beds' : '')) : '') +
      two('Coverage', x => pct(x.coverage) + (x === m ? max(m.coverage * 100, z.max_coverage_pct, v => v + '%') : ''), '', +z.max_coverage_pct && m.coverage * 100 > +z.max_coverage_pct ? ' bad' : '') +
      two('FAR', x => x.far.toFixed(2) + (x === m ? max(m.far, z.max_far, v => String(v)) : ''), '', +z.max_far && m.far > +z.max_far ? ' bad' : '') +
      tile('Parking', f0(m.spaces) + ' / ' + f0(m.required), (m.gfa ? 'needed at ' + ratioAt + ' · ' : '') + (m.units ? m.perUnit.toFixed(2) + ' / unit' : m.per1k.toFixed(1) + ' / 1,000 sf') + (m.garages ? ' · ' + f0(m.garages) + ' in garages' : ''), m.gfa && m.spaces < m.required ? ' bad' : '') +
      tile('Detention', m.pond ? (m.pond / 43560).toFixed(2) + ' ac' : '—', m.pond ? pct(m.pond / m.siteSf) + ' of the site' : '') +
      tile('Paved + roofs', pct(m.impervious)) + tile('Open space', pct(m.green)) +
      (m.heightFt ? tile('Height', 'about ' + m.heightFt + ' ft', +z.max_building_height_ft ? 'max ' + z.max_building_height_ft + ' ft' : '', +z.max_building_height_ft && m.heightFt > +z.max_building_height_ft ? ' bad' : '') : '') + '</div>' +
      (m.mix.length ? '<table class="sp-mixt"><tr><th>Unit</th><th>SF</th><th>Units</th><th>%</th><th>Net sf</th></tr>' + m.mix.map(t => '<tr><td>' + esc(t.name) + '</td><td>' + f0(t.sf) + '</td><td>' + f0(t.n) + '</td><td>' + pct(t.n / Math.max(1, m.mix.reduce((s, x) => s + x.n, 0))) + '</td><td>' + f0(t.n * t.sf) + '</td></tr>').join('') + '</table>' : '') +
      (byStory.length ? '<table class="sp-mixt"><tr><th>Home</th><th>Living sf</th><th>Homes</th></tr>' + byStory.map(([n, c]) => '<tr><td>' + n + '-story</td><td>' + f0(SP.HOME_TYPES[n].sf) + '</td><td>' + c + '</td></tr>').join('') + '</table>' : '') +
      (issues.length ? '<ul class="sp-issues">' + issues.map(i => '<li class="' + i.level + '">' + esc(i.text) + '</li>').join('') + '</ul>' : m.gfa ? '<div class="rnote sp-ok">Fits the setbacks' + (m.spaces >= m.required ? ' and parks' : '') + '.</div>' : '') +
      '<div class="rnote">A planning sketch from the parcel outline: not a survey, and no engineering (grading, utilities, fire lanes, code review).</div>';
  }

  // ---------- pro forma ----------
  const landGuess = (p, pl) => { const recs = (pl.parcels || (pl.parcel ? [pl.parcel] : [])).map(k => p.parcels.find(x => x.key === k)).filter(Boolean), v = recs.map(r => r.marketValue || r.landValue);
    return recs.length && v.every(x => +x > 0) ? Math.round(v.reduce((s, x) => s + +x, 0)) : null; };
  const pfMerge = (d, o) => { const out = { ...d }; for (const [k, v] of Object.entries(o || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(d[k] || {}), ...v } : v; return out; };
  function pfRun(p, pl) { if (!pl.elements.some(e => e.kind === 'building')) return null; const d = PF.defaults(pl, landGuess(p, pl)); return PF.run(pl, pfMerge(d, pl.pf)); }
  function pfHtml(p, pl) {
    let R = null; try { R = pfRun(p, pl); } catch (e) { console.warn('pro forma', e); }
    if (!R) return '<details class="bsec sp-pf" id="spPfSec"><summary class="lt">Pro forma</summary><div class="rnote">Lay out a plan first (Build Layouts or by hand); the pro forma reads its buildings, units and parking.</div></details>';
    const A = R.A, $m = v => v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + 'M' : f0(Math.abs(v))), pc2 = v => v == null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(2) + '%';
    const inp = (k, label, v, step, unit) => '<label>' + label + '<input type="number" step="' + step + '" data-pf="' + k + '" value="' + (v ?? '') + '">' + (unit ? '<small>' + unit + '</small>' : '') + '</label>';
    const card1 = (k, v, sub, bad, subBad) => '<div class="sp-card"><span>' + k + '</span><b' + (bad ? ' class="neg"' : '') + '>' + v + '</b>' + (sub ? '<small' + (subBad ? ' class="neg"' : '') + '>' + sub + '</small>' : '') + '</div>', uses = Object.keys(R.P.uses), res = R.returns, S1 = R.simple, simpleOn = A.method === 'simple';
    const homes = uses.some(u => ['townhomes', 'duplex', 'sfr'].includes(u)), mf = uses.includes('multifamily'), units = R.P.units || 0;
    const sch = R.sched, tot = Math.max(1, sch.total), seg = (n, cls, t) => n > 0 ? '<i class="' + cls + '" style="flex:' + n + '" title="' + t + ': ' + n + ' months">' + n + '</i>' : '';
    return '<details class="bsec sp-pf" id="spPfSec"' + (ed.pfOpen ? ' open' : '') + '><summary class="lt">Pro forma</summary>' +
      '<div class="sp-grid"><label>Method<select data-pfs="method"><option value="schedule"' + (simpleOn ? '' : ' selected') + '>Month by month, with the schedule</option><option value="simple"' + (simpleOn ? ' selected' : '') + '>TestFit method (annual, no schedule)</option></select></label>' +
        (homes && !mf ? '<label class="sp-sw"><input type="checkbox" data-pfb="forSale"' + (A.forSale ? ' checked' : '') + '> Homes for sale (not rent)</label>' : '') + '</div>' +
      '<div class="sp-sched" title="Schedule in months">' + seg(sch.pre, 'pre', 'Pre-development') + seg(sch.build, 'bld', 'Construction') + seg(sch.lease, 'lease', R.forSale ? 'Sales' : 'Lease-up') + seg(sch.total - sch.toStabilize, 'hold', 'Hold') + '</div>' +
      '<div class="rnote">Design &amp; permits ' + sch.pre + ' mo · construction ' + sch.build + ' mo · ' + (R.forSale ? 'sales ' : 'lease-up ') + sch.lease + ' mo' + (R.forSale ? '' : ' · stabilized at month ' + sch.toStabilize + ' · sale at month ' + sch.total) + '</div>' +
      (simpleOn ? '<div class="sp-cards">' + card1('Total cost', $m(S1.cost)) + card1('NOI', $m(S1.noi)) + card1('Yield on cost', pc2(S1.yoc)) + card1('Value', $m(S1.value)) + card1('Unlevered IRR', pc2(S1.unlevIrr)) + card1('Levered IRR', pc2(S1.levIrr)) + card1('Equity multiple', isFinite(S1.multiple) ? S1.multiple.toFixed(2) + 'x' : '—') + card1('DSCR', S1.dscr.toFixed(2) + 'x') + '</div>' +
        '<div class="rnote sp-warn">This is TestFit’s one-page method: all the money goes in at year 0 and full rents start in year 1, with no construction period, interest or lease-up, so it overstates returns. The month-by-month method on the same plan ' + (res.levIrr != null && isFinite(res.levIrr) ? 'gives a levered IRR of ' + pc2(res.levIrr) : 'has no positive cash flow to compute an IRR') + '.</div>'
      : '<div class="sp-cards">' + card1('Total cost', $m(R.budget.total), units ? $m(R.budget.total / units) + ' / unit' : $m(R.budget.total / Math.max(1, R.P.gsf)) + ' / sf') +
        (R.forSale ? card1('Home sales', $m(R.exit.sales)) + card1('Margin', pc2(res.margin), '', res.margin < 0) : card1('Stabilized NOI', $m(R.ops.noi)) + card1('Yield on cost', pc2(res.yoc), 'spread ' + pc2(res.spread), res.yoc < 0, res.spread < 0) + card1('Stabilized value', $m(res.value))) +
        card1('Profit', $m(res.profit), '', res.profit < 0) + card1('Unlevered IRR', pc2(res.unlevIrr)) + card1('Levered IRR', pc2(res.levIrr)) + card1('Equity multiple', res.multiple ? res.multiple.toFixed(2) + 'x' : '—') + card1('Peak equity', $m(res.peakEquity)) + (res.dscr ? card1('DSCR', res.dscr.toFixed(2) + 'x') : '') + '</div>' +
        '<div class="rnote">The TestFit one-page method on the same numbers ' + (S1.levIrr != null && isFinite(S1.levIrr) ? 'reads ' + pc2(S1.levIrr) + ' levered' : 'has no positive cash flow to compute an IRR') + ': it skips the ' + sch.toStabilize + ' months before the project is stabilized.</div>') +
      '<table class="sp-mixt"><tr><th>Budget</th><th>Amount</th><th>' + (units ? 'Per unit' : 'Per sf') + '</th></tr>' + [['Land', R.budget.land], ['Hard costs', R.budget.hard], ['Site work & parking', R.budget.site], ...(R.budget.storm > 0 ? [['· incl. ' + R.budget.vaultAcFt.toFixed(1) + ' ac-ft underground storage', R.budget.storm]] : []), ['Tenant improvements', R.budget.ti], ['Soft costs', R.budget.soft], ['Contingency', R.budget.cont], ['Developer fee', R.budget.fee], ['Construction interest', R.budget.interest], ['Loan fees', R.budget.loanFees], ['Total', R.budget.total]].filter(([, v]) => v > 0).map(([k, v]) => '<tr><td>' + k + '</td><td>' + $m(v) + '</td><td>' + $m(units ? v / units : v / Math.max(1, R.P.gsf)) + '</td></tr>').join('') + '</table>' +
      (R.forSale ? '' : '<table class="sp-mixt"><tr><th>Stabilized year</th><th>Amount</th></tr>' + R.ops.lines.map(l => '<tr><td>' + esc(l.k) + '</td><td>' + $m(l.v) + '</td></tr>').join('') +
        '<tr><td>Vacancy &amp; credit loss</td><td>' + $m(-R.ops.loss) + '</td></tr><tr><td>Operating expenses (taxes ' + $m(R.ops.tax) + ')</td><td>' + $m(-R.ops.opex) + '</td></tr><tr><td><b>Net operating income</b></td><td><b>' + $m(R.ops.noi) + '</b></td></tr></table>') +
      '<div class="sp-sub">Assumptions</div><div class="sp-grid">' + inp('landPrice', 'Land price ($)', A.landPrice, 10000, landGuess(p, pl) ? 'appraised value' : 'about $175k/ac; set yours') +
        uses.map(u => inp('hard.' + u, SP.USES[u].label + ' hard cost', A.hard[u], 1, '$ / gross sf')).join('') + (homes ? inp('lotCost', 'Finished lot ($)', A.lotCost, 1000) : '') + inp('siteWorkPsf', 'Site work', A.siteWorkPsf, 0.5, '$ / site sf') + (R.budget.storm > 0 ? inp('vaultPerAcFt', 'Underground storage', A.vaultPerAcFt, 5000, '$ / acre-foot') : '') +
        inp('softPct', 'Soft costs (%)', A.softPct, 0.5) + inp('contPct', 'Contingency (%)', A.contPct, 0.5) + inp('feePct', 'Developer fee (%)', A.feePct, 0.5) +
        Object.entries(A.rents).map(([k, v]) => inp('rents.' + k, k + ' rent', v, 5, '$ / month')).join('') +
        (homes ? (A.forSale ? inp('salePsf.sfr', 'Home price', A.salePsf.sfr, 1, '$ / living sf') + inp('absorption', 'Sales pace', A.absorption, 1, 'homes / month') : (R.P.uses.sfr ? [1, 2, 3].filter(n => R.P.uses.sfr.homes[n]).map(n => inp('homeRent.sfr' + n, n + '-story home rent', A.homeRent['sfr' + n], 25, '$ / month')).join('') : '') + ['townhomes', 'duplex'].filter(k => R.P.uses[k]).map(k => inp('homeRent.' + k, SP.USES[k].label + ' rent', A.homeRent[k], 25, '$ / month')).join('')) : '') +
        Object.entries(A.commRent).map(([k, v]) => inp('commRent.' + k, SP.USES[k].label + ' rent', v, 0.5, '$ / sf / yr NNN')).join('') + (units ? inp('otherPerUnit', 'Other income', A.otherPerUnit, 5, '$ / unit / month') : '') +
        inp('vacancyPct', 'Vacancy (%)', A.vacancyPct, 0.5) + (units ? inp('opexPerUnit', 'Operating costs', A.opexPerUnit, 50, '$ / unit / yr, before taxes') : '') + inp('taxPct', 'Property tax rate (%)', A.taxPct, 0.05) +
        inp('ltc', 'Loan to cost (%)', A.ltc, 1) + inp('rate', 'Construction rate (%)', A.rate, 0.05) + inp('permRate', 'Permanent rate (%)', A.permRate, 0.05) + inp('amort', 'Amortization (yrs)', A.amort, 1) +
        inp('marketCap', 'Market cap rate (%)', A.marketCap, 0.05) + inp('exitCap', 'Exit cap rate (%)', A.exitCap, 0.05) + inp('rentGrowth', 'Rent growth (%/yr)', A.rentGrowth, 0.1) + inp('expGrowth', 'Expense growth (%/yr)', A.expGrowth, 0.1) + inp('hold', 'Hold after stabilizing (yrs)', A.hold, 1) +
        inp('sched.pre', 'Design & permits (mo)', sch.pre, 1) + inp('sched.build', 'Construction (mo)', sch.build, 1) + inp('sched.lease', (R.forSale ? 'Sales' : 'Lease-up') + ' (mo)', sch.lease, 1) + '</div>' +
      '<div class="bacts" style="padding:8px 0 0"><button class="btn askai" id="spPfX" title="Assumptions, the one-page pro forma with live formulas, the month-by-month model and the budget">Pro Forma (Excel)</button><button class="btn" id="spPfReset">Reset to Defaults</button></div>' +
      '<div class="rnote">Typical Houston-area numbers to start with, not quotes: check costs with a contractor and rents with a market study.</div></details>';
  }
  function wirePf(p, pl) {
    const box = card.querySelector('.sp-pf'); if (!box) return; box.ontoggle = () => { ed.pfOpen = box.open; };
    const set = (k, v) => { change(x => { const pf = { ...(x.pf || {}) }, [a, b] = k.split('.'); if (b) pf[a] = { ...(pf[a] || {}), [b]: v }; else pf[a] = v; x.pf = pf; }, true); refreshFin(); }; // the layouts' money follows
    const redraw = () => { const el = card.querySelector('#spPf'); if (el) { el.innerHTML = pfHtml(p, PL()); wirePf(p, PL()); } };
    box.querySelectorAll('[data-pf]').forEach(i => i.onchange = () => { if (i.value === '') return; set(i.dataset.pf, +i.value); redraw(); });
    box.querySelectorAll('[data-pfs]').forEach(i => i.onchange = () => { set(i.dataset.pfs, i.value); redraw(); });
    box.querySelectorAll('[data-pfb]').forEach(i => i.onchange = () => { set(i.dataset.pfb, i.checked); redraw(); });
    const rs = box.querySelector('#spPfReset'); if (rs) rs.onclick = () => { change(x => { delete x.pf; }, true); refreshFin(); redraw(); };
    const xb = box.querySelector('#spPfX'); if (xb) xb.onclick = () => {
      if (!window.XLSX) { ctx.toast('Excel export is still loading. Try again in a moment.'); return; }
      const R = pfRun(p, PL()); if (!R) return; const wb = XLSX.utils.book_new(), sheets = PF.workbook(R, p.name + ' · ' + pl.name);
      for (const [name, rows] of Object.entries(sheets)) { const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(c => c && typeof c === 'object' ? { t: 'n', v: 0, f: c.f } : c))); ws['!cols'] = [{ wch: 34 }, ...Array(12).fill({ wch: 15 })]; XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); }
      ctx.saveFile(fileName(p, pl) + '-pro-forma.xlsx', new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    };
  }

  // Turn 90° (or R): like a drag, it stays clear of the other buildings and drives (the nearest clear spot), the parking
  // under it gives way and grows back where it was
  function turnEl(el) {
    let blocked = false;
    change(x => { const o = clone(el); el.rot = ((el.rot || 0) + 90) % 360; el.pinned = true;
      if (el.kind === 'building' || el.kind === 'garage') { const att = SP.attachedTo(x, el), c = SP.clearSpot(x, el, { carry: att, reach: Math.max(el.w || 0, el.d || 0) + 60 }); if (c && (c[0] || c[1])) for (const t of [el, ...att]) SP.moveBy(t, c[0], c[1]); blocked = !c; }
      makeRoom(el, [o]); });
    refitSoon();
    if (blocked) ctx.toast('No clear spot for it turned that way: it overlaps (in red). Turn it again or drag it.', { action: { label: 'Undo', run: () => { if (ed) undo(true); } } });
  }
  // a new piece lands in the nearest clear spot to the middle of the view (as a drag does): off the other buildings,
  // drives, ponds and amenities and inside the setbacks, on open ground before parking (parking under it gives way, but
  // then the plan parks less). Nothing near there: the nearest such spot anywhere on the site; a full site: the nearest
  // spot off the buildings, ponds and amenities (over a drive, shown in red). Then it's selected (and in view).
  const CLEAR = ['building', 'garage', 'pool', 'court', 'play', 'pond', 'patio', 'trash'];
  const boxOf = r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))];
  function obstacles(x, e, carry, { parking = false, kinds = null } = {}) {
    const o = SP.spotObstacles(x, e, carry, kinds); if (!parking) return o;
    return o.concat(x.elements.filter(q => q.kind === 'parking' && !carry.includes(q)).map(q => { const sh = SP.shapeOf(q); return { s: sh, b: boxOf(sh), g: 4 }; }));
  }
  function gridSpot(x, e, carry, obs) {
    const ring = x.ring, xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), step = Math.max(10, Math.sqrt(SP.ringArea(ring)) / 90), pts = [];
    for (let px = Math.min(...xs); px <= Math.max(...xs); px += step) for (let py = Math.min(...ys); py <= Math.max(...ys); py += step) if (SP.inRing([px, py], ring)) pts.push([px - e.x, py - e.y]);
    pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    for (const [dx, dy] of pts) { const t = SP.moveBy(clone(e), dx, dy), c = carry.map(q => SP.moveBy(clone(q), dx, dy)); if (SP.clearSpot(x, t, { carry: c, obs, reach: 0 })) return [dx, dy]; }
    return null;
  }
  function placeClear(x, e, carry = []) {
    if (!CLEAR.includes(e.kind)) return 'clear';
    const open = obstacles(x, e, carry, { parking: true }), std = obstacles(x, e, carry);
    let how = 'clear', c = SP.clearSpot(x, e, { carry, obs: open, reach: 200 }) || SP.clearSpot(x, e, { carry, obs: std, reach: 120 }) || gridSpot(x, e, carry, open) || gridSpot(x, e, carry, std);
    if (!c) { c = gridSpot(x, e, carry, obstacles(x, e, carry, { kinds: ['building', 'garage', 'pond', 'pool', 'court', 'play'] })); how = c ? 'drive' : 'none'; }
    if (c && (c[0] || c[1])) for (const t of [e, ...carry]) SP.moveBy(t, c[0], c[1]);
    return how;
  }
  // where a new piece starts: the middle of the free part of the map (if that's on the site), turned like the buildings near it
  function addAt(pl) {
    const f = freeRect(), m = map.getContainer().getBoundingClientRect(), ll = map.unproject([(f.l + f.r) / 2 - m.left, (f.t + f.b) / 2 - m.top]), F = SP.frame(pl.origin);
    let at = F.toFt([ll.lng, ll.lat]); if (!SP.inRing(at, pl.ring)) at = SP.centroid(pl.ring);
    const near = pl.elements.filter(e => e.kind === 'building' && !SP.isFree(e)).sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1]))[0];
    return { at, rot: +((((near ? near.rot || 0 : frameAngle(pl)) % 360) + 360) % 360).toFixed(2) };
  }
  function showPiece(e) { const pl = PL(); if (!pl || !e) return; const ll = SP.frame(pl.origin).toLL([e.x, e.y]), q = map.project(ll), c = map.getContainer().getBoundingClientRect(), f = freeRect(), x = q.x + c.left, y = q.y + c.top;
    if (x < f.l + 30 || x > f.r - 30 || y < f.t + 30 || y > f.b - 30) map.easeTo({ center: ll, offset: [(f.l + f.r) / 2 - (c.left + c.right) / 2, (f.t + f.b) / 2 - (c.top + c.bottom) / 2], duration: 400 }); } // to the middle of the free part of the map
  const noRoom = how => { if (how === 'drive') ctx.toast('The site is full: it sits over a drive (in red). Turn on Edit Layout to move it, or remove something first.'); else if (how === 'none') ctx.toast('No room for it on the site: it overlaps another piece (in red).'); };
  function addType(t) { // a building from the library at the middle of the view, squared with the lot, parking under it giving way
    const pl = PL(); if (!pl || pl.ring.length < 3) return;
    const { at, rot } = addAt(pl), e = { id: uid(), ...fromType(t, at, rot), ...(pl.recipe ? { pinned: true } : {}) };
    let how = 'clear'; change(x => { how = placeClear(x, e); x.elements.push(e); makeRoom(e); }); ed.sel = e.id; draw(); panel(); showPiece(e); noRoom(how);
  }
  function addEl(kind) {
    const pl = PL(); if (!pl || pl.ring.length < 3) return;
    const { at, rot } = addAt(pl), prog = SP.normalizeProgram(pl.program), [w, d] = kind === 'building' ? [Math.round(Math.max(40, Math.min(240, 12000 / prog.depth))), Math.round(Math.min(prog.depth, 160))] : SIZE[kind];
    const pin = PL().recipe ? { pinned: true } : {};
    let how = 'clear';
    if (kind === 'pad') { // a restaurant pad: the building, its outdoor seating by the door and a drive-thru lane round it
      const L = (u, v) => { const q = SP.rotPt([u, v], rot); return [+(at[0] + q[0]).toFixed(2), +(at[1] + q[1]).toFixed(2)]; };
      const b = { id: uid(), kind: 'building', ...Object.fromEntries(['x', 'y'].map((k2, i) => [k2, L(0, 0)[i]])), w: 44, d: 50, rot, use: 'restaurant', floors: 1, name: 'Pad', note: 'Restaurant · drive-thru', ...pin };
      const pt = L(30.5, 8), patio = { id: uid(), kind: 'patio', x: pt[0], y: pt[1], w: 15, d: 34, rot, name: '', note: 'Outdoor seating', ...pin };
      const lane = { id: uid(), kind: 'drive', path: [L(-34, 60), L(-34, -37), L(50, -37), L(50, 60)], width: 12, r: 14, name: '', note: 'Drive-thru lane', ...pin };
      change(x => { how = placeClear(x, b, [patio, lane]); x.elements.push(b, patio, lane); }); ed.sel = b.id; draw(); panel(); refitSoon(); showPiece(b); noRoom(how); return;
    }
    const e = { id: uid(), kind, x: +at[0].toFixed(2), y: +at[1].toFixed(2), w, d, rot, ...(kind === 'building' ? { floors: prog.floors } : {}), ...(kind === 'garage' ? { levels: 4, name: 'Parking garage' } : {}), ...(kind === 'play' ? { name: 'Playground' } : {}), ...(kind === 'court' ? { name: 'Pickleball courts' } : {}), ...(kind === 'patio' ? { note: 'Outdoor seating' } : {}), ...pin };
    change(x => { how = placeClear(x, e); x.elements.push(e); }); ed.sel = e.id; draw(); panel(); refitSoon(); showPiece(e); noRoom(how);
  }

  // ---------- Build with AI ----------
  function siteInfo(p, pl) {
    const a = frameAngle(pl), r = pl.ring.map(q => { const c = Math.cos(-a * Math.PI / 180), s = Math.sin(-a * Math.PI / 180); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c]; });
    const xs = r.map(q => q[0]), ys = r.map(q => q[1]), parcel = p.parcels.find(x => x.key === pl.parcel), f = pl.front ?? SP.longestEdge(pl.ring);
    return { acres: +(SP.ringArea(pl.ring) / 43560).toFixed(3), widthFt: Math.round(Math.max(...xs) - Math.min(...xs)), depthFt: Math.round(Math.max(...ys) - Math.min(...ys)), frontageFt: Math.round(SP.edgeLen(pl.ring, f)),
      address: parcel?.label || '', city: ctx.nearestPlace?.(pl.origin) || '', county: (ctx.DATA?.counties || []).find(c => SP.inRing(pl.origin, c.outline?.[0]?.[0] || []))?.name || '', zoning: pl.zoning };
  }
  // ---------- AI: what to build, then the engine's layouts reviewed and revised ----------
  const aiReviewOn = () => { try { return localStorage.getItem('fs-sp-review') !== '0'; } catch (e) { return true; } };
  const factsFor = pl => (ed.facts?.id === pl.id + ':' + pl.ring.length ? ed.facts.p : (ed.facts = { id: pl.id + ':' + pl.ring.length, p: siteFacts(pl).catch(() => []) }).p); // flood, roads, districts, utilities: asked once per site
  const post = async (body, signal) => { const r = await fetch('api/siteplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }); const d = await r.json().catch(() => ({})); if (!r.ok) { const e = Object.assign(new Error(d.error || 'AI unavailable'), { status: r.status }); aiSaw(e); throw e; } ctx.spAiOff = 0; return d; };
  // an option as the AI sees it: the plan drawing as a picture, its numbers and what the checks found
  async function planImage(plan) {
    const svg = planSVG(plan, { px: 1000 }).svg, img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const w = img.naturalWidth || 1000, h = img.naturalHeight || 1000, k = Math.min(1, 1000 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72);
  }
  async function forReview(v, plan, withImage) {
    const p2 = { ...plan, elements: v.elements, program: v.program || plan.program, params: v.params || plan.params }, m = v.m, B = v.elements.filter(e => e.kind === 'building');
    let image = null; if (withImage) try { image = await planImage(p2); } catch (e) { /* numbers only */ }
    return { name: v.name || v.arr, notes: v.notes, issues: SP.check(p2).map(i => i.text).slice(0, 8), image,
      metrics: { acres: +m.acres.toFixed(2), buildings: B.length, floorAreaSf: Math.round(m.gfa), units: m.units || 0, unitsPerAcre: +(m.duAc || 0).toFixed(1), parkingSpaces: m.spaces, parkingRequired: m.required, coveragePct: Math.round(m.coverage * 100), far: +m.far.toFixed(2), pondAcres: +(m.pond / 43560).toFixed(2), openSpacePct: Math.round(m.green * 100), ...(v.fin ? { valueM: +(v.fin.value / 1e6).toFixed(1), costM: +(v.fin.cost / 1e6).toFixed(1), yieldOnCostPct: +((v.fin.yoc || 0) * 100).toFixed(2) } : {}) } };
  }
  async function aiReview(plan, prog, list, round, ask, signal) {
    const options = await Promise.all(list.map((v, i) => forReview(v, plan, i < 4)));
    return post({ mode: 'review', prompt: ask, site: siteInfo(P(), PL()), facts: await factsFor(PL()), program: prog, round, options }, signal);
  }
  // Build: describe → watch it run → choose. The engine's layouts go on the map and into the list as soon as they're
  // drawn; with the AI on, its review then fills in their scores (matched by key, not position), puts its pick first and
  // adds any layouts from a revised program. The AI's pick is put on the map only if the person hasn't picked one meanwhile.
  async function build() {
    const p = P(), pl = PL(); if (!pl || pl.ring.length < 3) return;
    if (ed.run) { ctx.toast('A build is already running: wait for it, or Cancel it.'); return; }
    const ask = (ed.ask || '').trim(); if (!ask) { ed.buildOpen = true; panel(); ctx.toast('Say what should go on the site, or pick a suggestion.'); card.querySelector('#spAsk')?.focus(); return; }
    const ai = !aiOff(), review = ai && aiReviewOn(), lay = SP.ringArea(pl.ring) > 40 * 43560 ? 'Laying out (big site: up to a minute)' : 'Laying out the layouts';
    ed.buildOpen = false; const src = ed.runSrc || '#spGo'; ed.runSrc = null;
    const run = startRun('build', review ? ['Reading your request', lay, 'AI review', 'Comparing'] : ['Reading your request', lay], src, { ask }); if (!run) return;
    let prog = SP.guessProgram(ask), setbacks = pl.setbacks, note = '', aiOk = false, assumed = [];
    if (ai) try {
      const d = await post({ prompt: ask, site: siteInfo(p, pl), facts: await factsFor(pl), program: pl.program }, run.ctl.signal);
      prog = d.program; setbacks = { ...SP.SETBACKS, ...d.setbacks }; note = d.summary || ''; assumed = (d.assumptions || []).filter(Boolean); aiOk = true;
    } catch (e) { if (!live(run)) return; note = e.status === 503 ? '' : navigator.onLine ? 'The AI didn’t answer, so this read your words directly.' : 'Offline: this read your words directly.'; }
    if (!live(run) || PL() !== pl) return;
    if (!aiOk) run.steps = run.steps.slice(0, 2); // the AI is off: no review either
    const np = SP.normalizeProgram(prog);
    const readAs = { ask, chips: RUN.readAs(np, SP.USES), miss: RUN.notUnderstood(ask, np), assumed, by: aiOk ? 'ai' : 'words' }; // shown once the layouts land, so a cancelled build keeps the last one's
    runStep(run, 2, lay);
    let out = []; try { out = await laid('options', { ...pl, setbacks }, prog); } catch (e) { console.warn('layout', e); if (live(run)) ctx.toast('The layout failed: ' + e.message); }
    if (!live(run) || PL() !== pl) return;
    const plan = { ...pl, setbacks }, variants = named(out, { ...plan, program: prog }), doReview = aiOk && review && variants.some(v => v.elements.length);
    // the layouts, at once: on the map and in the list
    ed.variants = variants; ed.readAs = readAs; ed.aiNote = note; ed.aiSummary = ''; ed.reviewCleared = false; ed.runMeta = { ask, at: new Date().toISOString() }; ed.pickedByUser = false; ed.reviewing = doReview; ed.aiPick = null;
    if (ed.ideas?.list?.length) { if (!ed.ideas.list.some(it => it.request === ask)) ed.ideas = { ...ed.ideas, used: null }; else if (ed.ideas.used != null) ed.ideasOpen = false; } // the idea laid out: the ideas fold to a line
    run.applied = true;
    const rec0 = K.recommended(variants, null), best = rec0 ? rec0.index : variants.findIndex(v => v.elements.length); // never a failing layout when one passes
    if (best >= 0) await useVariant(best, { quiet: true }); else saveRun(pl);
    if (!live(run)) return;
    if (!doReview) { endRun(run); if (best < 0) ctx.toast('Nothing fits that request on this site.'); return; }
    panel(); showLayouts(run);
    runStep(run, 3, 'The AI is reviewing the layouts');
    let pool = variants.filter(v => v.elements.length).slice(0, 4), extra = [], revised = '', rv = null;
    try {
      rv = await aiReview(plan, prog, pool, 1, ask, run.ctl.signal);
      if (!live(run)) return;
      if (rv.revise && rv.program) {
        runStep(run, 4, 'Revising: ' + (rv.why || 'a better program').replace(/\.$/, ''));
        const params2 = { ...(pl.params || {}), ...(rv.params?.fill != null ? { fill: rv.params.fill } : {}), ...(rv.params?.streets ? { streets: rv.params.streets } : {}), ...(rv.params?.form ? { form: rv.params.form } : {}) }, prog2 = { ...rv.program, ...(rv.params?.storm ? { storm: rv.params.storm } : {}) };
        let out2 = []; try { out2 = await laid('options', { ...pl, setbacks, params: params2 }, prog2, { count: 3, depth: 6, budgetMs: 6000 }); } catch (e) { console.warn('layout', e); }
        if (!live(run)) return;
        const v2 = named(out2, { ...plan, params: params2, program: prog2 }, { params: params2, revisedBy: rv.why || 'the AI review' }).filter(v => v.elements.length);
        if (v2.length) {
          const first = rv; extra = v2.slice(0, 3); const nm = RUN.layoutNames([...ed.variants, ...extra]); extra.forEach((v, k) => { v.name = nm[ed.variants.length + k]; }); pool = pool.slice(0, 3).concat(extra); runStep(run, 4, 'The AI is comparing the revised layouts');
          try { rv = await aiReview(plan, prog2, pool, 2, ask, run.ctl.signal); } catch (e) { if (!live(run)) return; rv = { ...first, reviews: (first.reviews || []).filter(r => r.option < 3), ranking: (first.ranking || []).filter(i => i < 3).concat(extra.map((_, k) => 3 + k)) }; }
          revised = first.why || 'a better program';
        }
      } else runStep(run, 4, 'Comparing');
    } catch (e) { if (!live(run)) return; console.warn('review', e); rv = null; }
    if (!live(run) || PL() !== pl) return;
    ed.reviewing = false;
    if (rv) { mergeReview(rv, pool, extra); ed.aiNote = revised ? 'After its first look the AI changed the program: ' + revised.replace(/\.$/, '') + '.' : note; }
    else ed.aiNote = (note ? note + ' ' : '') + 'The AI review didn’t answer, so these are as the engine ranked them.';
    await pickAi();
    if (!live(run)) return;
    saveRun(pl); endRun(run);
  }
  // the AI's review into the layouts: scores by key, its order (best first), and the layouts from its revised program after
  // the others (numbered on from them). Names don't change, so "Layout 3" is still Layout 3 after the review.
  function mergeReview(rv, pool, extra = []) {
    const list = ed.variants || [], byKey = new Map(list.map(v => [v.key, v]));
    if (extra.length) { const names = RUN.layoutNames([...list, ...extra]), seen = new Set(list.map(v => v.key));
      extra.forEach((v, k) => { let key = v.key; while (seen.has(key)) key += '+'; seen.add(key); v.key = key; v.name = names[list.length + k]; byKey.set(key, v); }); }
    const names = pool.map(v => numOf(byKey.get(v.key) || v)), tx = t => K.aiText(t, names); // "Option A", "option 1" → the layout's own name
    for (const r of rv.reviews || []) { const v = pool[r.option] && byKey.get(pool[r.option].key); if (v) v.ai = { ...r, verdict: tx(r.verdict), strengths: (r.strengths || []).map(tx), problems: (r.problems || []).map(tx) }; }
    ed.aiSummary = tx(rv.summary || '');
    const first = (rv.ranking || []).map(i => pool[i]?.key).filter(k => byKey.has(k)), seen = new Set(first);
    const order = [...first, ...list.map(v => v.key).filter(k => !seen.has(k)), ...extra.map(v => v.key).filter(k => !seen.has(k))];
    ed.variants = order.map((k, i) => ({ ...byKey.get(k), rank: -i })); ed.aiPick = first[0] || null; ed.reviewCleared = false;
  }
  // the AI's pick on the map, unless the person picked another layout (or changed the one on the map) meanwhile
  async function pickAi() {
    const k = ed.aiPick, pl = PL(), i = k && ed.variants ? ed.variants.findIndex(v => v.key === k) : -1; if (i < 0 || pl?.variant?.key === k) return;
    const failing = K.passes(ed.variants[i].chk) === false && ed.variants.some(v => K.passes(v.chk)); // a failing layout never goes on the map by itself when one passes
    if (!ed.pickedByUser && !dirty(pl) && !failing) { await useVariant(i, { quiet: true }); return; }
    const n = numOf(ed.variants[i]); ctx.toast('The AI recommends ' + n + (failing ? ', though it doesn’t pass every check' : '') + '.', { action: { label: 'Use it', run: () => { const j = ed?.variants?.findIndex(v => v.key === k); if (j >= 0) useVariant(j); } } });
  }
  // ---------- a run: one build (or idea, more layouts, review, change) at a time, shown and cancellable ----------
  // ed.run = { kind, steps, step, label, t0, ctl, token, src }: lives on the editor, not the page, so a redraw of the
  // panel (Trees, a setting) never loses it. Every await checks live(run) before using what came back; Cancel aborts the
  // AI call and drops whatever arrives after (a layout already running in the worker finishes, unused).
  let runTok = 0, runTick = 0;
  const LAYS = ['build', 'more', 'resolve']; // runs that put layouts on the map: a hand edit before they land cancels them
  const LOCK = ['#spGo', '#spBest', '[data-idea]', '[data-sug]', '#spMore', '#spResolve', '#spNewLay', '#spRefitMine', '#spReReview', '#spChgGo', '[data-rmode]'];
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
  // Cancel: the AI call stops; layouts already back stay (the engine's, when the AI was still reviewing them)
  function cancelRun(why) {
    const r = ed?.run; if (!r) return; r.cancelled = true; r.ctl.abort();
    const mid = ed.reviewing && ed.variants?.length; ed.reviewing = false;
    if (mid) { ed.aiNote = 'AI review cancelled: these are the layouts as the engine ranked them.'; saveRun(); }
    endRun(r); if (why || !mid) ctx.toast(why || (r.kind === 'best' ? 'Ideas cancelled.' : r.kind === 'change' ? 'Change cancelled.' : r.kind === 'build' ? 'Build cancelled.' : r.kind === 'review' ? 'Review cancelled.' : 'Cancelled: the layouts stay as they were.'));
  }
  function killRun() { const r = ed?.run; if (!r) return; r.cancelled = true; r.ctl.abort(); ed.run = null; clearInterval(runTick); runTick = 0; pillEl.hidden = true; } // the plan closes or another option opens
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
  function runHtml(r) {
    return '<div class="sp-run" id="spRun"><span class="sp-run-dot" aria-hidden="true"></span><span class="sp-run-t" role="status">' + esc(runText(r)) + '</span>' +
      '<span class="sp-rt" data-rt aria-label="elapsed">' + mmss(Date.now() - r.t0) + '</span><button type="button" class="sp-run-x" data-cancel>Cancel</button>' +
      '<span class="sp-run-bar" aria-hidden="true" style="--p:' + (r.step - 1) / r.steps.length + '"></span></div>';
  }
  // the strip in the header (and, on phones, a pill floating above the sheet) follow the run without redrawing the panel
  function paintRun() {
    const r = ed?.run; if (!r) { pillEl.hidden = true; return; }
    const strip = card.querySelector('#spRun'); if (strip) { strip.querySelector('.sp-run-t').textContent = runText(r); strip.querySelector('.sp-run-bar')?.style.setProperty('--p', (r.step - 1) / r.steps.length); }
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
  // pieces; they're applied here, pinned, and the rest re-fits round them when asked. Without the AI the words are read
  // directly ("make bldg 7 four stories", "remove bldg 3").
  async function aiChange() {
    const p = P(), pl = PL(); if (!pl?.elements.length) return;
    const ask = (ed.chg || '').trim(); if (!ask) { ctx.toast('Say what to change, e.g. “make Apt Bldg 7 four stories”.'); card.querySelector('#spChg')?.focus(); return; }
    if (ed.run) { ctx.toast('Wait for the run under way, or Cancel it.'); return; }
    const off = aiOff(), run = startRun('change', [off ? 'Reading your words' : 'Reading the plan and your request', 'Making the changes'], '#spChgGo'); if (!run) return;
    const sel = ed.sel; let ops = [], full = false, note = '', question = null, byAi = false;
    try {
      if (off) throw Object.assign(new Error('AI off'), { status: 503 });
      let image = null; try { image = await planImage(pl); } catch (e) { /* words and numbers only */ }
      const d = await post({ mode: 'edit', prompt: ask, site: siteInfo(p, pl), plan: ED.describePlan(pl, sel), image }, run.ctl.signal);
      ops = d.ops || []; full = d.refit === 'full'; note = d.summary || ''; question = d.question; byAi = true;
    } catch (e) { if (!live(run)) return; ops = ED.guessEdits(ask, pl, sel); full = /\bre-?(?:fit|lay)/i.test(ask); note = (e.status === 503 ? 'AI isn’t set up on this site, so ' : 'The AI didn’t answer, so ') + 'this read your words directly.'; }
    if (!live(run) || PL() !== pl) return;
    if (!ops.length) { ed.chgDone = null; ed.chgNote = question || (note ? note + ' ' : '') + 'Couldn’t tell what to change: name the piece as it’s labelled (“Apt Bldg 7”), or select it and say “it”.'; endRun(run); return; }
    full = (full || ed.chgFit) && !!pl.recipe; runStep(run, 2);
    const depth = ed.undo.length, was = pl.elements.slice(); // to undo it, and to show what went
    let r = null; change(x => { r = ED.applyEdits(x, ops, { refit: full, spare: x.spareRows = (x.spareRows || []).slice(-40) }); x.elements = r.elements; if (r.streets !== (x.streets || [])) x.streets = r.streets; });
    const gone = was.filter(e => !['parking', 'green', 'lot', 'trail'].includes(e.kind) && !pl.elements.some(x => x.id === e.id)); // removed (not parking rows that gave way)
    if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null; draw(); // Edit Layout stays as it was
    if (full) { run.steps = [...run.steps, 'Re-fitting the rest of the site']; runStep(run, 3); let rf = null; try { rf = await laid('refit', PL(), { amount: 'current' }); } catch (e) { console.warn('refit', e); }
      if (!live(run)) return;
      if (PL() === pl && rf) { pl.elements = rf.elements; pl.spareRows = []; if (rf.recipe) pl.recipe = clone(rf.recipe); if (ed.sel && !pl.elements.some(x => x.id === ed.sel)) ed.sel = null; }
      else if (!rf) r.skipped.push('The rest couldn’t be re-fitted around it, so only those pieces changed.'); }
    // what it did as a checklist, with Undo this change, and (parking short) Re-fit around my changes; on the map, what
    // it touched flashes and what it removed fades out
    ed.chgNote = ''; ed.chgDone = { items: MAP.checklist(r.done), skipped: r.skipped, note, depth, after: ed.undo.length };
    ed.chg = ''; pl.updated = new Date().toISOString(); save(P()); endRun(run);
    flash(r.touched.filter(id => pl.elements.some(x => x.id === id))); fadeGone(gone, pl);
    card.querySelector('#spChgDone')?.scrollIntoView({ block: 'nearest' });
  }
  function chgHtml(pl) {
    const D = ed.chgDone, note = ed.chgNote ? '<div class="rnote sp-ainote" id="spChgNote">' + esc(ed.chgNote) + '</div>' : '';
    if (!D) return note;
    const m = SP.metrics(pl), short = Math.max(0, Math.round(m.required - m.spaces)), still = ed.undo.length === D.after; // nothing else changed since
    return note + '<div class="sp-chgdone" id="spChgDone" role="status">' + (D.note ? '<div class="rnote">' + esc(D.note) + '</div>' : '') +
      '<ul class="sp-chk">' + D.items.map(t => '<li>' + esc(t) + '</li>').join('') + D.skipped.map(t => '<li class="skip">' + esc(t) + '</li>').join('') + '</ul>' +
      (short > 0 && m.gfa ? '<div class="rnote sp-warn">Parking is now ' + f0(short) + ' spaces short.</div>' : '') +
      '<div class="bacts sp-chg-acts">' + (short > 0 && m.gfa && pl.recipe ? '<button type="button" class="btn primary" id="spChgRefit" title="Lay the parking and the rest out again around what changed">Re-fit around my changes</button>' : '') +
      (still ? '<button type="button" class="btn" id="spChgUndo">Undo this change</button>' : '') + '<button type="button" class="sp-link" id="spChgOk">Dismiss</button></div></div>';
  }
  function wireChg() {
    const D = ed.chgDone, $ = q => card.querySelector(q);
    if ($('#spChgRefit')) $('#spChgRefit').onclick = () => refitNow(true);
    if ($('#spChgUndo')) $('#spChgUndo').onclick = () => { if (!D || ed.undo.length !== D.after) return; while (ed.undo.length > D.depth) undo(true); ed.chgDone = null; clearGone(); panel(); ctx.toast('Change undone.'); };
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
    if (!open) return '<div class="sp-ideas-fold"><button type="button" class="sp-link" data-ideas="open" aria-expanded="false">Ideas (' + I.list.length + ') · show</button>' + (used ? '<span>Using <b>' + esc(used.title) + '</b></span>' : '') + '</div>';
    const bar = f => { const v = Math.max(0, Math.min(100, Math.round(+f || 0))); return '<span class="sp-fitbar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="Fit for this site: ' + v + ' out of 100" title="Fit for this site: ' + v + ' out of 100"><i style="width:' + v + '%"></i></span>'; };
    return '<div class="sp-ideas">' + (I.summary ? '<div class="sp-callout"><b>The AI’s read of the site</b>' + esc(I.summary) + '</div>' : '') +
      I.list.map((it, i) => '<div class="sp-idea' + (i === I.used ? ' on' : '') + '"><div class="sp-idea-h"><b>' + esc(it.title) + '</b>' + (i === I.used ? '<i class="sp-onmap">In use</i>' : '') + bar(it.fit) + '</div><div class="sp-idea-w">' + esc(it.why) + '</div>' +
        (it.risks?.length ? '<ul class="sp-risks" aria-label="To check">' + it.risks.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '') +
        '<div class="sp-idea-req"><span>Will build:</span> <q>' + esc(it.request) + '</q> <button type="button" class="sp-link" data-ideaedit="' + i + '" title="Put this request in the box to change it first">Edit</button></div>' +
        '<button class="btn" data-idea="' + i + '">Lay This Out</button></div>').join('') +
      '<div class="rnote sp-ideas-foot">Starting points from the AI, not a market study.' + (used ? ' <button type="button" class="sp-link" data-ideas="close">Hide ideas</button>' : '') + '</div></div>';
  }
  // ---------- layouts: what a build made, kept on the option (pl.lastRun) so switching options, closing or reloading keeps them ----------
  // Generated layouts are "Layout 1, 2, 3…" (numbers, never letters, so they can't be mistaken for an Option). Each has a
  // key that finds it again after a re-sort, More layouts or a re-solve; pl.variant says which one is on the map.
  const projOf = pl => db.projects.find(x => x.plans.some(y => y.id === pl?.id)) || P();
  const planFor = (v, pl) => ({ ...pl, setbacks: v.setbacks || pl.setbacks, program: v.program || pl.program, params: v.params || pl.params, zones: v.zones || pl.zones || [], elements: v.elements || [] });
  // the money for a layout, from the same land price and assumptions as the Pro forma
  function finFor(v, pl) {
    const p = projOf(pl); if (!p || !v.elements?.some(e => e.kind === 'building' && e.use !== 'amenity')) return null;
    try { const x = planFor(v, pl); return RUN.finOf(PF.run(x, pfMerge(PF.defaults(x, landGuess(p, x)), pl.pf))); } catch (e) { console.warn('layout money', e); return null; }
  }
  const finStamp = pl => { const p = projOf(pl); return RUN.hash(JSON.stringify(pl?.pf || {}) + '|' + (p && pl ? landGuess(p, pl) || '' : '')); };
  // engine output → layouts: numbers, money, a key and a name. extra: fields every one carries (the AI's revised params)
  function named(list, plan, extra = {}) {
    const stamp = finStamp(plan), vs = list.map(r => { const v = { ...r, ...extra, arr: r.arr || RUN.baseName(r.name), setbacks: r.setbacks || plan.setbacks };
      v.m = SP.metrics({ ...plan, program: v.program || plan.program, elements: v.elements }); v.fin = finFor(v, plan); v.finAt = stamp; return derive(v, plan); });
    const keys = RUN.layoutKeys(vs), names = RUN.layoutNames(vs);
    return vs.map((v, i) => ({ ...v, rank: -i, key: keys[i], name: names[i] }));
  }
  // once per layout: what the checks find (the same levels as the overview) and Phase 1's numbers when it has a Phase 2
  function derive(v, plan) {
    if (!v.elements?.length) { if (!v.chk && v.m) v.chk = { bad: null, short: K.checksOf([], v.m).short }; return v; }
    const p2 = planFor(v, plan); if (!v.m) v.m = SP.metrics(p2);
    if (!v.chk || v.chk.bad == null) v.chk = K.checksOf(SP.check(p2), v.m);
    if (v.m1 === undefined) v.m1 = v.elements.some(e => e.phase === 2) ? SP.metrics({ ...p2, elements: v.elements.filter(e => e.phase !== 2) }) : null;
    return v;
  }
  const pickIdx = () => { const k = PL()?.variant?.key; return k && ed?.variants ? ed.variants.findIndex(v => v.key === k) : -1; };
  const numOf = v => (v?.name || '').match(/^Layout \d+/)?.[0] || 'That layout';
  // the run, saved on the option: the request, the AI's note and ideas, and up to six layouts (lib/planruns.mjs slims it)
  function saveRun(pl = PL()) {
    if (!pl || !ed?.variants) return;
    const meta = ed.runMeta || pl.lastRun || {};
    pl.lastRun = RUN.slimRun({ ask: meta.ask || '', note: ed.aiNote || '', ...(ed.aiSummary ? { summary: ed.aiSummary } : {}), ...(ed.sortBy && ed.sortBy !== 'rec' ? { sort: ed.sortBy } : {}), ...(ed.ideas?.list?.length ? { ideas: ed.ideas } : {}), ...(ed.readAs ? { read: ed.readAs } : {}), ...(ed.aiPick ? { pick: ed.aiPick } : {}), at: meta.at || new Date().toISOString(), aiReviewed: ed.variants.some(v => v.ai), variants: ed.variants }, pl.variant?.key);
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
  const $M = v => v == null || !isFinite(v) ? '—' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(2) + 'M' : f0(Math.abs(v))), pc2 = v => v == null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(2) + '%';
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
    if (!ed?.variants) return '';
    const pl = PL(), vs = ed.variants, on = pickIdx(), edited = !!pl?.variant?.edited, by = K.SORTS.some(([k]) => k === ed.sortBy) ? ed.sortBy : 'rec';
    for (const v of vs) if (!v.chk || v.elements?.length && (v.chk.bad == null || v.m1 === undefined)) derive(v, pl); // an older saved run
    const rec = K.recommended(vs, ed.aiPick), recV = rec ? vs[rec.index] : null, badge = K.badges(vs, rec), sim = K.similar(vs), digits = K.moneyDigits(vs.flatMap(v => v.fin ? [v.fin.cost, v.fin.value, v.fin.profit] : []));
    const alive = vs.map(v => !(Array.isArray(v.elements) && !v.elements.length)), notes = K.splitNotes(vs.map((v, i) => alive[i] ? v.notes : null));
    const named1 = (K.firstSentence(ed.aiSummary).match(/\bLayout \d+/g) || []), aiFirst = rec?.by === 'ai' && !!ed.aiSummary && (!named1.length || named1.includes(numOf(recV))); // the summary's first sentence is about the recommended one
    const liveChk = on >= 0 && pl?.elements?.length ? K.checksOf(SP.check(pl), SP.metrics(pl)) : null; // the On map card's checks: the plan as it is now, the same as the overview's
    const order = K.sortOrder(vs, by, rec ? rec.index : -1), M = x => K.fmtM(x, digits), neg = x => x != null && x < 0 ? ' neg' : '';
    const simOpen = ed.simOpen || (ed.simOpen = new Set()), whyOpen = ed.whyOpen || (ed.whyOpen = new Set());
    const followers = i => vs.map((v, j) => j).filter(j => j !== i && sim[j] === i);
    const shown = i => sim[i] === i || i === on || (rec && i === rec.index) || simOpen.has(vs[sim[i]].key);
    const notesHtml = list => K.byLevel(list).filter(n => n.level !== 'info').map(n => '<p class="sp-n ' + n.level + '">' + esc(n.text) + '</p>').join('');
    const infoHtml = list => K.byLevel(list).filter(n => n.level === 'info').map(n => '<p class="sp-n info">' + esc(n.text) + '</p>').join('');
    const baseProg = (vs.find(v => !v.revisedBy) || {}).program;
    const whyBox = (v, html) => '<details class="sp-why" data-why="' + esc(v.key) + '"' + (whyOpen.has(v.key) ? ' open' : '') + '><summary>' + (v.ai ? 'Why' : 'Details') + '</summary>' + html + '</details>';
    const card1 = i => {
      const v = vs[i], has = !!v.elements?.length, none = !alive[i], here = on === i, f = v.fin, m = v.m || {}, cl = K.checkLabel(here && liveChk ? liveChk : v.chk), isRec = rec && rec.index === i;
      const ckTip = here && liveChk && K.checkLabel(v.chk).text !== cl.text ? 'The plan on the map now; as laid out it read “' + K.checkLabel(v.chk).text + '”' : '';
      const h = K.headline(v.m, v.m1, K.askedOf(SP.normalizeProgram(v.program || pl.program))), hot = k => by === k ? ' hot' : '';
      const cell = (k, big, sub, cls = '', tip = '') => '<span class="sp-vc' + cls + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><small>' + k + '</small><b>' + big + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</span>';
      const ratio = m.units ? (m.spaces / m.units).toFixed(2) + ' / unit' : m.gfa ? (m.spaces / m.gfa * 1000).toFixed(1) + ' / 1,000 sf' : '';
      const grid = none ? '' : '<span class="sp-vgrid">' +
        cell(v.m1 ? 'Phase 1' : h.units ? 'Units' : 'Floor area', esc(h.big), h.fit ? '<em class="neg">Fits ' + esc(h.fit) + '</em>' : esc(h.sub), hot('size')) +
        cell('Parking', f0(m.spaces || 0) + '/' + f0(m.required || 0), ratio, (m.spaces < m.required ? ' short' : '') + hot('ratio'), 'Spaces provided / required (whole site)') +
        (f ? (f.forSale ? cell('Cost', M(f.cost), 'profit <em class="' + neg(f.profit) + '">' + M(f.profit) + '</em>', hot('profit'), finTip(v, pl)) + cell('Margin', K.fmtPct(f.margin), '', neg(f.margin) + hot('yoc'), finTip(v, pl))
          : cell('Value / cost', M(f.value) + ' / ' + M(f.cost), 'profit <em class="' + neg(f.profit) + '">' + M(f.profit) + '</em>', hot('profit'), finTip(v, pl)) +
            cell('Yield on cost', K.fmtPct(f.yoc), f.spread != null ? 'spread <em class="' + neg(f.spread) + '">' + K.fmtPct(f.spread) + '</em>' : '', neg(f.yoc) + hot('yoc'), finTip(v, pl)))
          : cell('Value / cost', '—', has ? 'no buildings to price' : 'when laid out', '') + cell('Yield on cost', '—', '', '')) + '</span>';
      const pills = (here ? '<i class="sp-onmap">On map' + (edited ? ' · edited' : '') + '</i>' : '') + badge[i].map(b => '<i class="sp-badge' + (b === 'Recommended' ? ' rec' : '') + '">' + b + '</i>').join('') +
        (none ? '' : '<i class="sp-ck ' + cl.level + '" title="' + (ckTip ? esc(ckTip) : cl.level === 'ok' ? 'Inside the lot and setbacks, no overlaps, enough parking' : 'What the checks found; the details are on the map in red once it’s on the map') + '">' + esc(cl.text) + '</i>') +
        (v.ai ? '<i class="sp-score ' + scoreBand(v.ai.score) + hot('ai') + '" title="The AI review’s score, out of 100">AI ' + v.ai.score + '</i>' : '') + (ed.reviewing && has && !v.ai ? '<i class="sp-skel" aria-label="The AI is reviewing this layout">AI reviewing…</i>' : '');
      const reason = isRec ? (rec.by === 'ai' ? (aiFirst ? K.firstSentence(ed.aiSummary) : v.ai?.verdict || '') : K.engineReason(vs, i)) : '';
      const dl = recV && !isRec && !none ? K.deltas(v, recV, digits) : [];
      const fol = sim[i] === i ? followers(i) : [], foldN = fol.filter(j => !(j === on || rec && j === rec.index)).length;
      const own = notes.own[i] || [], why = (v.ai ? (v.ai.verdict && v.ai.verdict !== reason ? '<p class="sp-why-v">' + esc(v.ai.verdict) + '</p>' : '') + '<ul class="sp-why-l">' + (v.ai.strengths || []).map(t => '<li class="ok">' + esc(t) + '</li>').join('') + (v.ai.problems || []).map(t => '<li class="bad">' + esc(t) + '</li>').join('') + '</ul>' : '') + infoHtml(own);
      return '<div class="sp-var' + (here ? ' on' : '') + (none ? ' none' : '') + (K.passes(v.chk) === false ? ' fail' : '') + '" data-key="' + esc(v.key) + '">' +
        '<button type="button" class="sp-var-use" aria-pressed="' + here + '" data-var="' + i + '"' + (none ? ' disabled' : '') + ' title="' + (here ? 'On the map' : has ? 'Put this layout on the map' : none ? 'Nothing fits' : 'Lay this layout out again and put it on the map') + '">' +
          '<span class="sp-vthumb"' + (has ? ' data-thumb="' + i + '"' : '') + '>' + (has && vthumbs.has(thumbKey(v)) ? vthumbs.get(thumbKey(v)) : '') + (!has ? '<i>' + (none ? 'Nothing fits' : 'Numbers only') + '</i>' : '') + '</span>' +
          '<span class="sp-vmain"><span class="sp-vhead"><b>' + esc(numOf(v)) + '</b><span>' + esc(RUN.baseName(v.name)) + '</span></span>' +
            (pills ? '<span class="sp-vpills">' + pills + '</span>' : '') + grid +
            (h.p2 ? '<span class="sp-vp2">' + esc(h.p2) + '</span>' : '') + (by === 'open' && !none ? '<span class="sp-vp2 hot">Open space ' + pct(m.green || 0) + '</span>' : '') +
            (reason ? '<span class="sp-vwhy">' + esc(reason) + '</span>' : '') + (dl.length ? '<span class="sp-vdelta">vs Recommended: ' + dl.map(esc).join(' · ') + '</span>' : '') +
            (!has && !none ? '<span class="sp-numonly">Numbers only: click to lay it out again</span>' : '') + '</span></button>' +
        (none ? '' : notesHtml(own)) +
        (none ? (why ? '<div class="sp-var-acts">' + whyBox(v, why) + '</div>' : '') : '<div class="sp-var-acts">' + (why ? whyBox(v, why) : '') + (foldN ? '<button type="button" class="sp-link sp-simt" data-sim="' + esc(v.key) + '" aria-expanded="' + simOpen.has(v.key) + '">' + foldN + ' similar layout' + (foldN > 1 ? 's' : '') + ' · ' + (simOpen.has(v.key) ? 'hide' : 'show') + '</button>' : '') +
          (here ? '' : '<button type="button" class="sp-link" data-usevar="' + i + '">Use this layout</button>') +
          '<button type="button" class="sp-link" data-keep="' + i + '" title="Keep this layout as a new option in ' + esc(projOf(pl)?.name || 'the project') + '; this option stays as it is">Save as new option</button></div>') + '</div>';
    };
    const main = order.filter(i => !vs[i].revisedBy && shown(i)), revd = order.filter(i => vs[i].revisedBy && shown(i));
    const known = vs.filter((v, i) => alive[i] && v.m?.gfa), allFail = known.length && !known.some(v => K.passes(v.chk)) && known.some(v => K.passes(v.chk) === false);
    const gap = allFail ? K.acreageGap(vs.flatMap(v => v.notes || [])) : null, firstBad = allFail ? K.checkLabel(known[0].chk).text : '';
    const rest = aiFirst ? K.restSentences(ed.aiSummary) : ed.aiSummary || '';
    const revV = revd.length ? vs[revd[0]] : null, chg = revV ? K.programChange(SP.normalizeProgram(baseProg || pl.program), SP.normalizeProgram(revV.program || pl.program)) : '';
    const mainHtml = main.length ? (revd.length ? '<div class="sp-lgrp"><b>From your request</b></div>' : '') + '<div class="sp-vars">' + main.map(card1).join('') + '</div>' : '';
    const revHtml = revd.length ? '<div class="sp-lgrp"><b>AI’s revision</b> <span>(' + esc([chg, revV.revisedBy ? 'why: ' + revV.revisedBy.replace(/\.$/, '') : ''].filter(Boolean).join(' · ')) + ')</span></div><div class="sp-vars">' + revd.map(card1).join('') + '</div>' : '';
    return (ed.reviewCleared ? '<div class="rnote sp-warn sp-rvc">Settings changed: AI review cleared · <button type="button" class="sp-link" id="spReReview">Review again</button></div>' : '') +
      (allFail ? '<div class="sp-lbanner" role="note"><div><b>None of these layouts passes every check.</b> ' + (gap ? 'This asks for about ' + gap.need.toFixed(1) + ' ac; the site is ' + gap.site.toFixed(1) + ' ac.' : esc(firstBad) + ' on ' + (known.length > 1 ? 'the best of them' : 'it') + '.') + '</div><button type="button" class="btn sm" data-layedit="1">Edit request</button></div>' : '') +
      (rest ? '<div class="sp-callout"><b>From the AI’s review</b>' + esc(rest) + '</div>' : '') +
      (notes.shared.length ? (K.byLevel(notes.shared).some(n => n.level !== 'info') ? '<div class="sp-lnotes"><span class="sp-lnh">Every layout</span>' + notesHtml(notes.shared) + (K.byLevel(notes.shared).some(n => n.level === 'info') ? '<details class="sp-ninfo"><summary>Details</summary>' + infoHtml(notes.shared) + '</details>' : '') + '</div>'
        : '<details class="sp-ninfo sp-ninfo1"><summary>Notes on every layout (' + notes.shared.length + ')</summary>' + infoHtml(notes.shared) + '</details>') : '') +
      (by === 'rec' && recV?.revisedBy ? revHtml + mainHtml : mainHtml + revHtml);
  }
  // the Layouts heading: how many, the sort and More layouts
  function layoutsHead() {
    const by = K.SORTS.some(([k]) => k === ed.sortBy) ? ed.sortBy : 'rec', tip = K.SORTS.find(([k]) => k === by)[2];
    return '<div class="sp-lay-h"><div class="lt">Layouts<span class="sp-lcount"> · ' + (ed.variants?.length || 0) + '</span></div><div class="sp-lay-ctl">' +
      '<label class="sp-sortl" title="' + esc(tip) + '">Sort <select id="spSort">' + K.SORTS.map(([k, t, tt]) => '<option value="' + k + '" title="' + esc(tt) + '"' + (by === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
      (ed.variants?.length <= 3 ? '<button type="button" class="sp-link" id="spMore" title="Every usable layout the planner found, not just the top three">More layouts…</button>' : '') + '</div></div>';
  }
  function wireVariants() {
    const $ = q => card.querySelector(q);
    card.querySelectorAll('[data-var],[data-usevar]').forEach(b => b.onclick = () => { if (ed.run) ed.pickedByUser = true; useVariant(+(b.dataset.var ?? b.dataset.usevar)); }); // picked during a review: the AI's pick won't replace it
    card.querySelectorAll('[data-keep]').forEach(b => b.onclick = () => keepAsOption(+b.dataset.keep));
    card.querySelectorAll('[data-sim]').forEach(b => b.onclick = () => { const k = b.dataset.sim; if (ed.simOpen.has(k)) ed.simOpen.delete(k); else ed.simOpen.add(k); redrawLayouts(); });
    card.querySelectorAll('details[data-why]').forEach(d => d.ontoggle = () => { if (d.open) ed.whyOpen.add(d.dataset.why); else ed.whyOpen.delete(d.dataset.why); });
    card.querySelectorAll('[data-layedit]').forEach(b => b.onclick = () => { fillAsk(ed.runMeta?.ask || ed.readAs?.ask || ed.ask || ''); card.querySelector('#spAiSec')?.scrollIntoView({ block: 'nearest' }); });
    const mo = $('#spMore'); if (mo) mo.onclick = async () => { const pl2 = PL(), run = startRun('more', ['Looking for more layouts'], '#spMore'); if (!run) return; let more = []; try { more = await laid('options', { ...pl2 }, pl2.program, { count: 12 }); } catch (e) { console.warn('layout', e); } if (!live(run) || PL() !== pl2) return;
      if (more.length) { const old = new Map((ed.variants || []).map(v => [v.key, v])), nv = named(more, pl2); for (const v of nv) { const o = old.get(v.key); if (o?.ai) v.ai = o.ai; }
        ed.variants = RUN.keepCurrent(pl2.variant?.key && old.get(pl2.variant.key), nv); ed.reviewCleared = false; saveRun(pl2); } endRun(run); }; // the AI's scores stay on the layouts it saw; the one on the map stays in the list (first) when the new run doesn't hold it
    const so = $('#spSort'); if (so) so.onchange = () => { ed.sortBy = so.value; saveRun(); redrawLayouts(); so.closest('label').title = K.SORTS.find(([k]) => k === so.value)?.[2] || ''; };
    const rr = $('#spReReview'); if (rr) rr.onclick = reviewAgain;
    lazyThumbs();
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
  // put a layout on the map; one kept as numbers only is laid out again first
  async function useVariant(i, o = {}) {
    let v = ed.variants?.[i]; if (!v || Array.isArray(v.elements) && !v.elements.length) return false;
    if (!v.elements) { v = await relay(i); if (!v) return false; i = ed.variants.indexOf(v); }
    applying = true;
    try { change(x => { x.elements = clone(v.elements); x.spareRows = []; x.program = { ...(v.program || x.program) }; x.setbacks = v.setbacks || x.setbacks; if (v.params) x.params = clone(v.params); x.zones = clone(v.zones || []); x.recipe = v.recipe ? clone(v.recipe) : null; x.variant = { key: v.key, name: v.name, at: new Date().toISOString() }; }); }
    finally { applying = false; }
    ed.sel = null; ed.solveBar = false; saveRun(); if (!o.quiet) { draw(); panel(); }
    requestAnimationFrame(() => { if (ed && !planInView(true)) planFit(); }); // only when the site isn't all in view already (or the Plan key covers it)
    return true;
  }
  // a layout saved as numbers only: laid out again from its own program, settings and arrangement, then found by its key
  async function relay(i) {
    const v = ed.variants[i], pl = PL(); if (!v || !pl) return null;
    ctx.toast('Laying out ' + numOf(v) + ' again…');
    const base = { ...pl, setbacks: v.setbacks || pl.setbacks, params: v.params || pl.params };
    let out = []; try { out = await laid('options', base, v.program || pl.program, { count: 12 }); } catch (e) { console.warn('layout', e); }
    if (PL() !== pl || ed.variants?.[i] !== v) return null;
    const list = named(out, { ...base, program: v.program || pl.program }, v.revisedBy ? { revisedBy: v.revisedBy } : {}), r = RUN.matchLayout(list, v.key, v.name);
    if (r.index < 0) { ctx.toast(numOf(v) + ' doesn’t fit with these settings any more.'); return null; }
    const got = list[r.index], nv = r.exact ? { ...got, key: v.key, name: v.name, rank: v.rank, ai: v.ai } : { ...got, rank: v.rank, name: numOf(v) + ' · ' + got.arr };
    if (!r.exact) ctx.toast(numOf(v) + ' came out differently this time, so the nearest one (' + got.arr + ') is shown in its place.');
    ed.variants[i] = nv; return nv;
  }
  // keep a layout as a new option in this project; this option stays as it is
  async function keepAsOption(i) {
    let v = ed.variants?.[i]; const p = P(), pl = PL(); if (!v || !p || !pl) return;
    if (!v.elements) { v = await relay(i); if (!v || PL() !== pl) return; }
    const now = new Date().toISOString(), name = nextName(p) + ' · ' + (v.arr || RUN.baseName(v.name));
    const c = { ...clone(pl), id: uid(), name, created: now, updated: now, elements: clone(v.elements), spareRows: [], program: { ...(v.program || pl.program) }, setbacks: clone(v.setbacks || pl.setbacks), params: v.params ? clone(v.params) : pl.params ? clone(pl.params) : null,
      zones: clone(v.zones || []), recipe: v.recipe ? clone(v.recipe) : null, variant: { key: v.key, name: v.name, at: now }, lastRun: pl.lastRun ? RUN.slimRun({ ...clone(pl.lastRun), variants: ed.variants }, v.key) : null };
    p.plans.push(c); save(p); panel();
    ctx.toast('Saved as ' + c.name + ' in ' + p.name + '.', { action: { label: 'Open ' + c.name.split(' · ')[0], run: () => { if (db.projects.some(x => x.id === p.id)) open(p.id, c.id); } } });
  }
  // after new settings cleared the AI's scores: the AI looks at the layouts again
  async function reviewAgain() {
    const pl = PL(), ask = (ed.runMeta?.ask || pl?.lastRun?.ask || ed.ask || '').trim(); if (!pl || !ed.variants) return;
    if (!ask) { ctx.toast('Say what should go on the site under Build first; the AI reviews layouts against it.'); return; }
    const pool = ed.variants.filter(v => v.elements?.length).slice(0, 4); if (!pool.length) return;
    if (aiOff()) { ctx.toast('AI isn’t set up on this site, so the layouts can’t be reviewed.'); return; }
    const run = startRun('review', ['The AI is reviewing the layouts'], '#spReReview'); if (!run) return; ed.reviewing = true; ed.pickedByUser = false; panel();
    try { const rv = await aiReview({ ...pl }, pl.program, pool, 1, ask, run.ctl.signal); if (!live(run) || PL() !== pl) return;
      ed.reviewing = false; mergeReview(rv, pool); await pickAi();
    } catch (e) { if (!live(run)) return; ed.reviewing = false; ctx.toast(e.status === 503 ? 'AI isn’t set up on this site, so the layouts can’t be reviewed.' : 'The AI review didn’t answer. Try again in a moment.'); }
    if (!live(run)) return; saveRun(pl); endRun(run);
  }

  // ---------- exports ----------
  // notes for the sheet from the Site facts (flood zone, districts, roads, environmental records) at the middle of the site
  async function siteFacts(pl, parcel) {
    if (!ctx.siteAt) return [];
    const c = SP.frame(pl.origin).toLL(SP.centroid(pl.ring)), out = [];
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
    return out;
  }
  async function exportPdf(p, pl, size) {
    const btn = card.querySelector('#spPdf'); if (btn) { btn.disabled = true; btn.textContent = 'Preparing…'; }
    try {
      const keys = pl.parcels || (pl.parcel ? [pl.parcel] : []), parcels = keys.map(k => p.parcels.find(x => x.key === k)).filter(Boolean), F = SP.frame(pl.origin);
      const site = { type: 'Polygon', coordinates: [pl.ring.concat([pl.ring[0]]).map(F.toLL)] };
      let vicinity = ''; try { vicinity = areaMap([{ geometry: site, stroke: '#c0392b', fill: 'rgba(192,57,43,.25)', width: 2 }], { W: 320, H: 190, px: 320, minSpanM: 3500, maxTiles: 16 }); } catch (e) {}
      const facts = await siteFacts(pl), notes = SP.check(pl).map(i => i.text);
      const county = (ctx.DATA?.counties || []).find(c => (c.outline || []).some(poly => SP.inRing(F.toLL(SP.centroid(pl.ring)), poly[0])))?.name;
      const html = sheetHTML({ plan: pl, planName: pl.name, project: p, size, parcels, facts, notes, vicinity, address: parcels[0]?.label || '', county: county ? county + ' County, Texas' : '',
        date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), preparedFor: '', boundarySource: pl.src === 'drawn' ? 'a boundary drawn on the map' : pl.src === 'regrid' ? 'the Regrid parcel outline' : (keys.length > 1 ? keys.length + ' county appraisal district parcel outlines, merged' : 'the county appraisal district parcel outline') });
      const name = fileName(p, pl) + '-site-plan';
      ctx.toast('Preparing the PDF…');
      let blob = null, why = '';
      try { const r = await fetch('api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html, sheet: size, title: p.name + ' — Site plan' }) }); if (r.ok && /pdf/.test(r.headers.get('content-type') || '')) blob = await r.blob(); else why = (await r.json().catch(() => ({}))).error || 'HTTP ' + r.status; } catch (e) { why = e.message; }
      if (blob) await ctx.saveFile(name + '.pdf', blob, 'application/pdf');
      else { await ctx.saveFile(name + '.html', html, 'text/html'); ctx.toast('The PDF couldn’t be made (' + why + '). Saved as a web page instead: open it and print it on ' + (size === 'archd' ? '24 × 36' : '11 × 17') + ' paper.'); }
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Site Plan PDF'; } }
  }
  function geojson(p, pl) {
    const fc = SP.planFeatures(pl, null);
    fc.features = fc.features.filter(f => f.properties.k !== 'label').map(f => ({ ...f, properties: { ...f.properties, project: p.name, plan: pl.name } }));
    return { ...fc, properties: { project: p.name, plan: pl.name, ...SP.metrics(pl) } };
  }
  function summary(p, pl) {
    const m = SP.metrics(pl), prog = SP.normalizeProgram(pl.program), parcel = p.parcels.find(x => x.key === pl.parcel);
    return [p.name + ' · ' + pl.name, parcel?.label, SP.USES[prog.use].label + ': ' + f0(m.gfa) + ' sf' + (m.units ? ' (about ' + m.units + ' units)' : '') + ' on ' + m.acres.toFixed(2) + ' acres',
      'Coverage ' + pct(m.coverage) + ', FAR ' + m.far.toFixed(2), 'Parking ' + m.spaces + ' spaces (' + m.required + ' needed)', m.pond ? 'Detention ' + (m.pond / 43560).toFixed(2) + ' acres' : '',
      ...SP.check(pl).map(i => '• ' + i.text)].filter(Boolean).join('\n');
  }

  // ---------- the Projects view ----------
  // All projects as cards or a list (the choice is kept in this browser), with search and sort. Click one for its page:
  // a summary card (site area, parcels, owners, appraised value, options), the parcels, each option drawn with its
  // numbers, and notes. Text wraps rather than being cut off. A sync never redraws under someone typing (it waits
  // until they leave the field), so half-typed notes or a name aren't lost.
  const VIEW_KEY = 'fs-projects-view';
  const SORTS = { updated: 'Recently updated', name: 'Name', acres: 'Largest site', options: 'Most options' };
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
    if (!v) { const drawn = pl.ring.length >= 3, m = drawn ? SP.metrics(pl) : null; let fin = null; if (m?.gfa) try { fin = RUN.finOf(pfRun(p, pl)); } catch (e) { fin = null; } // the money as its Pro forma shows it
      const m1 = m?.gfa && pl.elements.some(e => e.phase === 2) ? SP.metrics({ ...pl, elements: pl.elements.filter(e => e.phase !== 2) }) : null; // Phase 1 first, as on the plan
      v = { drawn, m, m1, fin, bad: drawn ? SP.check(pl).filter(i => i.level === 'bad').length : 0 }; infos.set(k, v); if (infos.size > 400) infos.delete(infos.keys().next().value); }
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
  function siteFor(p) {
    const last = p.plans.filter(x => x.ring.length >= 3).sort((a, b) => t(b.created) - t(a.created))[0];
    if (last) return { origin: last.origin, ring: clone(last.ring), src: last.src, front: last.front, frontGuess: last.frontGuess, setbacks: { ...last.setbacks }, parcel: last.parcel, parcels: last.parcels, zoning: last.zoning || null, program: { use: SP.normalizeProgram(last.program).use } };
    const recs = p.parcels.filter(x => x.geometry), b = recs.length ? siteOf(recs) : null;
    return b?.ring?.length >= 3 ? { origin: b.origin, ring: b.ring, src: recs.length > 1 ? 'parcels' : 'parcel', parcel: recs[0].key, parcels: recs.map(r => r.key) } : null;
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
  function addOption(p) { const s = siteFor(p); if (!s) return drawSite(p); const pl = newPlan(p, s); p.plans.push(pl); save(p); open(p.id, pl.id); }
  function drawSite(p) { const c = map.getCenter(), pl = newPlan(p, { origin: [+c.lng.toFixed(6), +c.lat.toFixed(6)] }); p.plans.push(pl); save(p); open(p.id, pl.id, { draw: true }); }

  // ----- all projects -----
  function shown() {
    const q = pq.trim().toLowerCase(), by = { updated: (a, b) => t(b.updated) - t(a.updated), name: (a, b) => a.name.localeCompare(b.name), acres: (a, b) => acresOf(b) - acresOf(a), options: (a, b) => b.plans.length - a.plans.length || t(b.updated) - t(a.updated) }[psort];
    return db.projects.filter(p => !q || [p.name, p.notes, p.by, ...p.parcels.flatMap(x => [x.label, x.owner]), ...p.plans.map(x => x.name)].join(' ').toLowerCase().includes(q)).sort(by);
  }
  function cardHtml(p) {
    const ac = acresOf(p), big = biggest(p), addr = addrOf(p), c = cover(p);
    return '<button type="button" class="pj-card" data-open="' + esc(p.id) + '"><span class="pj-thumb">' + (c || '<i>No site yet</i>') + '</span><span class="pj-cb">' +
      '<b class="pj-cn">' + esc(p.name) + '</b>' + (addr ? '<span class="pj-addr">' + PIN + '<span>' + addr + '</span></span>' : '') +
      '<span class="pj-facts">' + (ac ? '<span class="pj-fact"><b>' + ac.toFixed(2) + '</b> acres</span>' : '') + '<span class="pj-fact"><b>' + f0(p.plans.length) + '</b> option' + (p.plans.length === 1 ? '' : 's') + '</span>' +
        (big ? '<span class="pj-fact"><b>' + f0(big.m.gfa) + '</b> sq ft max</span>' : '') + '</span>' +
      '<span class="pj-upd">Updated ' + when(ver(p)) + (p.by ? ' by ' + esc(p.by) : '') + '</span></span></button>';
  }
  function rowHtml(p) {
    const ac = acresOf(p), big = biggest(p), addr = addrOf(p), c = cover(p);
    return '<button type="button" class="pj-row" data-open="' + esc(p.id) + '"><span class="pj-thumb pj-rthumb">' + (c || '<i>No site</i>') + '</span>' +
      '<span class="pj-rmain"><b>' + esc(p.name) + '</b>' + (addr ? '<span class="pj-addr">' + PIN + '<span>' + addr + '</span></span>' : '') + '</span>' +
      '<span class="pj-rstats"><span class="pj-rc">' + (ac ? '<b>' + ac.toFixed(2) + '</b> acres' : '<em>No site</em>') + '</span><span class="pj-rc"><b>' + f0(p.plans.length) + '</b> option' + (p.plans.length === 1 ? '' : 's') + '</span>' +
        '<span class="pj-rc">' + (big ? '<b>' + f0(big.m.gfa) + '</b> sq ft' : '<em>Not laid out</em>') + '</span><span class="pj-rc pj-rupd">' + when(ver(p)) + (p.by ? ' by ' + esc(p.by) : '') + '</span></span>' +
      '<span class="pj-chev" aria-hidden="true">›</span></button>';
  }
  function listHtml() {
    if (!db.projects.length) return '<div class="pj-empty"><b>No projects yet</b><ol><li>On the map, zoom in to street level and click a parcel or building.</li><li>At the top of its card, click <b>Site plan</b>. (In Harris or Waller County, get the parcel from Regrid in the card’s Ownership section first.)</li><li>Lay out the site by hand, or describe what you want and use <b>Build with AI</b>.</li></ol><div class="btnrow"><button type="button" class="btn primary" data-go="map">Go to the Map</button></div></div>';
    const list = shown();
    if (!list.length) return '<div class="pj-empty">No projects match “' + esc(pq) + '”. <button type="button" class="lnk" data-clear="1">Show all projects</button></div>';
    return mode === 'list' ? '<div class="pj-list"><div class="pj-lh" aria-hidden="true"><span></span><span>Project</span><span>Site</span><span>Options</span><span>Largest option</span><span>Updated</span><span></span></div>' + list.map(rowHtml).join('') + '</div>'
      : '<div class="pj-grid">' + list.map(cardHtml).join('') + '</div>';
  }
  function indexHtml() {
    const all = db.projects, nPlans = all.reduce((s, p) => s + p.plans.length, 0);
    const share = shared === true ? 'shared with the team' : shared === false ? 'saved on this device only' : 'saved on this device';
    return '<div class="vhead"><div><div class="kicker">My Work</div><h2>Projects</h2><div class="vsub">' + (all.length ? plural(all.length, 'project') + ' · ' + plural(nPlans, 'site plan option') + ' · ' : '') + share + '</div></div>' +
        '<div class="vctl">' + (adding ? '' : '<button type="button" class="btn primary" id="pjNew">+ New Project</button>') + '<div class="team-slot" id="pjTeam"></div></div></div>' +
      (adding ? '<form class="pj-new" id="pjForm"><label class="sr" for="pjNm">New project name</label><input id="pjNm" maxlength="120" placeholder="Project name" autocomplete="off"><span class="btnrow"><button class="btn primary">Create Project</button><button type="button" class="btn" id="pjCancel">Cancel</button></span>' +
        '<div class="rnote">You can add parcels and site plans to it next. To start from a parcel instead, click it on the map and use <b>Site plan</b> at the top of its card.</div></form>' : '') +
      (all.length ? '<div class="pj-bar"><label class="search sm pj-q"><input type="search" id="pjQ" placeholder="Search projects" value="' + esc(pq) + '" aria-label="Search projects, parcels, owners and notes"></label>' +
        '<div class="pj-ctl"><label class="pj-sort">Sort <select class="chip" id="pjSort">' + Object.entries(SORTS).map(([k, l]) => '<option value="' + k + '"' + (psort === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
        '<div class="seg seg2 pj-mode" role="group" aria-label="Show projects as">' + [['cards', 'Cards', ICON_CARDS], ['list', 'List', ICON_LIST]].map(([k, l, ic]) => '<button type="button" data-v="' + k + '" aria-pressed="' + (mode === k) + '">' + ic + l + '</button>').join('') + '</div></div></div>' : '') +
      '<div id="pjList">' + listHtml() + '</div>';
  }

  // ----- one project -----
  function planTile(p, pl) {
    const { drawn, m, m1, bad, fin } = info(p, pl), use = SP.USES[SP.normalizeProgram(pl.program).use], a = m1 || m, p2 = m1 ? K.headline(m, m1, null).p2 : '';
    const stat = (v, l, cls) => '<span' + (cls ? ' class="' + cls + '"' : '') + '><b>' + v + '</b>' + l + '</span>';
    return '<button type="button" class="pj-plan" data-plan="' + esc(pl.id) + '" title="Open ' + esc(pl.name) + ' on the map">' +
      '<span class="pj-thumb">' + (drawn ? thumb(p, pl) : '<i>No site drawn</i>') + (bad ? '<span class="pj-iss">' + plural(bad, 'issue') + '</span>' : '') + (lastOpen?.plid === pl.id ? '<span class="pj-live" title="The option you had open last">Last opened</span>' : '') + '</span>' +
      '<span class="pj-ph"><b>' + esc(pl.name) + '</b>' + (m?.gfa ? '<em>' + esc(use.label) + (a.units ? ' · ' + plural(a.units, 'unit') + (m1 ? ' in Phase 1' : '') : '') + '</em>' : '') + '</span>' +
      (m?.gfa ? '<span class="pj-stats">' + stat(f0(a.gfa), m1 ? 'sq ft, Phase 1' : 'sq ft') + stat(f0(m.spaces), 'spaces, ' + f0(m.required) + ' needed', m.spaces < m.required ? 'short' : '') + stat(pct(m.coverage), 'coverage') + '</span>' +
        (p2 ? '<span class="pj-p2">' + esc(p2) + '</span>' : '') + (fin ? '<span class="pj-fin" title="From this option’s Pro forma (land at ' + $M(fin.land) + ')">' + (fin.forSale ? $M(fin.cost) + ' cost · ' + pc2(fin.margin) + ' margin' : '≈ ' + $M(fin.value) + ' value · ' + pc2(fin.yoc) + ' yield on cost') + '</span>' : '')
        : '<span class="pj-none">' + (drawn ? m.acres.toFixed(2) + ' acres, nothing laid out yet' : 'Open it to draw the site on the map') + '</span>') + '</button>';
  }
  function detailHtml(p) {
    const ac = acresOf(p), big = biggest(p), can = !!siteFor(p), c = cover(p);
    const owners = [...new Set(p.parcels.map(x => x.owner).filter(Boolean))], value = p.parcels.reduce((s, x) => s + (x.marketValue || 0), 0), land = p.parcels.reduce((s, x) => s + (x.landValue || 0), 0);
    const fact = (k, v, sub) => '<div><dt>' + k + '</dt><dd>' + v + (sub ? '<small>' + sub + '</small>' : '') + '</dd></div>';
    return '<button type="button" class="lnk pj-back" data-back="1">‹ All projects</button>' +
      '<section class="pj-sum"><div class="pj-thumb pj-sthumb">' + (c || '<i>No site yet</i>') + '</div><div class="pj-sb"><div class="kicker">Project</div>' +
        (renaming ? '<form class="pj-ren" id="pjRenForm"><label class="sr" for="pjRen">Project name</label><textarea id="pjRen" rows="1" maxlength="120">' + esc(p.name) + '</textarea><span class="btnrow"><button class="btn primary">Save</button><button type="button" class="btn" id="pjRenX">Cancel</button></span></form>'
          : '<div class="pj-title"><h2>' + esc(p.name) + '</h2><button type="button" class="lnk" id="pjRename">Rename</button></div>') +
        '<div class="vsub">Updated ' + when(ver(p)) + (p.by ? ' by ' + esc(p.by) : '') + (p.created ? ' · started ' + when(p.created) : '') + '</div>' +
        '<dl class="pj-dl">' + fact('Site area', ac ? ac.toFixed(2) + ' acres' : 'Not set', ac ? f0(ac * 43560) + ' sq ft' : '') + fact('Parcels', f0(p.parcels.length)) +
          (owners.length ? fact(owners.length > 1 ? 'Owners' : 'Owner', esc(owners[0]), owners.length > 1 ? 'and ' + plural(owners.length - 1, 'other') : '') : '') +
          (value ? fact('Appraised value', money(value), land ? 'land ' + money(land) : '') : '') + fact('Site plan options', f0(p.plans.length)) +
          (big ? fact('Largest option', f0(big.m.gfa) + ' sq ft', esc(big.pl.name) + ' · ' + esc(SP.USES[SP.normalizeProgram(big.pl.program).use].label) + (big.m.units ? ' · ' + plural(big.m.units, 'unit') : '')) : '') + '</dl></div></section>' +
      '<section class="pj-sec"><div class="lt">Parcels' + (p.parcels.length ? ' · ' + f0(p.parcels.length) : '') + '</div>' + (p.parcels.length ? '<div class="pj-prows">' + p.parcels.map(x => '<div class="pj-prow"><span class="pj-pi">' + PIN + '</span><div class="pj-pm"><b>' + esc(x.label) + '</b><span>' +
          [x.owner ? esc(x.owner) : '', x.acres ? x.acres.toFixed(2) + ' acres' : '', x.marketValue ? 'appraised ' + money(x.marketValue) : ''].filter(Boolean).join(' · ') + '</span></div><button type="button" class="btn" data-parcel="' + esc(x.key) + '">Show on Map</button></div>').join('') + '</div>'
        : '<div class="pj-start"><b>No parcels yet</b><p>Find the parcel on the map, click it, then <b>Site plan</b> at the top of its card and choose <b>Add to ' + esc(p.name) + '</b>. Or click the corners of the site yourself.</p><div class="btnrow"><button type="button" class="btn primary" data-find="1">Find a Parcel</button><button type="button" class="btn" data-draw="1">Draw a Site</button></div></div>') + '</section>' +
      '<section class="pj-sec"><div class="lt">Site plan options · ' + f0(p.plans.length) + '</div><div class="pj-plans">' + p.plans.map(pl => planTile(p, pl)).join('') +
        (can ? '<button type="button" class="pj-plan pj-add" data-add="1"><span class="pj-plus" aria-hidden="true">+</span><b>New Option</b><span class="pj-none">' + (p.plans.some(x => x.ring.length >= 3) ? 'A blank plan on the same site' : 'A blank plan on ' + (p.parcels.length > 1 ? 'these parcels' : 'this parcel')) + '</span></button>'
          : p.parcels.length ? '<div class="pj-start"><b>No site outline</b><p>These parcels have no outline from the county. Click the corners of the site on the map.</p><div class="btnrow"><button type="button" class="btn" data-draw="1">Draw a Site</button></div></div>' : '<div class="pj-none">No options yet: add a parcel or draw the site first.</div>') + '</div></section>' +
      '<section class="pj-sec"><div class="lt"><label for="pjNotes">Notes</label></div><textarea class="pj-notes" id="pjNotes" rows="' + Math.min(10, Math.max(3, (p.notes || '').split('\n').length + 1)) + '" placeholder="Asking price, broker, next steps…">' + esc(p.notes || '') + '</textarea></section>' +
      '<div class="pj-foot"><span class="btnrow">' + (can ? '<button type="button" class="btn" data-draw="1" title="Click the corners of a different site on the map">Draw a Different Site</button>' : '') + '</span><button type="button" class="lnk pj-del" data-delp="1">Delete Project</button></div>';
  }

  // now: the person asked for this redraw (a click, a sort); otherwise (a save or a sync) it waits while they type
  function render(now) {
    if (!root) return;
    const a = document.activeElement;
    if (now !== true && a && root.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) { waiting = true; return; } // redraw once they leave the field
    waiting = false;
    const key = a && root.contains(a) ? (a.id ? '#' + a.id : ['open', 'plan', 'v', 'parcel'].map(k => a.dataset[k] != null ? '[data-' + k + '="' + CSS.escape(a.dataset[k]) + '"]' : '').find(Boolean) || (a.classList[0] ? '.' + a.classList[0] : null)) : null;
    const p = cur && db.projects.find(x => x.id === cur); if (!p) { cur = null; renaming = false; }
    root.innerHTML = '<div class="pj-wrap">' + (p ? detailHtml(p) : indexHtml()) + '</div>';
    ctx.team?.chip?.(root.querySelector('#pjTeam')); // who you are and whether projects are shared; opens Settings
    wire(p);
    if (key) try { root.querySelector(key)?.focus(); } catch (e) { /* the control is gone */ }
  }
  function show(id) { cur = id; renaming = false; adding = false; render(true); root.scrollTop = 0; }
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
          db.projects.push(np); adding = false; pq = ''; document.activeElement?.blur(); cur = np.id; save(np); root.scrollTop = 0; };
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
    on('[data-back]', () => show(null));
    on('#pjRename', () => { renaming = true; render(true); const r = $('#pjRen'); if (r) { grow(r); r.focus(); r.select(); } });
    const rf = $('#pjRenForm');
    if (rf) {
      const r = $('#pjRen'); grow(r); r.oninput = () => grow(r);
      rf.onsubmit = e => { e.preventDefault(); const v = r.value.replace(/\s+/g, ' ').trim(); renaming = false; document.activeElement?.blur(); if (v && v !== p.name) { p.name = v; save(p); } render(true); };
      r.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); rf.requestSubmit(); } else if (e.key === 'Escape') $('#pjRenX').click(); };
      $('#pjRenX').onclick = () => { renaming = false; render(true); };
    }
    const nt = $('#pjNotes');
    nt.oninput = () => { if (nt.scrollHeight > nt.clientHeight + 2) grow(nt); };
    nt.onchange = () => { p.notes = nt.value.slice(0, 8000); save(p); };
    root.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { const pl = p.plans.find(x => x.id === b.dataset.plan), none = pl && pl.ring.length < 3; open(p.id, b.dataset.plan, { draw: none }); });
    root.querySelectorAll('[data-parcel]').forEach(b => b.onclick = () => { const x = p.parcels.find(y => y.key === b.dataset.parcel); ctx.setView('map'); map.easeTo({ center: x.center, zoom: Math.max(map.getZoom(), 17) }); ctx.openBuildingAt(x.center); });
    on('[data-add]', () => addOption(p));
    on('[data-draw]', () => drawSite(p));
    on('[data-find]', () => { pending = { id: p.id, t: Date.now() }; ctx.setView('map'); ctx.toast('Zoom in and click the parcel, then Site plan at the top of its card: it goes into ' + p.name + '.'); });
    on('[data-delp]', () => { if (!confirm('Delete the project ' + p.name + ' and its ' + plural(p.plans.length, 'plan') + '? This removes it for the team too.')) return; db.projects = db.projects.filter(x => x.id !== p.id); db.dirty = db.dirty.filter(i => i !== p.id); db.gone.push(p.id); cur = null; save(); });
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
    ed.ask = request; panel(); await build();
    if (!PL()) return { error: 'The plan was closed before the layouts came back.' };
    const m = SP.metrics(PL()), issues = SP.check(PL());
    return { built: true, project: P().name, plan: PL().name, options: (ed.variants || []).map(v => ({ name: v.name, building_sf: Math.round(v.m.gfa), spaces: v.m.spaces, required: v.m.required, coverage_pct: Math.round(v.m.coverage * 100), passes_checks: K.passes(v.chk), notes: v.notes })),
      shown: { building_sf: Math.round(m.gfa), units: m.units, spaces: m.spaces, required: m.required, coverage_pct: Math.round(m.coverage * 100), far: +m.far.toFixed(2), detention_acres: +(m.pond / 43560).toFixed(2) }, issues: issues.map(i => i.text), note: ed.aiNote || '' };
  }

  // the projects a property card's parcel is already in (its Site plan button reads "Open site plan" then)
  function projectsFor(parcel, center) { if (!parcel && !center) return []; try { return RUN.projectsWith(db.projects, [parcelOf(parcel || {}, center || parcel?.center).key]); } catch (e) { return []; } }
  ctx.sitePlan = { start, open, close, get editing() { return !!ed; }, forAssistant, get projects() { return db.projects; }, sync, projectsFor, // sync: Settings runs it after a new team passcode
    get pendingProject() { return pendingProject() && pending; }, set pendingProject(v) { pending = v?.id ? { id: v.id, t: v.t || Date.now() } : null; } };
}
