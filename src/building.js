// 3D buildings (OpenStreetMap footprints + heights from the MapTiler vector tiles) and the building click-in panel:
// parcel (TxGIO StratMap, via /api/building), businesses (OpenStreetMap), street-level photo (Mapillary, optional),
// TABS filings on the parcel, census tract snapshot, and an orbit camera. All sources are free.
import { floorsFromHeight, plausibleHeight } from './lib/height.mjs';
import { joinPieces, partAt, inGeom, offsetGeom } from './lib/footprint.mjs';

export function initBuildings(ctx) {
  const { map, esc, fmtM, fmtN, F } = ctx, card = document.getElementById('card');
  const toggle = document.getElementById('lyBldg');
  let on = true, cur = null, orbitRaf = 0, market = null, marketP = null;
  // the buildings and parcels selected together are the card's building tabs (src/cardtabs.js); cur is the one shown
  const selected = () => { const l = (ctx.tabs?.list('building') || []).map(t => t.ref).filter(Boolean); return l.length ? l : cur ? [cur] : []; };
  const bid = b => 'b:' + b.center[0].toFixed(5) + ',' + b.center[1].toFixed(5);
  try { on = localStorage.getItem('fs-3d') !== '0'; } catch (e) {}
  toggle.checked = on;

  const vectorSource = () => { const s = map.getStyle()?.sources || {}; return Object.keys(s).find(id => s[id].type === 'vector' && /maptiler|openmaptiles|planet/i.test(id + (s[id].url || ''))); };
  const colors = () => ctx.isDark() ? { fill: '#3a4245', sel: '#4caf70', sel2: '#2d6b45' } : { fill: '#d5dadb', sel: '#1f9249', sel2: '#9fd4b2' };
  const H = ['coalesce', ['get', 'render_height'], ['get', 'height'], 6], B = ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0];

  function addLayers() {
    const src = vectorSource(); if (!src || map.getLayer('fs-bldg')) return;
    const c = colors(), before = map.getLayer('sel-fill') ? 'sel-fill' : undefined;
    // the basemap's own 3D buildings (OpenFreeMap's building-3d, some MapTiler styles) would sit in the same place as ours
    // and flicker against them and the selection: ours replace them
    for (const l of map.getStyle()?.layers || []) if (l.type === 'fill-extrusion' && !l.id.startsWith('fs-')) try { map.setLayoutProperty(l.id, 'visibility', 'none'); } catch (e) {}
    map.addLayer({ id: 'fs-bldg', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 13, layout: { visibility: on ? 'visible' : 'none' },
      paint: { 'fill-extrusion-color': c.fill, 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, H], 'fill-extrusion-base': B, 'fill-extrusion-opacity': .85 } }, before);
    if (!map.getSource('fs-bsel')) map.addSource('fs-bsel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // selected buildings: drawn half a metre outside every wall and a little taller than the base building so the two never
    // z-fight (flicker) while zooming or orbiting. The one shown is bright green and rises out of the ground when picked;
    // the others in the selection are a lighter green, numbered like their tabs. A soft glow pulses around its base.
    map.addLayer({ id: 'fs-bglow', type: 'line', source: 'fs-bsel', filter: ['==', ['get', 'k'], 'g'], paint: { 'line-color': c.sel, 'line-width': 8, 'line-blur': 6, 'line-opacity': .35 } }, before);
    map.addLayer({ id: 'fs-bsel', type: 'fill-extrusion', source: 'fs-bsel', filter: ['==', ['get', 'k'], 'b'], paint: { 'fill-extrusion-color': ['case', ['==', ['get', 'a'], 1], c.sel, c.sel2], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1 } }, before);
    if (!map.getSource('fs-bhov')) map.addSource('fs-bhov', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'fs-bhov', type: 'line', source: 'fs-bhov', minzoom: 13, paint: { 'line-color': c.sel, 'line-width': 2, 'line-opacity': .9 } }, before);
    map.addLayer({ id: 'fs-psel', type: 'line', source: 'fs-bsel', filter: ['==', ['get', 'k'], 'p'], paint: { 'line-color': c.sel, 'line-width': 2.4, 'line-dasharray': [2, 1.5] } }, before);
    map.addLayer({ id: 'fs-bnumc', type: 'circle', source: 'fs-bsel', filter: ['==', ['get', 'k'], 'n'], paint: { 'circle-radius': 11, 'circle-color': ['case', ['==', ['get', 'a'], 1], c.sel, '#ffffff'], 'circle-stroke-color': c.sel, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' } });
    map.addLayer({ id: 'fs-bnum', type: 'symbol', source: 'fs-bsel', filter: ['==', ['get', 'k'], 'n'], layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': ['case', ['==', ['get', 'a'], 1], '#ffffff', c.sel] } });
    if (cur) highlight();
  }
  ctx.onOverlays(addLayers);
  toggle.onchange = () => {
    on = toggle.checked; try { localStorage.setItem('fs-3d', on ? '1' : '0'); } catch (e) {}
    if (map.getLayer('fs-bldg')) map.setLayoutProperty('fs-bldg', 'visibility', on ? 'visible' : 'none');
    if (on && map.getZoom() >= 14 && map.getPitch() < 20) map.easeTo({ pitch: 50, duration: 600 });
  };
  if (!vectorSource() && map.isStyleLoaded()) toggle.closest('label').title = 'This basemap has no building data';

  let lastActive = null;
  function highlight() {
    const s = map.getSource('fs-bsel'); if (!s) return;
    const feats = [], list = selected(), many = list.length > 1, all = ctx.tabs?.active()?.id === 'b:all';
    list.forEach((b, i) => {
      const a = b === cur || all ? 1 : 0;
      if (b.footprint) { feats.push({ type: 'Feature', properties: { k: 'b', a, h: (b.height || 6) + 0.6, b: b.base || 0 }, geometry: offsetGeom(b.footprint, 0.5) });
        if (b === cur) feats.push({ type: 'Feature', properties: { k: 'g' }, geometry: b.footprint }); }
      if (a) for (const p of b.d?.parcels?.length ? b.d.parcels : b.parcel ? [b.parcel] : []) if (p.geometry) feats.push({ type: 'Feature', properties: { k: 'p' }, geometry: p.geometry });
      if (many) feats.push({ type: 'Feature', properties: { k: 'n', n: i + 1, a }, geometry: { type: 'Point', coordinates: b.footprint ? centroid(b.footprint) : b.center } });
    });
    s.setData({ type: 'FeatureCollection', features: feats });
    if (cur && cur !== lastActive) { lastActive = cur; reveal(); } else if (!cur) lastActive = null;
  }
  // the shown building rises out of the ground and its glow pulses twice (skipped with reduced motion)
  let revealRaf = 0;
  function reveal() {
    cancelAnimationFrame(revealRaf); if (!map.getLayer('fs-bsel')) return;
    const H0 = ['get', 'h'], set = (k, g) => { try { map.setPaintProperty('fs-bsel', 'fill-extrusion-height', k >= 1 ? H0 : ['case', ['==', ['get', 'a'], 1], ['*', H0, k], H0]); map.setPaintProperty('fs-bglow', 'line-width', 8 + g * 14); map.setPaintProperty('fs-bglow', 'line-opacity', .35 + g * .45); } catch (e) {} };
    if (ctx.reduceMotion) { set(1, 0); return; }
    const t0 = performance.now(), RISE = 650, GLOW = 1800;
    const step = t => { const r = Math.min(1, (t - t0) / RISE), e = 1 - Math.pow(1 - r, 3), gp = Math.min(1, (t - t0) / GLOW), g = gp < 1 ? Math.max(0, Math.sin(gp * Math.PI * 2 - Math.PI / 2) * .5 + .5) * (1 - gp) : 0;
      set(e, g); if (gp < 1) revealRaf = requestAnimationFrame(step); };
    revealRaf = requestAnimationFrame(step);
  }
  function centroid(g) { const ring = (g.type === 'Polygon' ? g.coordinates : g.coordinates.reduce((a, p) => p[0].length > a[0].length ? p : a))[0]; let x = 0, y = 0; for (const p of ring) { x += p[0]; y += p[1]; } return [x / ring.length, y / ring.length]; }
  function stopOrbit() { cancelAnimationFrame(orbitRaf); orbitRaf = 0; card.querySelector('#bOrbit')?.classList.remove('on'); }
  ['mousedown', 'touchstart', 'wheel', 'dragstart'].forEach(ev => map.on(ev, () => orbitRaf && stopOrbit()));
  ctx.onOrbitStop?.(stopOrbit);
  function orbit() {
    if (orbitRaf || card.querySelector('#bOrbit.on')) { stopOrbit(); return; }
    card.querySelector('#bOrbit')?.classList.add('on');
    map.easeTo({ center: cur.center, zoom: Math.max(map.getZoom(), 17), pitch: 62, duration: 1200 });
    // each step is a jumpTo, which would cancel any other camera move: give way the moment something else eases the map
    const step = () => { if (map.isEasing()) { stopOrbit(); return; } map.setBearing((map.getBearing() + 0.12) % 360); orbitRaf = requestAnimationFrame(step); };
    map.once('moveend', () => { if (card.querySelector('#bOrbit.on') && !map.isEasing()) orbitRaf = requestAnimationFrame(step); });
  }
  ctx.onCardClose(() => { stopOrbit(); cur = null; highlight(); });
  ctx.tabs?.onChange(() => { const a = ctx.tabs.active(); if (a && a.kind !== 'building') { if (cur) { cur = null; } } highlight(); syncAll(); });

  // The building under the click from the map's tiles (lib/footprint.mjs): the polygon under the click, plus its
  // continuation in neighbouring tiles when a tile edge cuts it. A tile feature id is NOT one building (a feature can
  // hold many separate neighbours), so pieces are only joined when they meet along a tile edge.
  // (The OpenStreetMap outline from /api/building replaces this once it arrives.)
  function wholeFootprint(hit, pt) {
    const piece = partAt(hit.geometry, pt); if (hit.id == null || !hit.source) return piece;
    let pieces = []; try { pieces = map.querySourceFeatures(hit.source, { sourceLayer: hit.sourceLayer, filter: ['==', ['id'], hit.id] }); } catch (e) { return piece; }
    return joinPieces(pieces.map(p => ({ z: p._z, x: p._x, y: p._y, geometry: p.geometry })), pt) || piece;
  }
  const loadMarket = () => marketP ||= fetch('data/market.json').then(r => r.ok ? r.json() : null).catch(() => null).then(m => market = m);

  // returns true when the click hit a building (so the map doesn't treat it as a click on empty ground)
  // Shift-click (or "Select multiple" on the card) adds buildings — or a bare parcel where there is no building — to a selection.
  ctx.mapClickHandlers.push(e => {
    const adding = !!ctx.tabs?.adding(e) && (ctx.tabs?.count() || 0) > 0, c = [e.lngLat.lng, e.lngLat.lat];
    const hit = on && map.getLayer('fs-bldg') ? map.queryRenderedFeatures(e.point, { layers: ['fs-bldg'] })[0] : null;
    if (!hit) {
      if (adding && map.getZoom() >= 15) { add({ footprint: null, height: null, base: 0, center: c }); return true; }
      // property-first: a click on open ground at street zoom opens that parcel (a click with a card open just closes it)
      if (!adding && map.getZoom() >= 16 && !card.classList.contains('open')) { open({ footprint: null, height: null, base: 0, center: c }); return true; }
      return false;
    }
    const b = { footprint: wholeFootprint(hit, c), piece: partAt(hit.geometry, c), height: +hit.properties.render_height || +hit.properties.height || null, base: +hit.properties.render_min_height || 0, center: c };
    if (adding) add(b); else open(b);
    return true;
  });
  // open the building at a point (search results, the assistant). Needs the 3D layer rendered there (zoom 14+).
  ctx.buildingAt = c => {
    if (!map.getLayer('fs-bldg')) return null;
    const p = map.project(c), hit = map.queryRenderedFeatures([[p.x - 3, p.y - 3], [p.x + 3, p.y + 3]], { layers: ['fs-bldg'] }).find(h => inGeom(c, partAt(h.geometry, c))) ;
    if (!hit) return null;
    const b = { footprint: wholeFootprint(hit, c), piece: partAt(hit.geometry, c), height: +hit.properties.render_height || +hit.properties.height || null, base: +hit.properties.render_min_height || 0, center: c };
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
    const lidRaw = !!b.footprint && lid?.source === '3dep-lidar' && lid.height_m > 2 && !(built && lidYear && built > lidYear);
    const sane = lidRaw ? plausibleHeight(lid.height_m, { mapHeight: b.height && b.height !== 6 ? b.height - (b.base || 0) : null, levels: osm?.levels, stories: p?.stories }) : { ok: false };
    const lidOk = lidRaw && sane.ok;
    let h = null, hSrc = '';
    if (lidOk) { h = lid.height_m; hSrc = 'USGS lidar ' + lidYear; }
    else if (osm?.height_m) { h = osm.height_m; hSrc = 'OpenStreetMap'; }
    else if (b.height && b.height !== 6) { h = b.height - (b.base || 0); hSrc = 'map data (estimate)'; }
    let fl = null, fSrc = '';
    if (osm?.levels) { fl = osm.levels; fSrc = 'OpenStreetMap'; }
    else if (p?.stories) { fl = p.stories; fSrc = 'appraisal record'; }
    else if (h && b.footprint) { fl = floorsFromHeight(h, (osm?.use || '') + ' ' + (p?.landUse || '')); fSrc = 'estimated from height'; }
    const note = lidRaw && !sane.ok ? 'The ' + lidYear + ' lidar reading here (' + ft(lid.height_m) + ') looks wrong: ' + sane.why + ', so it is not used.'
      : lid?.source === '3dep-lidar' && built && lidYear && built > lidYear ? 'Built ' + built + ', after the ' + lidYear + ' lidar survey, so the lidar height is not used.'
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
    if (!r.length && !s.note) return '<div class="rnote">' + (b.footprint ? 'No size or height data for this building yet.' : 'No building outline is mapped at this spot. Click a building for its footprint, height and floors.') + '</div>';
    return '<dl class="bsize">' + r.map(([k, v]) => '<dt>' + k + '</dt><dd class="mono">' + v + '</dd>').join('') + '</dl>' + (s.note ? '<div class="rnote">' + esc(s.note) + '</div>' : '');
  }
  // parcel, businesses, photo, lidar height and OpenStreetMap tags for one building (cached on the object). Two requests
  // in parallel: the parcel alone (about a second) and everything else (OpenStreetMap and lidar can take several), so the
  // appraisal record shows as soon as it arrives (onParcel) instead of waiting for the slowest source.
  // One lookup per building however many callers ask (the card and the "All" tab can ask together).
  function details(b, onParcel) { return b.d ? Promise.resolve(b.d) : (b.p ||= load(b, onParcel).finally(() => { b.p = null; })); }
  async function load(b, onParcel) {
    const q = new URLSearchParams({ lat: b.center[1].toFixed(6), lon: b.center[0].toFixed(6) });
    const get = part => fetch('api/building?' + q + '&part=' + part).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error ' + r.status); return d; });
    const pj = get('parcel').then(d => { b.parcel = d.parcel; try { onParcel?.(d); } catch (e) { console.warn(e); } return d; });
    const ring = b.footprint && (b.footprint.type === 'Polygon' ? b.footprint.coordinates[0] : null);
    if (ring) { const step = Math.max(1, Math.ceil(ring.length / 100)); q.set('fp', ring.filter((p, i) => i % step === 0).map(p => p[0].toFixed(6) + ',' + p[1].toFixed(6)).join(';')); }
    const [p, rest] = await Promise.allSettled([pj, get('rest')]);
    if (p.status === 'rejected' && rest.status === 'rejected') throw p.reason;
    const d = { ...(rest.value || { places: [], placesError: rest.reason.message, osm: null, height: { source: 'none', note: 'Lookup failed: ' + rest.reason.message }, photo: null }),
      ...(p.value || { parcel: null, parcelError: p.reason.message }) };
    b.d = d; b.parcel = d.parcel;
    // OpenStreetMap's outline is the whole building (the map's can be cut at a tile edge): use it when it contains the click
    // (compared with the piece under the click, not the joined footprint, so OpenStreetMap's single building always wins
    // over a bigger tile-based guess)
    const o = d.osm?.outline; if (o && (!b.footprint || inGeom(b.center, o)) && sqft(o) >= sqft(b.piece || b.footprint) * .9) b.footprint = o;
    return d;
  }

  async function open(b) {
    ctx.clearSelection?.(); stopOrbit(); cur = b; highlight();
    const gsv = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + b.center[1].toFixed(6) + ',' + b.center[0].toFixed(6);
    const ss = t => '<div class="ssrc src">' + t + '</div>';
    card.innerHTML = '<div class="top"><div><div class="kicker" id="bKick">' + (b.footprint ? 'Building' : 'Parcel') + '</div><h2 id="bTitle">Loading parcel…</h2><div class="bsub" id="bSub">' + b.center[1].toFixed(5) + ', ' + b.center[0].toFixed(5) + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
      ctx.cardNav([['bParcel', 'Value'], ['bSize', 'Building'], ['bSite', 'Site'], ['bCrime', 'Crime'], ['bArea', 'Area'], ['bPlaces', 'Businesses'], ['airSec', 'Air'], ['bFilings', 'Construction'], ['bRegrid', 'Regrid'], ['liveSec', 'From Here'], ['bTools', 'Tools']]) + '</div>' +
      '<div class="bover" id="bOver" hidden></div>' +
      '<div class="bsec" id="bParcel"><div class="lt">Ownership &amp; Value</div><div class="rnote">Looking up the appraisal record…</div></div>' +
      '<div class="bsec" id="bSize"><div class="lt">Building</div><div id="bPhoto"></div><div id="bSizeBody">' + sizeRows(b) + '<div class="rnote">Measuring height from lidar…</div></div>' +
        ss('Footprint: OpenStreetMap. Height: USGS 3DEP lidar where it is newer than the building, otherwise OpenStreetMap. Floors: OpenStreetMap or the appraisal record, otherwise estimated from height.') + '</div>' +
      '<div class="bsec" id="bSite"></div><div class="bsec" id="bCrime"></div><div class="bsec" id="bCrimeUS"></div><div class="bsec" id="bArea"></div><div class="bsec" id="bPlaces"><div class="lt">Businesses on the Block</div><div class="rnote">Looking up…</div></div><div class="bsec" id="bTenants"></div>' +
      '<div class="bsec" id="bFilings"></div><div class="bsec" id="bRegrid"></div><div class="bsrc"></div>' +
      '<div class="bsec" id="bTools"><div class="lt">Site Tools</div><div class="bacts">' + '<button class="btn" id="bMulti" title="Then ' + (matchMedia('(pointer: coarse)').matches ? 'tap' : 'click (or Shift-click)') + ' more buildings or parcels, up to 10">Select Multiple</button>' +
        '<button class="btn" id="bOrbit">Orbit View</button><a class="btn" href="' + gsv + '" target="_blank" rel="noopener">Street View ↗</a><button class="btn" id="bNote">Add Site Note</button><button class="btn askai" id="bAsk">Ask AI About It</button></div></div>';
    card.classList.add('open');
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#bOrbit').onclick = orbit;
    card.querySelector('#bMulti').onclick = () => ctx.tabs?.setAdding(true); // or Shift-click
    ctx.tabs?.track({ id: bid(b), kind: 'building', label: b.parcel?.situs || (b.footprint ? 'Building' : 'Parcel'), ref: b, reopen: () => open(b), leave: stopOrbit });
    card.querySelector('#bNote').onclick = () => ctx.addNote?.({ at: b.center });
    card.querySelector('#bAsk').onclick = () => { const t = card.querySelector('#bTitle')?.textContent; ctx.assistant?.ask('Tell me about ' + (t && !/^Loading/.test(t) ? t : 'this property') + ': owner, value, site and the area around it'); };
    if (ctx.reduceMotion) card.querySelector('#bOrbit').remove();
    renderFilings(null); renderArea();
    ctx.renderCrimeNear?.(card.querySelector('#bCrime'), b.center, () => { const t = card.querySelector('#bTitle')?.textContent; return t && !/^Loading/.test(t) ? t : 'this property'; }, () => cur === b);
    ctx.renderCrimeUS?.(card.querySelector('#bCrimeUS'), b.center, () => cur === b);
    ctx.cardRendered({ kind: 'building', center: b.center, label: () => card.querySelector('#bTitle')?.textContent || 'Building', sub: () => card.querySelector('#bSub')?.textContent || '', subject: () => newsSubject(b) });
    let d = null, early = false;
    // the appraisal record first: owner, value, title, the parcel outline and everything keyed on it
    const onParcel = pd => {
      if (cur !== b) return; early = true; highlight(); ctx.tabs?.label(bid(b), pd.parcel?.situs || pd.parcel?.owner || (b.footprint ? 'Building' : 'Parcel'));
      renderParcel(pd.parcel, pd.parcelError); renderFilings(pd.parcel?.geometry || null); renderOverview(b, { ...pd, ...(b.d || {}) }); renderTenants(pd.parcel);
      ctx.renderSite?.(card.querySelector('#bSite'), b.center, pd.parcel); ctx.renderRegrid?.(card.querySelector('#bRegrid'), b.center, pd.parcel);
    };
    try { d = await details(b, onParcel); }
    catch (err) { if (cur !== b) return; card.querySelector('#bParcel').innerHTML = '<div class="lt">Parcel</div><div class="rnote">Parcel lookup unavailable (' + esc(err.message) + ').</div>'; card.querySelector('#bTitle').textContent = 'Building'; card.querySelector('#bPlaces').innerHTML = ''; card.querySelector('#bSizeBody').innerHTML = sizeRows(b); return; }
    if (cur !== b) return;
    highlight(); ctx.tabs?.label(bid(b), d.parcel?.situs || d.parcel?.owner || (b.footprint ? 'Building' : 'Parcel'));
    card.querySelector('#bSizeBody').innerHTML = sizeRows(b);
    // the parcel list (a building on several parcels) comes with the second lookup, so the parcel section is redrawn with it
    if (!early || d.parcels?.length > 1) renderParcel(d.parcel, d.parcelError, d.parcels);
    if (!early) { renderFilings(d.parcel?.geometry || null); renderTenants(d.parcel); ctx.renderSite?.(card.querySelector('#bSite'), b.center, d.parcel); ctx.renderRegrid?.(card.querySelector('#bRegrid'), b.center, d.parcel); }
    renderOverview(b, d); renderPlaces(d.places || [], d.placesError); renderPhoto(d.photo);
  }
  ctx.buildingStats = () => { const list = selected(); return list.map(b => ({ address: b.parcel?.situs || null, ...stats(b), owner: b.parcel?.owner || null })); };

  // ---------- several buildings / parcels: each is a tab; "All" sums them up ----------
  const same = (a, b) => a.footprint && b.footprint ? a.footprint === b.footprint || inGeom(a.center, b.footprint) || inGeom(b.center, a.footprint) : Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) < 0.00005 || (a.parcel?.propId && a.parcel?.propId === b.parcel?.propId);
  function add(b) {
    // the same building again while adding: take it out of the selection
    const t = (ctx.tabs?.list('building') || []).find(x => same(x.ref, b)); if (t) { ctx.tabs.remove(t.id); return; }
    ctx.tabs?.arm({ shiftKey: true }); open(b);
  }
  // the "All" tab while two or more buildings are selected
  function syncAll() {
    const n = ctx.tabs?.list('building').length || 0;
    if (n >= 2) { ctx.tabs.pin({ id: 'b:all', kind: 'summary', label: 'All ' + n, reopen: renderAll });
      for (const t of ctx.tabs.list('building')) { const x = t.ref; if (x && !x.d && !x.loading) x.loading = details(x).catch(e => { x.err = e.message; }).finally(() => { x.loading = null; highlight(); if (ctx.tabs.active()?.id === 'b:all') renderAll(); else ctx.tabs.label(t.id, x.parcel?.situs || x.parcel?.owner || t.label); }); } }
    else ctx.tabs?.pin({ id: 'b:all', drop: true });
  }
  function renderAll() {
    const list = (ctx.tabs?.list('building') || []).map(t => t.ref).filter(Boolean); if (!list.length) return; cur = null; stopOrbit();
    const rows = list.map(b => ({ b, s: stats(b) })), uniqP = new Map();
    list.forEach(b => { for (const p of b.d?.parcels?.length ? b.d.parcels : b.parcel ? [b.parcel] : []) if (p.propId) uniqP.set(p.propId, p); });
    const tot = k => rows.reduce((t, r) => t + (r.s[k] || 0), 0), mv = [...uniqP.values()].reduce((t, p) => t + (p.marketValue || 0), 0);
    const acres = [...uniqP.values()].reduce((t, p) => t + (/acre/i.test(p.area || '') ? parseFloat(p.area) : 0), 0);
    const geoms = [...uniqP.values()].map(p => p.geometry).concat(list.filter(b => !b.parcel).map(b => b.footprint)).filter(Boolean);
    const fl = F.filter(f => geoms.some(g => inGeom([f.lon, f.lat], g))), loading = list.some(b => b.loading);
    card.innerHTML = '<div class="top"><div><div class="kicker">Selection</div><h2>' + list.length + ' buildings &amp; parcels</h2><div class="bsub">' + ((matchMedia('(pointer: coarse)').matches ? 'Tap Add to pick more' : 'Shift-click to add more') + ' · up to 10') + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' +
      '<div class="kgrid msum"><div><b>' + (tot('fp') ? fmtN(tot('fp')) : '—') + '</b><span>Footprint sq ft</span></div><div><b>' + (tot('gfa') ? '~' + fmtN(tot('gfa')) : '—') + '</b><span>Est. floor area sq ft</span></div>' +
      '<div><b>' + (mv ? fmtM(mv) : '—') + '</b><span>Market value · ' + uniqP.size + ' parcel' + (uniqP.size === 1 ? '' : 's') + '</span></div><div><b>' + (acres ? acres.toFixed(2) : '—') + '</b><span>Land acres</span></div></div>' +
      (loading ? '<div class="rnote">Loading parcels and heights…</div>' : '') +
      '<div class="bsec"><div class="lt">Selected</div>' + rows.map(({ b, s }, i) => '<div class="mrow"><button class="lnk" data-go="' + i + '"><b><i class="mnum">' + (i + 1) + '</i>' + esc(b.parcel?.situs || (b.footprint ? 'Building ' : 'Parcel ') + (i + 1)) + '</b><span>' +
        [s.fp ? fmtN(s.fp) + ' sq ft footprint' : (b.footprint ? '' : 'parcel only'), s.fl ? (s.fSrc === 'estimated from height' ? '~' : '') + s.fl + ' fl' : '', s.h ? ft(s.h) : '', b.d?.parcels?.length > 1 ? b.d.parcels.length + ' parcels' : '', b.parcel?.owner || ''].filter(Boolean).map(esc).join(' · ') + (b.err ? ' · lookup failed' : '') + '</span></button><button class="x" data-rm="' + i + '" aria-label="Remove">×</button></div>').join('') + '</div>' +
      (fl.length ? '<div class="bsec"><div class="lt">Construction filings on these parcels</div><div class="rnote">' + fl.length + ' filing' + (fl.length > 1 ? 's' : '') + ' · est. ' + fmtM(fl.reduce((t, f) => t + f.cost, 0)) + '</div></div>' : '') +
      '<div class="bacts"><button class="btn" id="mCsv">Export CSV</button><button class="btn" id="mFit">Zoom to All</button><button class="btn" id="mClear">Clear</button></div>';
    card.classList.add('open');
    ctx.tabs?.track({ id: 'b:all', kind: 'summary', label: 'All ' + list.length, reopen: renderAll, pinned: true });
    highlight();
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#mClear').onclick = () => ctx.closeCard();
    card.querySelector('#mFit').onclick = () => { const pts = list.map(b => b.center); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); map.fitBounds([[Math.min(...xs) - .0008, Math.min(...ys) - .0008], [Math.max(...xs) + .0008, Math.max(...ys) + .0008]], { padding: 60, maxZoom: 18, duration: ctx.reduceMotion ? 0 : 800 }); };
    card.querySelector('#mCsv').onclick = () => ctx.exportCsv(rows.map(({ b, s }, i) => ({ '#': i + 1, Address: b.parcel?.situs || '', Owner: b.parcel?.owner || '', 'Property ID': b.parcel?.propId || '', Parcels: b.d?.parcels?.length || (b.parcel ? 1 : 0), 'Footprint sq ft': s.fp || '',
      'Est. floor area sq ft': s.gfa || '', 'Height ft': s.h ? Math.round(s.h * 3.281) : '', 'Height source': s.hSrc, Floors: s.fl || '', 'Floors source': s.fSrc, 'Market value': b.parcel?.marketValue || '', 'Year built': b.parcel?.yearBuilt || '', Latitude: b.center[1].toFixed(6), Longitude: b.center[0].toFixed(6) })), 'selected-buildings');
    const ids = ctx.tabs.list('building').map(t => t.id);
    card.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => ctx.tabs.remove(ids[+x.dataset.rm]));
    card.querySelectorAll('[data-go]').forEach(x => x.onclick = () => ctx.tabs.activate(ids[+x.dataset.go]));
  }

  const money = v => v ? fmtM(v) : '—';
  const fld = (k, v, o = {}) => '<div class="f' + (o.w ? ' w' : '') + '"><div class="fl">' + k + '</div><div class="fv' + (o.dim ? ' dim' : '') + '">' + v + '</div>' + (o.sub ? '<div class="fs">' + o.sub + '</div>' : '') + '</div>';
  const title = t => String(t || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  const appraised = p => p?.marketValue || ((p?.landValue || 0) + (p?.improvementValue || 0)) || null;
  // a building that spans several parcels (a shopping center, a warehouse built over lot lines): list them all, with totals
  function parcelsHtml(list) {
    if (!(list?.length > 1)) return '';
    const value = list.reduce((t, x) => t + (appraised(x) || 0), 0), acres = list.reduce((t, x) => t + (/acre/i.test(x.area || '') ? parseFloat(x.area) || 0 : 0), 0);
    const owners = new Set(list.map(x => (x.owner || '').trim().toUpperCase()).filter(Boolean));
    return '<div class="mparc"><div class="fl">This building sits on ' + list.length + ' parcels' + (owners.size ? ' · ' + owners.size + ' owner' + (owners.size > 1 ? 's' : '') : '') + '</div>' +
      list.map((x, i) => '<div class="mprow"><i class="mnum">' + (i + 1) + '</i><span><b>' + esc(x.situs || x.propId || 'Parcel') + '</b><em>' + esc([x.owner, x.area, x.landUse].filter(Boolean).join(' · ')) + '</em></span><span class="m mono">' + money(appraised(x)) + '</span></div>').join('') +
      '<div class="mprow tot"><i></i><span><b>Total</b><em>' + (acres ? acres.toFixed(2) + ' acres' : '') + '</em></span><span class="m mono">' + money(value) + '</span></div></div>';
  }
  function renderParcel(p, err, all) {
    const el = card.querySelector('#bParcel'), head = '<div class="lt">Ownership &amp; Value</div>';
    if (!p) {
      // the statewide parcel layer has no Harris or Waller County records (checked 2026-10-03)
      const co = ctx.DATA.counties.find(c => inGeom(cur.center, { type: 'MultiPolygon', coordinates: c.outline }))?.name;
      el.innerHTML = head + '<div class="rnote">' + (err ? 'Parcel lookup failed: ' + esc(err) : /^(Harris|Waller)$/.test(co || '') ? 'The statewide parcel data doesn’t include ' + co + ' County yet, so there’s no owner or value here.' : 'No parcel record found at this point.') + '</div>';
      card.querySelector('#bTitle').textContent = 'Building'; return;
    }
    card.querySelector('#bTitle').textContent = p.situs || p.owner || 'Building';
    card.querySelector('#bSub').textContent = [p.county ? title(p.county) + ' County' : '', p.landUse].filter(Boolean).join(' · ');
    const legal = String(p.raw?.LEGAL_DESC || '').replace(/^"+|"+$/g, '').replace(/""/g, '"').trim(), val = appraised(p);
    el.innerHTML = head + '<div class="fgrid">' +
      fld('Owner', esc(p.owner || '—'), { w: true, sub: p.mailing ? 'Mail: ' + esc(p.mailing) : '' }) +
      fld(p.marketValue ? 'Market value' : 'Appraised value', '<span class="mono">' + money(val) + '</span>', { sub: p.marketValue ? '' : 'Land + improvements' }) +
      fld('Tax year', esc(p.taxYear || '—')) +
      fld('Land', '<span class="mono">' + money(p.landValue) + '</span>') + fld('Improvements', '<span class="mono">' + money(p.improvementValue) + '</span>') +
      fld('Land area', esc(p.area || '—')) + fld('Year built', esc(p.yearBuilt || 'Not reported'), { dim: !p.yearBuilt }) +
      fld('Acquired', esc(p.acquired || '—'), { dim: !p.acquired }) + fld('Property ID', '<span class="mono">' + esc(p.propId || '—') + '</span>') +
      (legal ? fld('Legal description', esc(legal), { w: true }) : '') + '</div>' + parcelsHtml(all) +
      (p.raw ? '<details class="raw"><summary>All appraisal fields</summary><dl>' + Object.entries(p.raw).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl></details>' : '') +
      '<div class="ssrc src">' + esc(p.raw?.SOURCE ? title(p.raw.SOURCE) : 'County appraisal district') + ' via Texas GIO StratMap. Appraisal values, not sale prices.</div>';
  }
  // the dark summary at the top: who owns it, what it's worth, how big, and how busy construction is around it
  function renderOverview(b, d) {
    const el = card.querySelector('#bOver'); if (!el) return;
    const p = d.parcel, s = stats(b), val = appraised(p), parts = [];
    if (p) parts.push((p.area ? 'A <b>' + esc(/^[\d.]+ acres$/.test(p.area) ? p.area.replace(' acres', '-acre') : p.area) + '</b> parcel' : 'A parcel') + (p.owner ? ' owned by <b>' + esc(p.owner) + '</b>' : '') + (val ? ', appraised at <b>' + fmtM(val) + '</b>' : '') + '.');
    if (d.parcels?.length > 1) parts.push('The building spans <b>' + d.parcels.length + ' parcels</b>' + (d.parcels.some(appraised) ? ' appraised at ' + fmtM(d.parcels.reduce((t, x) => t + (appraised(x) || 0), 0)) + ' together' : '') + '.');
    if (s.h && b.footprint) parts.push('The building is about ' + ft(s.h) + ' tall' + (s.fl ? ' (' + (s.fSrc === 'estimated from height' ? '~' : '') + s.fl + ' floor' + (s.fl > 1 ? 's' : '') + ')' : '') + '.');
    const n = near1(b.center);
    if (n.list.length) parts.push('<b>' + fmtN(n.list.length) + ' construction filing' + (n.list.length > 1 ? 's' : '') + '</b> within a mile, est. ' + fmtM(n.value) + (n.recent ? '; ' + fmtN(n.recent) + ' filed in the last 12 months' : '') + '.');
    el.innerHTML = parts.length ? '<div class="kicker">Overview</div><div>' + parts.join(' ') + '</div>' : ''; el.hidden = !parts.length;
  }
  // what the News button searches for this spot: the businesses in it (then on the block), the owner, the street address,
  // the subdivision from the legal description, and the town and county (from the county outline when there's no parcel)
  function newsSubject(b) {
    const p = b.d?.parcel || b.parcel, shape = b.footprint || p?.geometry, places = b.d?.places || [];
    const inside = places.filter(x => shape && inGeom([x.lon, x.lat], shape)), biz = [...inside, ...places.filter(x => !inside.includes(x))].map(x => x.brand || x.name);
    const ten = p?.situsStreet ? ctx.tenantsPeek?.(p.situsStreet, p.situsZip, p.situsCity)?.tenants || [] : [];
    const county = p?.county || ctx.DATA.counties.find(c => inGeom(b.center, { type: 'MultiPolygon', coordinates: c.outline }))?.name || '';
    return { business: [...new Set([...ten.map(t => t.name), ...biz])].slice(0, 6), owner: p?.owner || '', addr: p?.situsStreet || '', legal: String(p?.raw?.LEGAL_DESC || ''),
      city: p?.situsCity || ctx.nearestPlace?.(b.center) || '', county: String(county).replace(/\s+county$/i, '') };
  }
  // filings within a mile of a point (flat distance; fine at this scale)
  function near1(c) {
    const k = Math.cos(c[1] * Math.PI / 180), yr = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const list = F.filter(f => !f.approx && Math.hypot((f.lon - c[0]) * k, f.lat - c[1]) * 69.1 <= 1);
    return { list, value: list.reduce((t, f) => t + (f.cost || 0), 0), recent: list.filter(f => (f.reg || '') >= yr).length };
  }
  function renderFilings(parcelGeom) {
    const b = cur, el = card.querySelector('#bFilings'); if (!el) return;
    const near = F.filter(f => parcelGeom ? inGeom([f.lon, f.lat], parcelGeom) : (b.footprint && inGeom([f.lon, f.lat], b.footprint)) || Math.hypot((f.lon - b.center[0]) * 0.87, f.lat - b.center[1]) < 0.0004);
    const n = near1(b.center);
    el.innerHTML = '<div class="lt">Construction Activity</div>' + (near.length ? '<div class="fl">On this ' + (parcelGeom ? 'parcel' : 'spot') + '</div>' + near.sort((x, y) => y.cost - x.cost).slice(0, 25).map(f => '<button class="chitem" data-id="' + esc(f.id) + '"><span><b>' + esc(f.name) + '</b><em>' + esc(f.reg) + ' · ' + esc(ctx.TYPE_LABEL[f.type] || f.type) + (f.use ? ' · ' + esc(f.use) : '') + '</em></span><span class="m">' + fmtM(f.cost) + '</span></button>').join('') : '<div class="rnote">No filings on this ' + (parcelGeom ? 'parcel' : 'spot') + ' in the period loaded.</div>') +
      (n.list.length ? '<div class="fs">' + fmtN(n.list.length) + ' filing' + (n.list.length > 1 ? 's' : '') + ' within 1 mile, est. ' + fmtM(n.value) + (n.recent ? '; ' + fmtN(n.recent) + ' filed in the last 12 months' : '') + '.</div>' : '') +
      '<div class="ssrc src">TDLR TABS registrations. Costs are filer estimates.</div>';
    el.querySelectorAll('.chitem').forEach(x => x.onclick = () => ctx.select(ctx.BY_ID.get(x.dataset.id), false));
  }
  function renderPlaces(list, err) {
    const el = card.querySelector('#bPlaces'), b = cur;
    if (err && !list.length) { el.innerHTML = '<div class="lt">Businesses on the Block</div><div class="rnote">Lookup failed: ' + esc(err) + '</div>'; return; }
    const shape = b.footprint || b.parcel?.geometry;
    const inside = list.filter(p => shape && inGeom([p.lon, p.lat], shape)), other = list.filter(p => !inside.includes(p)).slice(0, 30);
    const li = p => '<div class="pl"><b>' + esc(p.name) + '</b><span>' + esc(p.kind) + (p.brand && p.brand !== p.name ? ' · ' + esc(p.brand) : '') + '</span></div>';
    el.innerHTML = '<div class="lt">Businesses on the Block</div>' + (inside.length ? inside.map(li).join('') : '<div class="rnote">None mapped inside this ' + (b.footprint ? 'building' : 'parcel') + '.</div>') +
      (other.length ? '<details class="raw"' + (inside.length ? '' : ' open') + '><summary>Nearby (' + other.length + ')</summary>' + other.map(li).join('') + '</details>' : '') +
      '<div class="ssrc src">OpenStreetMap, within about 150 m. Registered businesses at the address (Texas Comptroller) are listed below.</div>';
  }
  // retail and service tenants registered at the parcel's street address (Texas Comptroller, via api/tenants)
  async function renderTenants(p) {
    const b = cur, el = card.querySelector('#bTenants'); if (!el || !ctx.tenantsAt) return;
    if (!p?.situsStreet || !/^\d/.test(p.situsStreet) || !(p.situsZip || p.situsCity)) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="lt">Registered businesses<span class="src"> (Texas Comptroller)</span></div><div class="rnote">Looking up…</div>';
    try { const d = await ctx.tenantsAt(p.situsStreet, p.situsZip, p.situsCity); if (cur === b) ctx.renderTenants(el, d); }
    catch (e) { if (cur === b) ctx.renderTenants(el, null, e.message); }
  }
  function renderPhoto(ph) {
    const el = card.querySelector('#bPhoto'); if (!el || !ph) return;
    el.innerHTML = '<a class="bphoto" href="' + esc(ph.link) + '" target="_blank" rel="noopener"><img alt="Street-level photo near this building" loading="lazy" src="' + esc(ph.thumb) + '"><span>Mapillary · ' + esc(ph.captured || '') + '</span></a>';
  }
  // area of a tract outline in square miles (equirectangular, fine at tract size) and an equal-area radius, so the
  // card can say how big an area the numbers describe: tracts follow population, not distance
  function sqMiles(g) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; let a = 0;
    for (const rings of polys) rings.forEach((ring, k) => { const lat0 = ring[0][1] * Math.PI / 180, kx = 69.17 * Math.cos(lat0), ky = 69.17; let s = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
      a += (k ? -1 : 1) * Math.abs(s) / 2; });
    return Math.max(0, a);
  }
  const tractNo = g => { const c = String(g).slice(-6); return String(+c.slice(0, 4)) + (c.slice(4) === '00' ? '' : '.' + c.slice(4)); };
  async function renderArea() {
    const b = cur; await loadMarket(); if (cur !== b) return;
    const el = card.querySelector('#bArea'); if (!el || !market?.tracts) return;
    const t = market.tracts.find(t => inGeom(b.center, t.geom)); if (!t) return;
    const g = t.gr == null ? '—' : (t.gr > 0 ? '+' : '') + t.gr + '%';
    const sq = sqMiles(t.geom), r = Math.sqrt(sq / Math.PI), f1 = v => v < 10 ? v.toFixed(1) : String(Math.round(v));
    el.innerHTML = '<div class="lt">Area · Census Tract ' + esc(tractNo(t.g)) + '</div><div class="fs">About ' + f1(sq) + ' sq mi around it (like a ' + f1(r) + '-mile radius). Tracts follow population, so they are small in dense areas and large in rural ones.</div><div class="kgrid"><div><b>' + (t.pop != null ? fmtN(t.pop) : '—') + '</b><span>Population</span></div><div><b>' + g + '</b><span>Growth since ' + (market.baseYear || '') + '</span></div>' +
      '<div><b>' + (t.inc ? fmtM(t.inc) : '—') + '</b><span>Median income</span></div><div><b>' + (t.val ? fmtM(t.val) : '—') + '</b><span>Median home value</span></div>' +
      (market.jobsYear && t.jobs != null ? '<div><b>' + fmtN(t.jobs) + '</b><span>Jobs here (' + market.jobsYear + ')</span></div><div><b>' + (t.jgr == null ? '—' : (t.jgr > 0 ? '+' : '') + t.jgr + '%') + '</b><span>Job growth since ' + (market.jobsBaseYear || '') + '</span></div>' : '') +
      (market.spendYear && t.sph != null ? '<div><b>' + fmtM(t.sph) + '</b><span>Spending / household (est.)</span></div><div><b>' + (t.dine != null ? fmtM(t.dine) : '—') + '</b><span>Dining out / yr, tract (est.)</span></div>' : '') + '</div>' +
      '<div class="ssrc src">US Census ACS ' + market.year + ' 5-year' + (market.jobsYear ? ' · LEHD LODES jobs ' + market.jobsYear : '') + (market.spendYear ? ' · spending estimated from BLS Consumer Expenditure Survey' : '') + '.</div>';
  }
}
