// Projects and site plans. From a property card (Site Tools → Start Site Plan), start a project or add the parcel to
// one, then lay out a site plan on the map: buildings, parking (stalls counted as you size it), drives, truck court,
// detention and landscape, checked against setbacks, with coverage, FAR and parking numbers. "Build with AI" turns a
// request ("25,000 sf retail strip") into a program (api/siteplan) and lib/siteplan.mjs lays out three options.
// Projects are kept on this device and shared with the team through /api/projects once it's set up. Exports DXF
// (AutoCAD, CADCraft and other CAD programs) and GeoJSON.
import * as SP from './lib/siteplan.mjs';
import { composeSite } from './lib/sitecompose.mjs';
import { sheetHTML } from './lib/sitesheet.mjs';
import { areaMap } from './reportkit.js';

const KEY = 'fs-projects-v1', CODE_KEY = 'fs-team-code', NAME_KEY = 'fs-team-name';
const STATUS = ['Idea', 'Pursuing', 'Under contract', 'Closed', 'Passed'];
const ADD = ['building', 'parking', 'drive', 'truck', 'pond', 'green'];
const SIZE = { building: [120, 100], parking: [180, 60], drive: [26, 80], truck: [200, 130], pond: [120, 80], green: [40, 40] };
const SUGGEST = ['25,000 sf retail strip with 2 pads', '6,000 sf restaurant with drive-thru', '2-story medical office', '200 apartments, 3 stories', 'Warehouse with truck court, as big as fits', 'Mixed use: retail in front, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units'];
const COL = { building: '#d0694c', parking: '#9aa3a6', drive: '#7c8689', truck: '#9a8fb8', pond: '#5b9bd1', green: '#62b072', plaza: '#d9c8a9', court: '#4f7fa3', pool: '#7ccbe6', play: '#e3cc9a' };
const USE_COL = { retail: '#c8673d', restaurant: '#c8673d', office: '#b5553c', medical: '#b5553c', other: '#b0603f', industrial: '#a2775b', multifamily: '#d8b16a', townhomes: '#b8865b', duplex: '#d9a77c', amenity: '#8a6fb3' };
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
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { ctx.toast('This browser won’t let the page save projects.'); } }
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
        const r = await fetch('api/projects', { method: 'POST', headers: h, body: JSON.stringify({ projects: db.projects.filter(p => db.dirty.includes(p.id)), deletes: gone, name: get(NAME_KEY) }) });
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
  function badge() { const n = db.projects.length, el = document.getElementById('pjBadge'), m = document.getElementById('mPjN'); if (el) el.textContent = n ? fmtN(n) : ''; if (m) m.textContent = n ? fmtN(n) : ''; }
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
    const rec = { key: '', label: pc.situs || pc.owner || 'Parcel', owner: pc.owner || '', propId: pc.propId || null, acres: g ? +(SP.ringArea(SP.boundaryFrom(g, center)?.ring || []) / 43560).toFixed(3) : null, center: cc.map(v => +v.toFixed(6)), geometry: llRound(g) || null };
    rec.key = parcelKey(rec); return rec; };
  // the site boundary for a set of parcels (one outline, or several merged)
  function siteOf(recs) { const g = recs.map(r => r.geometry).filter(Boolean); return g.length > 1 ? SP.unionParcels(g) : g.length ? { ...SP.boundaryFrom(g[0], recs[0].center), pieces: 1 } : null; }
  function start(info) {
    let list = (info?.parcels?.length ? info.parcels : info?.parcel ? [info.parcel] : []).slice(0, MAXP);
    if (!info?.center && !list.length) { ctx.toast('Open a parcel first: click a building or open ground at street zoom.'); return; }
    const rg = ctx.lastRegrid?.geom, center = info.center || list[0]?.center;
    if (list.length <= 1 && !list[0]?.geometry && rg && inGeom(center, rg)) list = [{ ...(list[0] || {}), geometry: rg, regrid: true }]; // Harris and Waller: Regrid's outline
    const recs = list.map(pc => parcelOf(pc, center)), b = siteOf(recs), many = recs.length > 1;
    const label = many ? recs.length + ' parcels' + (recs[0].label ? ' · ' + recs[0].label : '') : recs[0]?.label || info.title || 'Site';
    const acres = b ? SP.ringArea(b.ring) / 43560 : null, recent = db.projects.slice().sort((x, y) => t(y.updated) - t(x.updated)).slice(0, 8);
    const noGeom = recs.filter(r => !r.geometry).length;
    ctx.clearSelection?.();
    card.innerHTML = '<div class="top"><div><div class="kicker">Site Plan</div><h2>Start a site plan</h2><div class="bsub">' + esc(label) + (acres ? ' · ' + acres.toFixed(2) + ' acres' : '') + '</div></div>' + xBtn() + '</div>' +
      '<div class="bsec sp-start"><div class="lt">Project</div>' +
      '<label class="sp-radio"><input type="radio" name="spP" value="" checked> New project <input id="spName" class="sp-in" value="' + esc(recs[0]?.label || label) + '" aria-label="Project name"></label>' +
      recent.map(p => '<label class="sp-radio"><input type="radio" name="spP" value="' + esc(p.id) + '"> Add to <b>' + esc(p.name) + '</b> <span class="rnote">' + p.plans.length + ' plan' + (p.plans.length === 1 ? '' : 's') + '</span></label>').join('') +
      '<div class="lt" style="margin-top:12px">Site</div><div class="rnote">' + (b ? (many ? recs.length + ' parcel outlines from the county appraisal district, merged into one site (small gaps and overlaps between them are closed up).' : 'The parcel outline from ' + (list[0]?.regrid ? 'Regrid' : 'the county appraisal district') + '.') + ' You can add or remove parcels, or redraw the site, in the plan.' : 'There’s no parcel outline here (Harris and Waller parcels need Regrid details first). You’ll draw the site on the map.') + '</div>' +
      (b?.pieces > 1 ? '<div class="rnote sp-warn">Some parcels don’t touch the rest (a road or a gap wider than 6 ft between them), so they’re left out of the site.</div>' : '') +
      (noGeom && b ? '<div class="rnote sp-warn">' + noGeom + ' of the parcels have no outline from the county and are left out.</div>' : '') +
      '<div class="bacts" style="padding:12px 0 0"><button class="btn askai" id="spStart">Start Site Plan</button><button class="btn" id="spBack">Back</button></div></div>';
    card.classList.add('open');
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#spBack').onclick = () => ctx.openBuildingAt(center);
    card.querySelector('#spStart').onclick = () => {
      const pick = card.querySelector('input[name=spP]:checked').value;
      let p = db.projects.find(x => x.id === pick);
      if (!p) { p = { id: uid(), name: card.querySelector('#spName').value.trim() || label, status: 'Idea', notes: '', parcels: [], plans: [], created: new Date().toISOString(), by: get(NAME_KEY) }; db.projects.push(p); }
      for (const r of recs) { const i = p.parcels.findIndex(x => x.key === r.key); if (i < 0) p.parcels.push(r); else if (!p.parcels[i].geometry && r.geometry) p.parcels[i] = r; }
      const z = ctx.lastRegrid?.zoning && list.some(x => x.regrid) ? zoningOf(ctx.lastRegrid.zoning) : null;
      const plan = newPlan(p, b ? { origin: b.origin, ring: b.ring, src: many ? 'parcels' : list[0]?.regrid ? 'regrid' : 'parcel', parcel: recs[0].key, parcels: recs.map(r => r.key), zoning: z } : { parcel: recs[0]?.key, parcels: recs.map(r => r.key), origin: center });
      p.plans.push(plan); save(p); open(p.id, plan.id, { draw: !b });
    };
    return true;
  }
  const inGeom = (pt, g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).some(p => SP.inRing(pt, p[0]));
  const zoningOf = z => Object.fromEntries(['zoning', 'zoning_description', 'max_far', 'max_coverage_pct', 'max_building_height_ft', 'max_density_du_per_acre'].filter(k => z[k] != null && z[k] !== '').map(k => [k, z[k]]));
  const xBtn = () => '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>';

  // ---------- the editor ----------
  let hidBldg = null;
  function open(pid, plid, o = {}) {
    if (ctx.view !== 'map') ctx.setView('map');
    if (card.classList.contains('open')) ctx.closeCard(); // the building card's selection goes; the plan takes over the card
    ed = { pid, plid, sel: null, undo: [], redo: [], mode: o.draw ? 'draw' : null, draft: [], variants: null };
    if (map.getLayer('fs-bldg')) { hidBldg = map.getLayoutProperty('fs-bldg', 'visibility') || 'visible'; map.setLayoutProperty('fs-bldg', 'visibility', 'none'); } // the plan replaces what's there
    addLayers(); draw(); panel(); fit();
    const pl = PL(); if (pl?.ring.length >= 3 && pl.frontGuess) map.once('idle', () => { if (PL() === pl && pl.frontGuess) detectFront(pl); });
  }
  function close() {
    if (!ed) return; ed = null; draw();
    if (hidBldg && map.getLayer('fs-bldg')) map.setLayoutProperty('fs-bldg', 'visibility', hidBldg); hidBldg = null;
  }
  ctx.onCardClose?.(() => close());
  ctx.onCardRender?.(() => close()); // another card (a filing, a search result) took the panel
  function fit() {
    const pl = PL(), F = pl?.origin && SP.frame(pl.origin), r = pl?.ring || [];
    if (!F) return; if (r.length < 3) { map.easeTo({ center: pl.origin, zoom: Math.max(map.getZoom(), 17), pitch: 0 }); return; }
    const ll = r.map(F.toLL), xs = ll.map(p => p[0]), ys = ll.map(p => p[1]);
    ctx.fitBox([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { maxZoom: 19 });
  }

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
    const f = SP.frontFromRoads(pl.ring, lines);
    if (f != null) { pl.front = f; pl.frontGuess = false; save(P()); draw(); panel(); }
  }

  function snapshot() { const pl = PL(); return clone({ zones: pl.zones || [], elements: pl.elements, front: pl.front, frontGuess: pl.frontGuess, setbacks: pl.setbacks, program: pl.program, ring: pl.ring, origin: pl.origin, src: pl.src }); }
  function change(fn, keepPanel) {
    const pl = PL(); if (!pl) return; ed.undo.push(snapshot()); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = [];
    fn(pl); pl.updated = new Date().toISOString(); save(P()); draw(); if (!keepPanel) panel(); else nums();
  }
  function undo(back = true) {
    const pl = PL(), from = back ? ed.undo : ed.redo, to = back ? ed.redo : ed.undo; if (!pl || !from.length) return;
    to.push(snapshot()); Object.assign(pl, from.pop()); if (ed.sel && !pl.elements.some(e => e.id === ed.sel)) ed.sel = null; save(P()); draw(); panel();
  }

  // ---------- map layers ----------
  const SRC = 'fs-sp', HSRC = 'fs-sp-h', DSRC = 'fs-sp-d', EMPTY = { type: 'FeatureCollection', features: [] };
  function addLayers() {
    if (map.getSource(SRC)) return;
    const kind = k => ['==', ['get', 'k'], k], dark = ctx.isDark();
    map.addSource(SRC, { type: 'geojson', data: EMPTY }); map.addSource(HSRC, { type: 'geojson', data: EMPTY }); map.addSource(DSRC, { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'fs-sp-lot', type: 'fill', source: SRC, filter: kind('lot'), paint: { 'fill-color': dark ? '#ffffff' : '#ffffff', 'fill-opacity': dark ? .06 : .35 } });
    map.addLayer({ id: 'fs-sp-zone', type: 'line', source: SRC, filter: kind('zone'), paint: { 'line-color': dark ? '#939a9d' : '#6b7174', 'line-width': 1, 'line-dasharray': [6, 4] } });
    map.addLayer({ id: 'fs-sp-fill', type: 'fill', source: SRC, filter: ['in', ['get', 'k'], ['literal', ['parking', 'drive', 'truck', 'pond', 'green', 'plaza', 'court', 'pool', 'play']]],
      paint: { 'fill-color': ['match', ['get', 'k'], 'parking', COL.parking, 'drive', COL.drive, 'truck', COL.truck, 'pond', COL.pond, 'plaza', COL.plaza, 'court', COL.court, 'pool', COL.pool, 'play', COL.play, COL.green], 'fill-opacity': ['case', ['==', ['get', 'sel'], 1], .9, .75] } });
    map.addLayer({ id: 'fs-sp-walk', type: 'fill', source: SRC, filter: kind('walk'), paint: { 'fill-color': dark ? '#5b6366' : '#ecece6', 'fill-opacity': .85 } });
    map.addLayer({ id: 'fs-sp-stall', type: 'line', source: SRC, filter: kind('stall'), minzoom: 16, paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': .9 } });
    map.addLayer({ id: 'fs-sp-isl', type: 'fill', source: SRC, filter: kind('island'), paint: { 'fill-color': COL.green, 'fill-opacity': .9 } });
    map.addLayer({ id: 'fs-sp-pl', type: 'line', source: SRC, filter: kind('pline'), paint: { 'line-color': dark ? '#8acda3' : '#0a7a36', 'line-width': 1, 'line-dasharray': [4, 3], 'line-opacity': .8 } });
    map.addLayer({ id: 'fs-sp-sb', type: 'line', source: SRC, filter: kind('setback'), paint: { 'line-color': dark ? '#bcc2c4' : '#4d5457', 'line-width': 1.3, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'fs-sp-lotl', type: 'line', source: SRC, filter: kind('lot'), paint: { 'line-color': dark ? '#4caf70' : '#006527', 'line-width': 2.5 } });
    map.addLayer({ id: 'fs-sp-front', type: 'line', source: SRC, filter: kind('front'), paint: { 'line-color': '#e0a23c', 'line-width': 5, 'line-opacity': .9 } });
    map.addLayer({ id: 'fs-sp-tree', type: 'circle', source: SRC, filter: kind('tree'), minzoom: 15, paint: { 'circle-color': '#7fae5f', 'circle-opacity': .85, 'circle-stroke-color': '#55803c', 'circle-stroke-width': 1,
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 15, ['*', ['get', 'r'], 0.074], 22, ['*', ['get', 'r'], 9.42]] } }); // canopy radius in feet, to scale
    map.addLayer({ id: 'fs-sp-bldg', type: 'fill-extrusion', source: SRC, filter: kind('building'), paint: { 'fill-extrusion-color': ['case', ['==', ['get', 'bad'], 1], '#d64541', ['match', ['get', 'use'], ...Object.entries(USE_COL).flat(), COL.building]], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .88 } });
    map.addLayer({ id: 'fs-sp-edge', type: 'line', source: SRC, filter: ['in', ['get', 'k'], ['literal', ['building', 'parking', 'drive', 'truck', 'pond', 'green', 'plaza', 'court', 'pool', 'play']]],
      paint: { 'line-color': ['case', ['==', ['get', 'bad'], 1], '#d64541', ['==', ['get', 'sel'], 1], dark ? '#ffffff' : '#0b0d0c', dark ? 'rgba(255,255,255,.5)' : 'rgba(11,13,12,.45)'], 'line-width': ['case', ['==', ['get', 'sel'], 1], 2.5, ['==', ['get', 'bad'], 1], 2, 1] } });
    map.addLayer({ id: 'fs-sp-lab', type: 'symbol', source: SRC, filter: kind('label'), layout: { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-size': ['case', ['==', ['get', 'big'], 1], 12, 10.5], 'text-allow-overlap': false, 'text-max-width': 14 },
      paint: { 'text-color': '#0b0d0c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
    map.addLayer({ id: 'fs-sp-dl', type: 'line', source: DSRC, paint: { 'line-color': '#e0a23c', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'fs-sp-dp', type: 'circle', source: DSRC, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#e0a23c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'fs-sp-h', type: 'circle', source: HSRC, paint: { 'circle-radius': ['case', ['==', ['get', 'r'], 1], 7, 6], 'circle-color': ['case', ['==', ['get', 'r'], 1], '#e0a23c', '#ffffff'], 'circle-stroke-color': '#0b0d0c', 'circle-stroke-width': 1.5 } });
    draw();
  }
  ctx.onOverlays?.(() => { for (const id of ['fs-sp-zone', 'fs-sp-walk', 'fs-sp-isl', 'fs-sp-tree', 'fs-sp-pl', 'fs-sp-lot', 'fs-sp-fill', 'fs-sp-stall', 'fs-sp-sb', 'fs-sp-lotl', 'fs-sp-front', 'fs-sp-bldg', 'fs-sp-edge', 'fs-sp-lab', 'fs-sp-dl', 'fs-sp-dp', 'fs-sp-h']) if (map.getLayer(id)) map.removeLayer(id);
    for (const s of [SRC, HSRC, DSRC]) if (map.getSource(s)) map.removeSource(s); if (ed) { addLayers(); if (map.getLayer('fs-bldg')) map.setLayoutProperty('fs-bldg', 'visibility', 'none'); } });
  function handles(pl) {
    const e = pl.elements.find(x => x.id === ed.sel); if (!e) return [];
    const F = SP.frame(pl.origin), c = SP.corners(e), top = [e.x, e.y], a = (e.rot || 0) * Math.PI / 180, L = e.d / 2 + Math.max(14, e.d * 0.15);
    return c.map((p, i) => ({ i, at: F.toLL(p) })).concat([{ i: 'r', at: F.toLL([top[0] - Math.sin(a) * L, top[1] + Math.cos(a) * L]) }]);
  }
  function draw() {
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const pl = ed && PL(), s = map.getSource(SRC); if (!s) return;
      const fc = pl?.ring.length >= 3 ? SP.planFeatures(pl, ed.sel) : EMPTY, P0 = P();
      if (fc !== EMPTY && (pl.parcels?.length > 1 || ed.mode === 'parcels')) for (const k of pl.parcels || []) { const r = P0.parcels.find(x => x.key === k); if (r?.geometry) fc.features.push({ type: 'Feature', properties: { k: 'pline' }, geometry: r.geometry }); }
      s.setData(fc);
      map.getSource(HSRC)?.setData(pl?.ring.length >= 3 ? { type: 'FeatureCollection', features: handles(pl).map(h => ({ type: 'Feature', properties: { r: h.i === 'r' ? 1 : 0 }, geometry: { type: 'Point', coordinates: h.at } })) } : EMPTY);
      const d = ed?.mode === 'draw' && pl?.origin ? ed.draft.map(SP.frame(pl.origin).toLL) : [];
      map.getSource(DSRC)?.setData({ type: 'FeatureCollection', features: d.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })).concat(d.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: d } }] : []) });
    });
  }

  // ---------- pointer: select, move, resize, rotate ----------
  const ftAt = (pl, lngLat) => SP.frame(pl.origin).toFt([lngLat.lng, lngLat.lat]);
  const ORDER = ['building', 'pond', 'drive', 'truck', 'parking', 'green'];
  function hit(pl, e) {
    for (const h of handles(pl)) { const p = map.project(h.at); if (Math.hypot(p.x - e.point.x, p.y - e.point.y) < 12) return { h: h.i }; }
    const ft = ftAt(pl, e.lngLat);
    for (const k of ORDER) { const el = pl.elements.slice().reverse().find(x => x.kind === k && SP.hitRect(x, ft)); if (el) return { el }; }
    return null;
  }
  let drag = null;
  function down(e) {
    const pl = ed && PL(); if (!pl || ed.mode || ctx.view !== 'map' || pl.ring.length < 3) return;
    const oe = e.originalEvent; if (oe?.button > 0 || oe?.touches?.length > 1) return;
    const h = hit(pl, e); if (!h) return;
    e.preventDefault(); // stops the map's own drag-to-pan for this press
    const el = h.el || pl.elements.find(x => x.id === ed.sel); if (!el) return;
    if (h.el && ed.sel !== el.id) { ed.sel = el.id; panel(); draw(); }
    drag = { type: h.h == null ? 'move' : h.h === 'r' ? 'rot' : 'size', k: h.h, id: el.id, from: ftAt(pl, e.lngLat), orig: { ...el }, snap: snapshot(), moved: false };
  }
  function move(e) {
    if (!drag) return; const pl = PL(), el = pl?.elements.find(x => x.id === drag.id); if (!el) return;
    const p = ftAt(pl, e.lngLat), o = drag.orig; drag.moved = true;
    if (drag.type === 'move') { el.x = +(o.x + p[0] - drag.from[0]).toFixed(2); el.y = +(o.y + p[1] - drag.from[1]).toFixed(2); }
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
    ed.undo.push(d.snap); ed.redo = []; const pl = PL(); pl.updated = new Date().toISOString(); save(P()); panel();
  }
  map.on('mousedown', down); map.on('touchstart', down); map.on('mousemove', move); map.on('touchmove', move); map.on('mouseup', up); map.on('touchend', up);
  window.addEventListener('mouseup', up);
  map.on('mousemove', e => { // cursor feedback
    const pl = ed && PL(); if (!pl || drag || ctx.view !== 'map') return;
    const c = map.getCanvas(); if (ed.mode) { c.style.cursor = 'crosshair'; return; }
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
    if (!hit(pl, e) && ed.sel) { ed.sel = null; draw(); panel(); }
    return true;
  });
  map.on('dblclick', e => { if (ed?.mode === 'draw') { e.preventDefault(); finishDraw(); } });
  // move a plan to a new boundary (and origin), keeping every piece where it is on the ground
  function reorigin(x, b, src) {
    const G = SP.frame(x.origin), N = SP.frame(b.origin);
    x.elements.forEach(e => { const q = N.toFt(G.toLL([e.x, e.y])); e.x = +q[0].toFixed(2); e.y = +q[1].toFixed(2); });
    x.origin = b.origin; x.ring = b.ring; x.src = src; x.front = null; x.frontGuess = true;
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
    const pl = ed && PL(); if (!pl || ctx.view !== 'map' || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const used = () => { e.preventDefault(); e.stopPropagation(); };
    const k = e.key, el = pl.elements.find(x => x.id === ed.sel), mod = e.metaKey || e.ctrlKey;
    if (mod && k.toLowerCase() === 'z') { used(); undo(!e.shiftKey); return; }
    if (mod && k.toLowerCase() === 'y') { used(); undo(false); return; }
    if (k === 'Escape') { if (ed.mode) { ed.mode = null; ed.draft = []; draw(); panel(); } else if (ed.sel) { ed.sel = null; draw(); panel(); } return; }
    if (k === 'Enter' && ed.mode === 'draw') { finishDraw(); return; }
    if (!el) return;
    if (k === 'Delete' || k === 'Backspace') { used(); change(x => { x.elements = x.elements.filter(y => y.id !== el.id); }); ed.sel = null; draw(); panel(); return; }
    const step = e.shiftKey ? 10 : 1, a = frameAngle(pl) * Math.PI / 180, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
    if (mv) { used(); change(() => { el.x = +(el.x + step * (mv[0] * Math.cos(a) - mv[1] * Math.sin(a))).toFixed(2); el.y = +(el.y + step * (mv[0] * Math.sin(a) + mv[1] * Math.cos(a))).toFixed(2); }, true); return; }
    if ((k === 'r' || k === 'R') && !mod) { used(); change(() => { el.rot = ((el.rot || 0) + 90) % 360; }); }
  }, true);

  // ---------- the panel ----------
  function panel() {
    const p = P(), pl = PL(); if (!p || !pl) return;
    const sel = pl.elements.find(e => e.id === ed.sel), prog = SP.normalizeProgram(pl.program), noRing = pl.ring.length < 3, drawing = noRing || ed.mode === 'draw';
    const parcel = p.parcels.find(x => x.key === pl.parcel);
    const scroll = card.querySelector('.sp-body')?.scrollTop || 0;
    card.innerHTML = '<div class="top"><div><div class="kicker">Site Plan · ' + esc(p.name) + '</div><h2><input id="spPlanName" class="sp-title" value="' + esc(pl.name) + '" aria-label="Plan name"></h2><div class="bsub">' + esc(parcel?.label || '') + (pl.ring.length >= 3 ? ' · ' + (SP.ringArea(pl.ring) / 43560).toFixed(2) + ' acres' : '') + '</div></div>' + xBtn() + '</div>' +
      '<div class="sp-body">' +
      '<div class="sp-plans">' + p.plans.map(x => '<button class="chip" aria-pressed="' + (x.id === pl.id) + '" data-plan="' + esc(x.id) + '">' + esc(x.name) + '</button>').join('') + '<button class="chip" id="spCopy" title="Start another option from this one">+ Copy</button></div>' +
      (drawing ? '<div class="bsec sp-draw"><div class="lt">Draw the site</div><p>Click each corner of the site on the map. Click the first corner again (or double-click, or press Enter) to finish.' + (ed.draft.length ? ' ' + ed.draft.length + ' corner' + (ed.draft.length > 1 ? 's' : '') + ' so far.' : '') + '</p><div class="bacts" style="padding:0"><button class="btn askai" id="spFinish"' + (ed.draft.length < 3 ? ' disabled' : '') + '>Finish</button><button class="btn" id="spClearDraw">Start Over</button>' + (noRing ? '' : '<button class="btn" id="spCancelDraw">Keep the Old Site</button>') + '</div></div>' :
      '<div class="bsec sp-ai"><label class="lt" for="spAsk">Build with AI</label><textarea id="spAsk" rows="2" placeholder="What should go here? e.g. 25,000 sf retail strip with 4 per 1,000 parking">' + esc(ed.ask || '') + '</textarea>' +
        '<div class="sp-sugs">' + SUGGEST.map(s => '<button class="chip" data-sug="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>' +
        '<div class="bacts" style="padding:8px 0 0"><button class="btn askai" id="spGo">Build Options</button><span class="rnote" id="spAiNote">' + esc(ed.aiNote || '') + '</span></div>' +
        '<div id="spVariants">' + variantsHtml() + '</div></div>' +
      siteHtml(p, pl) +
      '<div class="bsec"><div class="lt">Draw</div><div class="sp-tools">' + ADD.map(k => '<button class="btn sp-add" data-add="' + k + '"><i style="background:' + COL[k] + '"></i>' + SP.KINDS[k].label + '</button>').join('') + '</div>' +
        '<div class="sp-tools"><button class="btn" aria-pressed="' + (ed.mode === 'front') + '" id="spFront" title="Then click the lot line along the street">' + (ed.mode === 'front' ? 'Click the street side…' : 'Street Side') + '</button><button class="btn" id="spRedraw">Redraw Site</button>' +
        '<button class="btn" id="spUndo"' + (ed.undo.length ? '' : ' disabled') + ' title="Undo (⌘Z / Ctrl+Z)">Undo</button><button class="btn" id="spRedo"' + (ed.redo.length ? '' : ' disabled') + '>Redo</button></div>' +
        (pl.frontGuess ? '<div class="rnote sp-warn">The street side (orange line) is a guess. Use <b>Street Side</b> to pick the lot line along the street; front setbacks and drives follow it.</div>' : '') + '</div>' +
      '<div class="bsec" id="spSel">' + selHtml(sel, prog) + '</div>' +
      '<div class="bsec" id="spNums"></div>' +
      '<details class="bsec sp-prog"' + (ed.progOpen ? ' open' : '') + '><summary class="lt">Program &amp; setbacks</summary><div class="sp-grid">' +
        '<label>Use<select id="spUse">' + Object.entries(SP.USES).map(([k, u]) => '<option value="' + k + '"' + (k === prog.use ? ' selected' : '') + '>' + u.label + '</option>').join('') + '</select></label>' +
        (prog.use === 'multifamily' ? num('perUnit', 'Parking per unit', prog.perUnit, 0.1) + num('unitSf', 'Avg unit (sf)', prog.unitSf, 10) : num('ratio', 'Parking per 1,000 sf', prog.ratio, 0.1)) +
        num('detentionPct', 'Detention (% of site)', prog.detentionPct ?? (SP.ringArea(pl.ring) >= 43560 ? 10 : 0), 1) +
        ['front', 'side', 'rear', 'paving'].map(k => num('sb-' + k, { front: 'Front setback (ft)', side: 'Side setback (ft)', rear: 'Rear setback (ft)', paving: 'Landscape buffer (ft)' }[k], (pl.setbacks || SP.SETBACKS)[k], 1)).join('') +
        '</div><div class="rnote">Typical suburban numbers to start with. Check the city’s or county’s rules (Houston has no zoning but has building lines and parking rules).</div></details>' +
      '<div class="bsec"><div class="lt">Export</div><div class="bacts" style="padding:0 0 8px"><button class="btn askai" id="spPdf" title="A conceptual site plan sheet: the plan to scale with title block, site data, program and parking, parcels, notes and legend">Site Plan PDF</button><select class="chip" id="spSheet" aria-label="Sheet size"><option value="tabloid">11 × 17</option><option value="archd">24 × 36</option></select></div><div class="bacts" style="padding:0"><button class="btn" id="spDxf" title="Opens in AutoCAD, CADCraft, LibreCAD and most CAD programs">CAD (DXF)</button><button class="btn" id="spGeo">Map File (GeoJSON)</button><button class="btn" id="spSum">Copy Summary</button></div>' +
        '<div class="bacts" style="padding:8px 0 0"><button class="btn" id="spProj">All Projects</button><button class="btn sp-del" id="spDelPlan">Delete This Plan</button></div></div>') +
      '</div>';
    card.classList.add('open');
    const $ = s => card.querySelector(s), on = (s, fn) => { const el = $(s); if (el) el.onclick = fn; };
    card.querySelector('.sp-body').scrollTop = scroll;
    on('.x', () => ctx.closeCard());
    $('#spPlanName').onchange = e => change(x => { x.name = e.target.value.trim() || x.name; }, true);
    card.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { if (b.dataset.plan === pl.id) return; open(p.id, b.dataset.plan); });
    on('#spCopy', () => { const c = { ...clone(pl), id: uid(), name: nextName(p), created: new Date().toISOString() }; p.plans.push(c); save(p); open(p.id, c.id); });
    on('#spFinish', finishDraw); on('#spClearDraw', () => { ed.draft = []; draw(); panel(); }); on('#spCancelDraw', () => { ed.mode = null; ed.draft = []; draw(); panel(); });
    if (drawing) { nums(); return; }
    $('#spAsk').oninput = e => { ed.ask = e.target.value; };
    $('#spAsk').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) build(); };
    card.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { ed.ask = b.dataset.sug; $('#spAsk').value = ed.ask; build(); });
    on('#spGo', build);
    card.querySelectorAll('[data-var]').forEach(b => b.onclick = () => useVariant(+b.dataset.var));
    card.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addEl(b.dataset.add));
    on('#spFront', () => { ed.mode = ed.mode === 'front' ? null : 'front'; panel(); });
    on('#spRedraw', () => { ed.mode = 'draw'; ed.draft = []; ed.sel = null; ctx.toast('Click each corner of the site; click the first one again to finish. Esc cancels.'); draw(); panel(); });
    on('#spParcels', () => { ed.mode = ed.mode === 'parcels' ? null : 'parcels'; ed.sel = null; draw(); panel(); });
    card.querySelectorAll('[data-rmp]').forEach(b => b.onclick = () => { const keys = (pl.parcels || []).filter(k => k !== b.dataset.rmp); if (keys.length) setParcels(keys); });
    on('#spUndo', () => undo(true)); on('#spRedo', () => undo(false));
    $('#spUse').onchange = e => change(x => { x.program = { ...x.program, use: e.target.value, ratio: null, perUnit: null, floors: null, depth: null, truck: null }; });
    card.querySelectorAll('.sp-grid input[data-k]').forEach(i => i.onchange = () => change(x => { const k = i.dataset.k, v = i.value === '' ? null : +i.value; if (k.startsWith('sb-')) x.setbacks = { ...(x.setbacks || SP.SETBACKS), [k.slice(3)]: v ?? SP.SETBACKS[k.slice(3)] }; else x.program = { ...x.program, [k]: v }; }));
    $('.sp-prog').ontoggle = e => { ed.progOpen = e.target.open; };
    wireSel(sel);
    on('#spPdf', () => exportPdf(p, pl, card.querySelector('#spSheet').value));
    on('#spDxf', () => ctx.saveFile(fileName(p, pl) + '.dxf', SP.toDXF(pl, p.name + ' - ' + pl.name), 'application/dxf'));
    on('#spGeo', () => ctx.saveFile(fileName(p, pl) + '.geojson', JSON.stringify(geojson(p, pl), null, 1), 'application/geo+json'));
    on('#spSum', async () => { const s = summary(p, pl); try { await navigator.clipboard.writeText(s); ctx.toast('Summary copied.'); } catch (e) { prompt('Copy the summary', s); } });
    on('#spProj', () => { ctx.closeCard(); ctx.setView('projects'); });
    on('#spDelPlan', () => { if (!confirm('Delete ' + pl.name + ' from ' + p.name + '?')) return; p.plans = p.plans.filter(x => x.id !== pl.id); save(p); ctx.closeCard(); ctx.setView('projects'); });
    nums();
  }
  function siteHtml(p, pl) {
    const keys = pl.parcels || (pl.parcel ? [pl.parcel] : []), recs = keys.map(k => p.parcels.find(x => x.key === k)).filter(Boolean), on = ed.mode === 'parcels';
    return '<div class="bsec"><div class="lt">Site · ' + recs.length + ' parcel' + (recs.length === 1 ? '' : 's') + ' · ' + (SP.ringArea(pl.ring) / 43560).toFixed(2) + ' ac</div>' +
      (recs.length > 1 ? '<div class="sp-parcels">' + recs.map(r => '<span class="chip">' + esc(r.label) + (r.acres ? ' · ' + r.acres.toFixed(2) + ' ac' : '') + '<button class="sp-x" data-rmp="' + esc(r.key) + '" aria-label="Remove ' + esc(r.label) + ' from the site">×</button></span>').join('') + '</div>' : '') +
      '<div class="sp-tools"><button class="btn" aria-pressed="' + on + '" id="spParcels" title="Click parcels on the map to add them to the site (up to ' + MAXP + ') or take them out">' + (on ? 'Done Adding Parcels' : 'Add or Remove Parcels') + '</button></div>' +
      (on ? '<div class="rnote">Click a parcel next to the site to add it, or one in the site to take it out. Small gaps between parcels are closed up; parcels across a road stay separate.</div>' : '') + '</div>';
  }
  const num = (k, label, v, step) => '<label>' + label + '<input type="number" inputmode="decimal" min="0" step="' + step + '" data-k="' + k + '" value="' + (v ?? '') + '"></label>';
  const fileName = (p, pl) => (p.name + ' ' + pl.name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'site-plan';

  function selHtml(e, prog) {
    if (!e) return '<div class="lt">Selected</div><div class="rnote">Click a piece of the plan to move it. Drag a white corner to resize it, the orange dot to turn it. Arrow keys nudge it, R turns it 90°, Delete removes it.</div>';
    return '<div class="lt">' + esc(SP.KINDS[e.kind]?.label || e.kind) + '</div><div class="sp-grid">' +
      '<label>Width (ft)<input type="number" min="8" step="1" data-e="w" value="' + Math.round(e.w) + '"></label><label>Depth (ft)<input type="number" min="8" step="1" data-e="d" value="' + Math.round(e.d) + '"></label>' +
      '<label>Turn (°)<input type="number" step="1" data-e="rot" value="' + Math.round(e.rot || 0) + '"></label>' +
      (e.kind === 'building' ? '<label>Floors<input type="number" min="1" max="40" step="1" data-e="floors" value="' + (e.floors || 1) + '"></label>' +
        '<label>Use<select data-use="1">' + Object.entries(SP.USES).map(([k, u]) => '<option value="' + k + '"' + (k === (e.use || prog.use) ? ' selected' : '') + '>' + u.label + '</option>').join('') + '</select></label>' +
        (SP.USES[e.use || prog.use]?.garage ? '<label>Homes<input type="number" min="1" max="40" step="1" data-e="units" value="' + (e.units || 1) + '"></label>' : '') : '') +
      '<label class="sp-wide">Name<input type="text" maxlength="40" data-name="1" value="' + esc(e.name || '') + '" placeholder="e.g. Building B, Pad A"></label>' +
      '</div><div class="rnote" id="spRead"></div><div class="bacts" style="padding:8px 0 0"><button class="btn" id="spRot">Turn 90°</button><button class="btn" id="spDup">Copy</button><button class="btn sp-del" id="spDel">Delete</button></div>';
  }
  function readout(e) {
    const el = card.querySelector('#spRead'); if (!el || !e) return;
    el.textContent = e.kind === 'building' ? f0(e.w * e.d) + ' sf footprint · ' + f0(e.w * e.d * (e.floors || 1)) + ' sf total' : e.kind === 'parking' ? SP.stalls(e).count + ' spaces (9 × 18 ft stalls, 24 ft aisles)' : e.kind === 'pond' ? (e.w * e.d / 43560).toFixed(2) + ' acres' : f0(e.w * e.d) + ' sf';
    for (const k of ['w', 'd']) { const i = card.querySelector('[data-e="' + k + '"]'); if (i && document.activeElement !== i) i.value = Math.round(e[k]); }
    const r = card.querySelector('[data-e="rot"]'); if (r && document.activeElement !== r) r.value = Math.round(e.rot || 0);
    if (!drag) nums();
  }
  function wireSel(e) {
    if (!e) return; readout(e);
    card.querySelectorAll('[data-e]').forEach(i => i.onchange = () => { const v = +i.value; if (!isFinite(v)) return; change(() => { const k = i.dataset.e; e[k] = k === 'floors' || k === 'units' ? Math.max(1, Math.round(v)) : k === 'rot' ? ((v % 360) + 360) % 360 : Math.max(8, v); }, true); readout(e); });
    card.querySelector('[data-use]')?.addEventListener('change', ev => change(() => { e.use = ev.target.value; }));
    card.querySelector('[data-name]')?.addEventListener('change', ev => change(() => { e.name = ev.target.value.trim().slice(0, 40); }, true));
    card.querySelector('#spRot').onclick = () => change(() => { e.rot = ((e.rot || 0) + 90) % 360; });
    card.querySelector('#spDup').onclick = () => { const c = { ...clone(e), id: uid() }, a = (e.rot || 0) * Math.PI / 180, off = e.w + 20; c.x = +(e.x + off * Math.cos(a)).toFixed(2); c.y = +(e.y + off * Math.sin(a)).toFixed(2); change(x => x.elements.push(c)); ed.sel = c.id; draw(); panel(); };
    card.querySelector('#spDel').onclick = () => { change(x => { x.elements = x.elements.filter(y => y.id !== e.id); }); ed.sel = null; draw(); panel(); };
  }
  function nums() {
    const el = card.querySelector('#spNums'), pl = PL(); if (!el || !pl) return;
    if (pl.ring.length < 3) { el.innerHTML = ''; return; }
    const m = SP.metrics(pl), issues = SP.check(pl), prog = SP.normalizeProgram(pl.program), z = pl.zoning;
    const row = (k, v) => '<dt>' + k + '</dt><dd>' + v + '</dd>';
    el.innerHTML = '<div class="lt">Numbers</div><dl class="sp-nums">' +
      row('Site', m.acres.toFixed(2) + ' ac · ' + f0(m.siteSf) + ' sf') +
      row('Building', m.gfa ? f0(m.gfa) + ' sf' + (m.buildings > 1 ? ' in ' + m.buildings + ' buildings' : '') + (m.units ? ' · about ' + f0(m.units) + ' units' : '') : '—') +
      row('Coverage', pct(m.coverage) + (z?.max_coverage_pct ? ' <span class="sc">(max ' + esc(z.max_coverage_pct) + '%)</span>' : '')) + row('FAR', m.far.toFixed(2) + (z?.max_far ? ' <span class="sc">(max ' + esc(z.max_far) + ')</span>' : '')) +
      row('Parking', f0(m.spaces) + ' spaces' + (m.garages ? ' (' + f0(m.garages) + ' in garages)' : '') + (m.gfa ? ' <span class="sc">' + f0(m.required) + ' needed at ' + (new Set(pl.elements.filter(e => e.kind === 'building').map(e => e.use || prog.use)).size > 1 ? 'each use’s ratio' : prog.use === 'multifamily' ? prog.perUnit + '/unit' : prog.ratio + '/1,000 sf') + '</span>' : '')) +
      row('Detention', m.pond ? (m.pond / 43560).toFixed(2) + ' ac (' + pct(m.pond / m.siteSf) + ')' : '—') +
      row('Paved + roofs', pct(m.impervious)) + row('Open space', pct(m.green)) +
      (m.heightFt ? row('Height', 'about ' + m.heightFt + ' ft') : '') + '</dl>' +
      (issues.length ? '<ul class="sp-issues">' + issues.map(i => '<li class="' + i.level + '">' + esc(i.text) + '</li>').join('') + '</ul>' : m.gfa ? '<div class="rnote sp-ok">Fits the setbacks' + (m.spaces >= m.required ? ' and parks' : '') + '.</div>' : '') +
      '<div class="rnote">A planning sketch from the parcel outline: not a survey, and no engineering (grading, utilities, fire lanes, code review).</div>';
  }

  function addEl(kind) {
    const pl = PL(); if (!pl || pl.ring.length < 3) return;
    const c = map.getCenter(), F = SP.frame(pl.origin); let at = F.toFt([c.lng, c.lat]);
    if (!SP.inRing(at, pl.ring)) at = SP.centroid(pl.ring);
    const prog = SP.normalizeProgram(pl.program), [w, d] = kind === 'building' ? [Math.round(Math.max(40, Math.min(240, 12000 / prog.depth))), Math.round(Math.min(prog.depth, 160))] : SIZE[kind];
    const e = { id: uid(), kind, x: +at[0].toFixed(2), y: +at[1].toFixed(2), w, d, rot: +(((frameAngle(pl) % 360) + 360) % 360).toFixed(2), ...(kind === 'building' ? { floors: prog.floors } : {}) };
    change(x => x.elements.push(e)); ed.sel = e.id; draw(); panel();
  }

  // ---------- Build with AI ----------
  function siteInfo(p, pl) {
    const a = frameAngle(pl), r = pl.ring.map(q => { const c = Math.cos(-a * Math.PI / 180), s = Math.sin(-a * Math.PI / 180); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c]; });
    const xs = r.map(q => q[0]), ys = r.map(q => q[1]), parcel = p.parcels.find(x => x.key === pl.parcel), f = pl.front ?? SP.longestEdge(pl.ring);
    return { acres: +(SP.ringArea(pl.ring) / 43560).toFixed(3), widthFt: Math.round(Math.max(...xs) - Math.min(...xs)), depthFt: Math.round(Math.max(...ys) - Math.min(...ys)), frontageFt: Math.round(SP.edgeLen(pl.ring, f)),
      address: parcel?.label || '', city: ctx.nearestPlace?.(pl.origin) || '', county: (ctx.DATA?.counties || []).find(c => SP.inRing(pl.origin, c.outline?.[0]?.[0] || []))?.name || '', zoning: pl.zoning };
  }
  async function build() {
    const p = P(), pl = PL(); if (!pl || pl.ring.length < 3) return;
    const ask = (ed.ask || '').trim(); if (!ask) { ctx.toast('Say what should go on the site, or pick a suggestion.'); card.querySelector('#spAsk')?.focus(); return; }
    const btn = card.querySelector('#spGo'); if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
    let prog = SP.guessProgram(ask), setbacks = pl.setbacks, note = '';
    try {
      const r = await fetch('api/siteplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: ask, site: siteInfo(p, pl), program: pl.program }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { prog = d.program; setbacks = { ...SP.SETBACKS, ...d.setbacks }; note = [d.summary, ...(d.assumptions || [])].filter(Boolean).join(' · '); }
      else note = (r.status === 503 ? 'AI isn’t set up on this site, so ' : 'The AI didn’t answer, so ') + 'this reads your words directly.';
    } catch (e) { note = 'Offline: this reads your words directly.'; }
    if (ed?.plid !== pl.id) return;
    if (btn) btn.textContent = 'Laying out…';
    await new Promise(r => setTimeout(r, 30));
    const variants = [];
    for (let v = 0; v < SP.VARIANTS.length; v++) {
      const plan = { ...pl, setbacks }, r = composeSite(plan, prog, v);
      variants.push({ ...r, setbacks, m: SP.metrics({ ...plan, program: r.program || prog, elements: r.elements }), name: SP.VARIANTS[v] });
      await new Promise(r => setTimeout(r, 0)); // keep the page responsive between options
    }
    if (ed?.plid !== pl.id) return;
    ed.variants = variants; ed.aiNote = note; ed.pick = null;
    const best = variants.findIndex(v => v.elements.length); if (best >= 0) useVariant(best); else panel();
  }
  function variantsHtml() {
    if (!ed?.variants) return '';
    return '<div class="sp-vars">' + ed.variants.map((v, i) => '<button class="sp-var" aria-pressed="' + (ed.pick === i) + '" data-var="' + i + '"' + (v.elements.length ? '' : ' disabled') + '><b>' + esc(v.name) + '</b><span>' +
      (v.elements.length ? f0(v.m.gfa) + ' sf · ' + f0(v.m.spaces) + '/' + f0(v.m.required) + ' spaces · ' + pct(v.m.coverage) + ' coverage' : 'Nothing fits') + '</span>' + (v.notes.length ? '<em>' + esc(v.notes.join(' ')) + '</em>' : '') + '</button>').join('') + '</div>';
  }
  function useVariant(i) {
    const v = ed.variants?.[i]; if (!v?.elements.length) return;
    change(x => { x.elements = clone(v.elements); x.program = { ...(v.program || x.program) }; x.setbacks = v.setbacks || x.setbacks; x.zones = clone(v.zones || []); });
    ed.pick = i; ed.sel = null; draw(); panel();
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
  function render() {
    if (!root) return;
    const list = db.projects.slice().sort((a, b) => t(b.updated) - t(a.updated));
    const share = shared === true ? 'Shared with the team.' : shared === false ? 'Saved on this device. Team sharing for projects isn’t set up on the site yet.' : 'Saved on this device.';
    root.innerHTML = '<div class="pj-wrap"><div class="pj-head"><div><h2>Projects</h2><div class="rnote">' + share + '</div></div><div class="bacts" style="padding:0"><button class="btn askai" id="pjNew">New Project</button></div></div>' +
      (list.length ? '' : '<div class="pj-empty"><b>No projects yet.</b><p>Click a parcel on the map, then <b>Start Site Plan</b> under Site Tools on its card. Or make a project here and draw the site.</p></div>') +
      list.map(p => '<article class="pj" data-p="' + esc(p.id) + '"><div class="pj-top"><input class="pj-name" value="' + esc(p.name) + '" aria-label="Project name"><select class="chip pj-status" aria-label="Status">' + STATUS.map(s => '<option' + (s === (p.status || 'Idea') ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
        (p.parcels.length ? '<div class="pj-parcels">' + p.parcels.map(x => '<button class="chip" data-parcel="' + esc(x.key) + '" title="Show on the map">' + esc(x.label) + (x.acres ? ' · ' + x.acres.toFixed(2) + ' ac' : '') + '</button>').join('') + '</div>' : '') +
        '<div class="pj-plans">' + (p.plans.length ? p.plans.map(pl => { const m = pl.ring.length >= 3 ? SP.metrics(pl) : null; return '<div class="pj-plan"><button class="pj-open" data-plan="' + esc(pl.id) + '"><b>' + esc(pl.name) + '</b><span>' +
          (m ? (m.gfa ? f0(m.gfa) + ' sf ' + SP.USES[SP.normalizeProgram(pl.program).use].label.toLowerCase() + ' · ' + f0(m.spaces) + ' spaces · ' + pct(m.coverage) + ' coverage' : 'Empty plan on ' + m.acres.toFixed(2) + ' ac') : 'Site not drawn yet') + '</span></button></div>'; }).join('') : '<div class="rnote">No site plans yet.</div>') + '</div>' +
        '<textarea class="pj-notes" rows="2" placeholder="Notes: asking price, broker, next steps…" aria-label="Notes">' + esc(p.notes || '') + '</textarea>' +
        '<div class="pj-foot"><span class="rnote">Updated ' + new Date(p.updated || p.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (p.by ? ' by ' + esc(p.by) : '') + '</span><span class="bacts" style="padding:0"><button class="btn" data-draw="1">Draw a Site</button><button class="btn sp-del" data-delp="1">Delete</button></span></div></article>').join('') + '</div>';
    root.querySelector('#pjNew').onclick = () => { const name = prompt('Project name'); if (!name?.trim()) return; db.projects.push({ id: uid(), name: name.trim(), status: 'Idea', notes: '', parcels: [], plans: [], created: new Date().toISOString(), by: get(NAME_KEY) }); save(db.projects[db.projects.length - 1]); ctx.toast('Project added. Pick a parcel on the map and use Start Site Plan, or Draw a Site.'); };
    root.querySelectorAll('.pj').forEach(a => {
      const p = db.projects.find(x => x.id === a.dataset.p); if (!p) return;
      a.querySelector('.pj-name').onchange = e => { p.name = e.target.value.trim() || p.name; save(p); };
      a.querySelector('.pj-status').onchange = e => { p.status = e.target.value; save(p); };
      a.querySelector('.pj-notes').onchange = e => { p.notes = e.target.value.slice(0, 8000); save(p); };
      a.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => open(p.id, b.dataset.plan));
      a.querySelectorAll('[data-parcel]').forEach(b => b.onclick = () => { const x = p.parcels.find(y => y.key === b.dataset.parcel); ctx.setView('map'); map.easeTo({ center: x.center, zoom: Math.max(map.getZoom(), 17) }); ctx.openBuildingAt(x.center); });
      a.querySelector('[data-draw]').onclick = () => { const c = map.getCenter(), pl = newPlan(p, { origin: [+c.lng.toFixed(6), +c.lat.toFixed(6)] }); p.plans.push(pl); save(p); open(p.id, pl.id, { draw: true }); ctx.toast('Click each corner of the site on the map.'); };
      a.querySelector('[data-delp]').onclick = () => { if (!confirm('Delete the project ' + p.name + ' and its ' + p.plans.length + ' plan' + (p.plans.length === 1 ? '' : 's') + '? This removes it for the team too.')) return; db.projects = db.projects.filter(x => x.id !== p.id); db.dirty = db.dirty.filter(i => i !== p.id); db.gone.push(p.id); save(); };
    });
  }
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
    ed.ask = request; panel(); await build();
    const m = SP.metrics(PL()), issues = SP.check(PL());
    return { built: true, project: P().name, plan: PL().name, options: (ed.variants || []).map(v => ({ name: v.name, building_sf: Math.round(v.m.gfa), spaces: v.m.spaces, required: v.m.required, coverage_pct: Math.round(v.m.coverage * 100), notes: v.notes })),
      shown: { building_sf: Math.round(m.gfa), units: m.units, spaces: m.spaces, required: m.required, coverage_pct: Math.round(m.coverage * 100), far: +m.far.toFixed(2), detention_acres: +(m.pond / 43560).toFixed(2) }, issues: issues.map(i => i.text), note: ed.aiNote || '' };
  }

  ctx.sitePlan = { start, open, close, get editing() { return !!ed; }, forAssistant, get projects() { return db.projects; } };
}
