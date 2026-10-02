// 3D buildings (OpenStreetMap footprints + heights from the MapTiler vector tiles) and the building click-in panel:
// parcel (TxGIO StratMap, via /api/building), businesses (OpenStreetMap), street-level photo (Mapillary, optional),
// TABS filings on the parcel, census tract snapshot, and an orbit camera. All sources are free.
import { floorsFromHeight } from './lib/height.mjs';

export function initBuildings(ctx) {
  const { map, esc, fmtM, fmtN, F } = ctx, card = document.getElementById('card');
  const toggle = document.getElementById('lyBldg');
  let on = true, cur = null, orbitRaf = 0, market = null, marketP = null, multi = [], addMode = false;
  try { on = localStorage.getItem('fs-3d') !== '0'; } catch (e) {}
  toggle.checked = on;

  const vectorSource = () => { const s = map.getStyle()?.sources || {}; return Object.keys(s).find(id => s[id].type === 'vector' && /maptiler|openmaptiles|planet/i.test(id + (s[id].url || ''))); };
  const colors = () => ctx.isDark() ? { fill: '#3a4245', sel: '#4caf70' } : { fill: '#d5dadb', sel: '#1f9249' };
  const H = ['coalesce', ['get', 'render_height'], ['get', 'height'], 6], B = ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0];

  function addLayers() {
    const src = vectorSource(); if (!src || map.getLayer('fs-bldg')) return;
    const c = colors(), before = map.getLayer('sel-fill') ? 'sel-fill' : undefined;
    map.addLayer({ id: 'fs-bldg', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 13, layout: { visibility: on ? 'visible' : 'none' },
      paint: { 'fill-extrusion-color': c.fill, 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, H], 'fill-extrusion-base': B, 'fill-extrusion-opacity': .85 } }, before);
    if (!map.getSource('fs-bsel')) map.addSource('fs-bsel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // selected building: drawn a hair wider and taller than the base building so the two never z-fight
    map.addLayer({ id: 'fs-bsel', type: 'fill-extrusion', source: 'fs-bsel', filter: ['==', ['get', 'k'], 'b'], paint: { 'fill-extrusion-color': c.sel, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true } }, before);
    if (!map.getSource('fs-bhov')) map.addSource('fs-bhov', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'fs-bhov', type: 'line', source: 'fs-bhov', minzoom: 13, paint: { 'line-color': c.sel, 'line-width': 2, 'line-opacity': .9 } }, before);
    map.addLayer({ id: 'fs-psel', type: 'line', source: 'fs-bsel', filter: ['==', ['get', 'k'], 'p'], paint: { 'line-color': c.sel, 'line-width': 2.4, 'line-dasharray': [2, 1.5] } }, before);
    if (cur) highlight();
  }
  ctx.onOverlays(addLayers);
  toggle.onchange = () => {
    on = toggle.checked; try { localStorage.setItem('fs-3d', on ? '1' : '0'); } catch (e) {}
    if (map.getLayer('fs-bldg')) map.setLayoutProperty('fs-bldg', 'visibility', on ? 'visible' : 'none');
    if (on && map.getZoom() >= 14 && map.getPitch() < 20) map.easeTo({ pitch: 50, duration: 600 });
  };
  if (!vectorSource() && map.isStyleLoaded()) toggle.closest('label').title = 'This basemap has no building data';

  function highlight() {
    const s = map.getSource('fs-bsel'); if (!s) return;
    const feats = [];
    for (const b of multi.length ? multi : cur ? [cur] : []) {
      if (b.footprint) feats.push({ type: 'Feature', properties: { k: 'b', h: (b.height || 6) + 0.6, b: b.base || 0 }, geometry: grow(b.footprint, 1.004) });
      if (b.parcel?.geometry) feats.push({ type: 'Feature', properties: { k: 'p' }, geometry: b.parcel.geometry });
    }
    s.setData({ type: 'FeatureCollection', features: feats });
  }
  function stopOrbit() { cancelAnimationFrame(orbitRaf); orbitRaf = 0; card.querySelector('#bOrbit')?.classList.remove('on'); }
  ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach(ev => map.on(ev, () => orbitRaf && stopOrbit()));
  function orbit() {
    if (orbitRaf) { stopOrbit(); return; }
    card.querySelector('#bOrbit')?.classList.add('on');
    map.easeTo({ center: cur.center, zoom: Math.max(map.getZoom(), 17), pitch: 62, duration: 1200 });
    const step = () => { map.setBearing((map.getBearing() + 0.12) % 360); orbitRaf = requestAnimationFrame(step); };
    setTimeout(() => { if (card.querySelector('#bOrbit.on')) orbitRaf = requestAnimationFrame(step); }, 1250);
  }
  ctx.onCardClose(() => { stopOrbit(); cur = null; multi = []; addMode = false; highlight(); });

  // Vector tiles merge neighbouring buildings into one MultiPolygon at lower zooms: keep only the part under the click.
  function partAt(g, pt) {
    if (!g || g.type !== 'MultiPolygon') return g;
    const hit = g.coordinates.find(rings => inGeom(pt, { type: 'Polygon', coordinates: rings }));
    return hit ? { type: 'Polygon', coordinates: hit } : null;
  }
  // scale a footprint about its centroid (a few cm) so the highlight sits just outside the base building's walls
  function grow(g, k) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let x = 0, y = 0, n = 0;
    polys.forEach(p => p[0].forEach(([a, b]) => { x += a; y += b; n++; })); x /= n; y /= n;
    const sc = r => r.map(([a, b]) => [x + (a - x) * k, y + (b - y) * k]), out = polys.map(p => p.map(sc));
    return g.type === 'Polygon' ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
  }
  // point-in-polygon on GeoJSON Polygon / MultiPolygon (planar; fine at parcel scale)
  function inGeom(pt, g) {
    if (!g) return false;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some(rings => rings.reduce((ins, ring, ri) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return ri === 0 ? c : ins && !c; }, false));
  }
  const loadMarket = () => marketP ||= fetch('data/market.json').then(r => r.ok ? r.json() : null).catch(() => null).then(m => market = m);

  // returns true when the click hit a building (so the map doesn't treat it as a click on empty ground)
  // Shift-click (or "Select multiple" on the card) adds buildings — or a bare parcel where there is no building — to a selection.
  ctx.mapClickHandlers.push(e => {
    const adding = addMode || e.originalEvent?.shiftKey, c = [e.lngLat.lng, e.lngLat.lat];
    const hit = on && map.getLayer('fs-bldg') ? map.queryRenderedFeatures(e.point, { layers: ['fs-bldg'] })[0] : null;
    if (!hit) { if (adding && map.getZoom() >= 15) { add({ footprint: null, height: null, base: 0, center: c }); return true; } return false; }
    const b = { footprint: partAt(hit.geometry, c), height: +hit.properties.render_height || +hit.properties.height || null, base: +hit.properties.render_min_height || 0, center: c };
    if (adding) add(b); else open(b);
    return true;
  });
  // open the building at a point (search results, the assistant). Needs the 3D layer rendered there (zoom 14+).
  ctx.buildingAt = c => {
    if (!map.getLayer('fs-bldg')) return null;
    const p = map.project(c), hit = map.queryRenderedFeatures([[p.x - 3, p.y - 3], [p.x + 3, p.y + 3]], { layers: ['fs-bldg'] }).find(h => inGeom(c, partAt(h.geometry, c))) ;
    if (!hit) return null;
    const b = { footprint: partAt(hit.geometry, c), height: +hit.properties.render_height || +hit.properties.height || null, base: +hit.properties.render_min_height || 0, center: c };
    open(b); return b;
  };
  // desktop: a building cursor and outline show which building a click will open
  const CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M3 3v7M3 3h7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M3 3v7M3 3h7" stroke="#006527" stroke-width="2" stroke-linecap="round"/><rect x="11" y="9" width="12" height="15" rx="1.5" fill="#006527" stroke="#fff" stroke-width="1.5"/><path d="M14 13h2M18 13h2M14 17h2M18 17h2M16 24v-3h2v3" stroke="#fff" stroke-width="1.4"/></svg>') + '") 3 3, pointer';
  let hovT = 0;
  map.on('mousemove', e => {
    if (matchMedia('(pointer: coarse)').matches || !on || !map.getLayer('fs-bldg') || ctx.mode() !== 'pan') return;
    cancelAnimationFrame(hovT); hovT = requestAnimationFrame(() => {
      const canvas = map.getCanvas(), src = map.getSource('fs-bhov');
      if (map.queryRenderedFeatures(e.point, { layers: ['filings'] }).length) { src?.setData({ type: 'FeatureCollection', features: [] }); return; }
      const hit = map.queryRenderedFeatures(e.point, { layers: ['fs-bldg'] })[0], g = hit && partAt(hit.geometry, [e.lngLat.lng, e.lngLat.lat]);
      canvas.style.cursor = g ? CURSOR : '';
      src?.setData({ type: 'FeatureCollection', features: g ? [{ type: 'Feature', properties: {}, geometry: g }] : [] });
    });
  });
  map.getCanvas().addEventListener('mouseleave', () => map.getSource('fs-bhov')?.setData({ type: 'FeatureCollection', features: [] }));

  ctx.currentBuilding = () => cur && { center: cur.center, height: cur.height, title: card.querySelector('#bTitle')?.textContent };
  ctx.openBuildingAt = (lngLat, footprint) => open({ footprint: footprint || null, height: null, base: 0, center: lngLat });

  // ---------- sizes, height, floors ----------
  // footprint area in sq ft (local flat projection; exact enough for a building)
  function sqft(g) {
    if (!g) return 0; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const ringA = r => { const k = Math.cos(r[0][1] * Math.PI / 180) * 111320, m = 110540; let s2 = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s2 += (r[j][0] * k) * (r[i][1] * m) - (r[i][0] * k) * (r[j][1] * m); return Math.abs(s2) / 2; };
    return Math.round(polys.reduce((t, p) => t + ringA(p[0]) - p.slice(1).reduce((h, r) => h + ringA(r), 0), 0) * 10.7639);
  }
  // best height and floor count, with where each number came from
  function stats(b) {
    const d = b.d || {}, lid = d.height, osm = d.osm, p = d.parcel || b.parcel, fp = sqft(b.footprint);
    const lidYear = lid?.date ? +lid.date.slice(0, 4) : null, built = +(p?.yearBuilt || 0);
    const lidOk = !!b.footprint && lid?.source === '3dep-lidar' && lid.height_m > 2 && !(built && lidYear && built > lidYear);
    let h = null, hSrc = '';
    if (lidOk) { h = lid.height_m; hSrc = 'USGS lidar ' + lidYear; }
    else if (osm?.height_m) { h = osm.height_m; hSrc = 'OpenStreetMap'; }
    else if (b.height && b.height !== 6) { h = b.height - (b.base || 0); hSrc = 'map data (estimate)'; }
    let fl = null, fSrc = '';
    if (osm?.levels) { fl = osm.levels; fSrc = 'OpenStreetMap'; }
    else if (p?.stories) { fl = p.stories; fSrc = 'appraisal record'; }
    else if (h && b.footprint) { fl = floorsFromHeight(h, (osm?.use || '') + ' ' + (p?.landUse || '')); fSrc = 'estimated from height'; }
    const note = lid?.source === '3dep-lidar' && built && lidYear && built > lidYear ? 'Built ' + built + ', after the ' + lidYear + ' lidar survey, so the lidar height is not used.'
      : lid?.source === '3dep-lidar' && !(lid.height_m > 2) && b.footprint ? 'The ' + lidYear + ' lidar shows no structure here: likely built or rebuilt since.' : '';
    return { fp, h, hSrc, fl, fSrc, gfa: fp && fl ? fp * fl : null, apprSqft: p?.buildingSqft || null, note, lidMax: lidOk && lid.max_m > lid.height_m + 6 ? lid.max_m : null };
  }
  const ft = m => Math.round(m * 3.281).toLocaleString('en-US') + ' ft';
  function sizeRows(b) {
    const s = stats(b), r = [];
    if (s.fp) r.push(['Footprint', fmtN(s.fp) + ' sq ft']);
    if (s.apprSqft) r.push(['Building area', fmtN(s.apprSqft) + ' sq ft <span class="sc">(appraisal record)</span>']);
    if (s.gfa) r.push(['Est. floor area', '~' + fmtN(s.gfa) + ' sq ft <span class="sc">(footprint × ' + s.fl + ' floor' + (s.fl > 1 ? 's' : '') + ')</span>']);
    if (s.h) r.push(['Height', ft(s.h) + (s.lidMax ? ' · ' + ft(s.lidMax) + ' to the top' : '') + ' <span class="sc">(' + esc(s.hSrc) + ')</span>']);
    if (s.fl) r.push(['Floors', (s.fSrc === 'estimated from height' ? '~' : '') + s.fl + ' <span class="sc">(' + esc(s.fSrc) + ')</span>']);
    return '<dl class="bsize">' + r.map(([k, v]) => '<dt>' + k + '</dt><dd class="mono">' + v + '</dd>').join('') + '</dl>' + (s.note ? '<div class="rnote">' + esc(s.note) + '</div>' : '');
  }
  // parcel, businesses, photo, lidar height and OpenStreetMap tags for one building (cached on the object)
  async function details(b) {
    if (b.d) return b.d;
    const q = new URLSearchParams({ lat: b.center[1].toFixed(6), lon: b.center[0].toFixed(6) });
    const ring = b.footprint && (b.footprint.type === 'Polygon' ? b.footprint.coordinates[0] : null);
    if (ring) { const step = Math.max(1, Math.ceil(ring.length / 100)); q.set('fp', ring.filter((p, i) => i % step === 0).map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join(';')); }
    const r = await fetch('api/building?' + q); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
    b.d = d; b.parcel = d.parcel; return d;
  }

  async function open(b) {
    ctx.clearSelection?.(); stopOrbit(); cur = b; multi = []; addMode = false; highlight();
    const gsv = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + b.center[1].toFixed(6) + ',' + b.center[0].toFixed(6);
    card.innerHTML = '<div class="top"><div><div class="kicker">' + (b.footprint ? 'Building' : 'Parcel') + '</div><h2 id="bTitle">Loading parcel…</h2><div class="bsub" id="bSub">' + b.center[1].toFixed(5) + ', ' + b.center[0].toFixed(5) + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' +
      '<div class="bacts"><button class="btn" id="bMulti" title="Then click more buildings or parcels (or Shift-click)">Select multiple</button><button class="btn" id="bOrbit">Orbit view</button><a class="btn" href="' + gsv + '" target="_blank" rel="noopener">Street View ↗</a><button class="btn" id="bNote">Add site note</button></div>' +
      '<div id="bPhoto"></div><div id="bSize">' + sizeRows(b) + '<div class="rnote">Measuring height from lidar…</div></div>' +
      '<div class="bsec" id="bParcel"><div class="lt">Parcel</div><div class="rnote">Looking up the appraisal record…</div></div>' +
      '<div class="bsec" id="bFilings"></div><div class="bsec" id="bPlaces"><div class="lt">Businesses here</div><div class="rnote">Looking up…</div></div><div class="bsec" id="bArea"></div>' +
      '<div class="rnote bsrc">Footprint: OpenStreetMap. Height: USGS 3DEP lidar (Microsoft Planetary Computer) where it is newer than the building, otherwise OpenStreetMap. Floors: OpenStreetMap or the appraisal record when mapped, otherwise estimated from height. Parcel: Texas GIO StratMap. Values are appraisal values, not sale prices.</div>';
    card.classList.add('open');
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#bOrbit').onclick = orbit;
    card.querySelector('#bMulti').onclick = () => startMulti();
    card.querySelector('#bNote').onclick = () => ctx.addNote?.({ at: b.center });
    if (ctx.reduceMotion) card.querySelector('#bOrbit').remove();
    renderFilings(null); renderArea();
    ctx.cardRendered({ kind: 'building', center: b.center, label: () => card.querySelector('#bTitle')?.textContent || 'Building', sub: () => card.querySelector('#bSub')?.textContent || '' });
    let d = null;
    try { d = await details(b); }
    catch (err) { if (cur !== b) return; card.querySelector('#bParcel').innerHTML = '<div class="lt">Parcel</div><div class="rnote">Parcel lookup unavailable (' + esc(err.message) + ').</div>'; card.querySelector('#bTitle').textContent = 'Building'; card.querySelector('#bPlaces').innerHTML = ''; card.querySelector('#bSize').innerHTML = sizeRows(b); return; }
    if (cur !== b || multi.length) return;
    highlight();
    card.querySelector('#bSize').innerHTML = sizeRows(b);
    renderParcel(d.parcel, d.parcelError); renderFilings(d.parcel?.geometry || null); renderPlaces(d.places || [], d.placesError); renderPhoto(d.photo);
  }
  ctx.buildingStats = () => { const list = multi.length ? multi : cur ? [cur] : []; return list.map(b => ({ address: b.parcel?.situs || null, ...stats(b), owner: b.parcel?.owner || null })); };

  // ---------- several buildings / parcels ----------
  function startMulti() {
    addMode = true; if (cur && !multi.length) multi = [cur];
    ctx.toast((matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click') + ' more buildings or parcels to add them. Tap one again to remove it.');
    renderMulti();
  }
  const same = (a, b) => a.footprint && b.footprint ? a.footprint === b.footprint || inGeom(a.center, b.footprint) || inGeom(b.center, a.footprint) : Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) < 0.00005 || (a.parcel?.propId && a.parcel?.propId === b.parcel?.propId);
  function add(b) {
    if (!cur && !multi.length) { open(b); return; }
    if (!multi.length) multi = [cur];
    const i = multi.findIndex(x => same(x, b));
    if (i >= 0) multi.splice(i, 1); else { if (multi.length >= 50) { ctx.toast('Up to 50 at a time.'); return; } multi.push(b); }
    if (!multi.length) { ctx.closeCard(); return; }
    highlight(); renderMulti();
    multi.forEach(x => { if (!x.d && !x.loading) { x.loading = details(x).catch(e => { x.err = e.message; }).finally(() => { x.loading = null; highlight(); renderMulti(); }); } });
  }
  function renderMulti() {
    if (!multi.length) return; cur = multi[multi.length - 1]; stopOrbit();
    const rows = multi.map(b => ({ b, s: stats(b) })), uniqP = new Map();
    multi.forEach(b => { if (b.parcel?.propId) uniqP.set(b.parcel.propId, b.parcel); });
    const tot = k => rows.reduce((t, r) => t + (r.s[k] || 0), 0), mv = [...uniqP.values()].reduce((t, p) => t + (p.marketValue || 0), 0);
    const acres = [...uniqP.values()].reduce((t, p) => t + (/acre/i.test(p.area || '') ? parseFloat(p.area) : 0), 0);
    const geoms = multi.map(b => b.parcel?.geometry || b.footprint).filter(Boolean);
    const fl = F.filter(f => geoms.some(g => inGeom([f.lon, f.lat], g))), loading = multi.some(b => b.loading);
    card.innerHTML = '<div class="top"><div><div class="kicker">Selection</div><h2>' + multi.length + ' building' + (multi.length > 1 ? 's' : '') + ' &amp; parcels</h2><div class="bsub">' + (addMode ? ((matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click') + ' more to add, again to remove') : 'Shift-click to add more') + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' +
      '<div class="kgrid msum"><div><b>' + (tot('fp') ? fmtN(tot('fp')) : '—') + '</b><span>Footprint sq ft</span></div><div><b>' + (tot('gfa') ? '~' + fmtN(tot('gfa')) : '—') + '</b><span>Est. floor area sq ft</span></div>' +
      '<div><b>' + (mv ? fmtM(mv) : '—') + '</b><span>Market value · ' + uniqP.size + ' parcel' + (uniqP.size === 1 ? '' : 's') + '</span></div><div><b>' + (acres ? acres.toFixed(2) : '—') + '</b><span>Land acres</span></div></div>' +
      (loading ? '<div class="rnote">Loading parcels and heights…</div>' : '') +
      '<div class="bsec"><div class="lt">Selected</div>' + rows.map(({ b, s }, i) => '<div class="mrow"><button class="lnk" data-go="' + i + '"><b>' + esc(b.parcel?.situs || (b.footprint ? 'Building ' : 'Parcel ') + (i + 1)) + '</b><span>' +
        [s.fp ? fmtN(s.fp) + ' sq ft footprint' : (b.footprint ? '' : 'parcel only'), s.fl ? (s.fSrc === 'estimated from height' ? '~' : '') + s.fl + ' fl' : '', s.h ? ft(s.h) : '', b.parcel?.owner || ''].filter(Boolean).map(esc).join(' · ') + (b.err ? ' · lookup failed' : '') + '</span></button><button class="x" data-rm="' + i + '" aria-label="Remove">×</button></div>').join('') + '</div>' +
      (fl.length ? '<div class="bsec"><div class="lt">Construction filings on these parcels</div><div class="rnote">' + fl.length + ' filing' + (fl.length > 1 ? 's' : '') + ' · est. ' + fmtM(fl.reduce((t, f) => t + f.cost, 0)) + '</div></div>' : '') +
      '<div class="bacts"><button class="btn primary" id="mDone">' + (addMode ? 'Done adding' : 'Add more') + '</button><button class="btn" id="mCsv">Export CSV</button><button class="btn" id="mFit">Zoom to all</button><button class="btn" id="mClear">Clear</button></div>';
    card.classList.add('open');
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#mClear').onclick = () => ctx.closeCard();
    card.querySelector('#mDone').onclick = () => { addMode = !addMode; renderMulti(); };
    card.querySelector('#mFit').onclick = () => { const pts = multi.map(b => b.center); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); map.fitBounds([[Math.min(...xs) - .0008, Math.min(...ys) - .0008], [Math.max(...xs) + .0008, Math.max(...ys) + .0008]], { padding: 60, maxZoom: 18, duration: ctx.reduceMotion ? 0 : 800 }); };
    card.querySelector('#mCsv').onclick = () => ctx.exportCsv(rows.map(({ b, s }, i) => ({ '#': i + 1, Address: b.parcel?.situs || '', Owner: b.parcel?.owner || '', 'Property ID': b.parcel?.propId || '', 'Footprint sq ft': s.fp || '', 'Building area sq ft (appraisal)': s.apprSqft || '',
      'Est. floor area sq ft': s.gfa || '', 'Height ft': s.h ? Math.round(s.h * 3.281) : '', 'Height source': s.hSrc, Floors: s.fl || '', 'Floors source': s.fSrc, 'Market value': b.parcel?.marketValue || '', 'Year built': b.parcel?.yearBuilt || '', 'Land area': b.parcel?.area || '', Latitude: b.center[1].toFixed(6), Longitude: b.center[0].toFixed(6) })), 'fs-buildings-' + new Date().toISOString().slice(0, 10));
    card.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => add(multi[+x.dataset.rm]));
    card.querySelectorAll('[data-go]').forEach(x => x.onclick = () => { const b = multi[+x.dataset.go]; map.flyTo({ center: b.center, zoom: Math.max(map.getZoom(), 17.5), duration: ctx.reduceMotion ? 0 : 700 }); });
  }

  const money = v => v ? fmtM(v) : '—';
  function renderParcel(p, err) {
    const el = card.querySelector('#bParcel');
    if (!p) { el.innerHTML = '<div class="lt">Parcel</div><div class="rnote">' + (err ? 'Parcel lookup failed: ' + esc(err) : 'No parcel record found at this point.') + '</div>'; card.querySelector('#bTitle').textContent = 'Building'; return; }
    card.querySelector('#bTitle').textContent = p.situs || p.owner || 'Building';
    card.querySelector('#bSub').textContent = [p.county ? p.county + ' County' : '', p.landUse].filter(Boolean).join(' · ');
    const rows = [['Owner', esc(p.owner || '—') + (p.mailing ? '<div class="sc">' + esc(p.mailing) + '</div>' : '')], ['Market value', money(p.marketValue) + (p.taxYear ? ' <span class="sc">(' + esc(p.taxYear) + ')</span>' : '')],
      ['Land / improvements', money(p.landValue) + ' / ' + money(p.improvementValue)], ['Year built', esc(p.yearBuilt || '—')], ['Acquired', esc(p.acquired || '—')], ['Land area', esc(p.area || '—')], ['Property ID', esc(p.propId || '—')]];
    el.innerHTML = '<div class="lt">Parcel</div><dl>' + rows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>' +
      (p.raw ? '<details class="raw"><summary>All appraisal fields</summary><dl>' + Object.entries(p.raw).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl></details>' : '');
  }
  function renderFilings(parcelGeom) {
    const b = cur, el = card.querySelector('#bFilings'); if (!el) return;
    const near = F.filter(f => parcelGeom ? inGeom([f.lon, f.lat], parcelGeom) : (b.footprint && inGeom([f.lon, f.lat], b.footprint)) || Math.hypot((f.lon - b.center[0]) * 0.87, f.lat - b.center[1]) < 0.0004);
    el.innerHTML = '<div class="lt">Construction filings here (TDLR TABS)</div>' + (near.length ? near.sort((x, y) => y.cost - x.cost).slice(0, 25).map(f => '<button class="chitem" data-id="' + esc(f.id) + '"><span><b>' + esc(f.name) + '</b><em>' + esc(f.reg) + ' · ' + esc(ctx.TYPE_LABEL[f.type] || f.type) + (f.use ? ' · ' + esc(f.use) : '') + '</em></span><span class="m">' + fmtM(f.cost) + '</span></button>').join('') : '<div class="rnote">None in the last two years.</div>');
    el.querySelectorAll('.chitem').forEach(x => x.onclick = () => ctx.select(ctx.BY_ID.get(x.dataset.id), false));
  }
  function renderPlaces(list, err) {
    const el = card.querySelector('#bPlaces'), b = cur;
    if (err && !list.length) { el.innerHTML = '<div class="lt">Businesses here</div><div class="rnote">Lookup failed: ' + esc(err) + '</div>'; return; }
    const shape = b.footprint || b.parcel?.geometry;
    const inside = list.filter(p => shape && inGeom([p.lon, p.lat], shape)), other = list.filter(p => !inside.includes(p)).slice(0, 8);
    const li = p => '<div class="pl"><b>' + esc(p.name) + '</b><span>' + esc(p.kind) + (p.brand && p.brand !== p.name ? ' · ' + esc(p.brand) : '') + '</span></div>';
    el.innerHTML = '<div class="lt">Businesses here (OpenStreetMap)</div>' + (inside.length ? inside.map(li).join('') : '<div class="rnote">None mapped inside this building.</div>') +
      (other.length ? '<details class="raw"><summary>Nearby (' + other.length + ')</summary>' + other.map(li).join('') + '</details>' : '');
  }
  function renderPhoto(ph) {
    const el = card.querySelector('#bPhoto'); if (!el || !ph) return;
    el.innerHTML = '<a class="bphoto" href="' + esc(ph.link) + '" target="_blank" rel="noopener"><img alt="Street-level photo near this building" loading="lazy" src="' + esc(ph.thumb) + '"><span>Mapillary · ' + esc(ph.captured || '') + '</span></a>';
  }
  async function renderArea() {
    const b = cur; await loadMarket(); if (cur !== b) return;
    const el = card.querySelector('#bArea'); if (!el || !market?.tracts) return;
    const t = market.tracts.find(t => inGeom(b.center, t.geom)); if (!t) return;
    const g = t.gr == null ? '—' : (t.gr > 0 ? '+' : '') + t.gr + '%';
    el.innerHTML = '<div class="lt">Census tract (ACS ' + market.year + ')</div><div class="kgrid"><div><b>' + (t.pop != null ? fmtN(t.pop) : '—') + '</b><span>Population</span></div><div><b>' + g + '</b><span>Growth since ' + (market.baseYear || '') + '</span></div>' +
      '<div><b>' + (t.inc ? fmtM(t.inc) : '—') + '</b><span>Median income</span></div><div><b>' + (t.val ? fmtM(t.val) : '—') + '</b><span>Median home value</span></div></div>';
  }
}
