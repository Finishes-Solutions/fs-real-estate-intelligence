// Live layers and "from here" tools: weather radar, lightning, satellite clouds, wind, hurricanes, traffic, 3D terrain and
// NASA recent imagery on the map; drive time, weather, site imagery and news for the open property. All sources are free:
//   NOAA nowCOAST + NHC (via /api/tile), Open-Meteo (/api/weather), TomTom traffic (/api/tile, optional key), Mapterhorn terrain,
//   NASA GIBS + CMR (browser direct), news via Google News / GDELT (/api/news), OSRM or TomTom routing (/api/drive).
import { NASA, hlsPasses } from './lib/nasa.mjs';
const KEY = 'fs-live-v1';
const RASTER = { // proxied through api/tile; refreshed every few minutes
  radar: { label: 'Rain Radar', maxzoom: 12, opacity: .7, every: 4, attr: 'Radar: NWS NEXRAD via Iowa Environmental Mesonet' },
  lightning: { label: 'Lightning (15 Min)', maxzoom: 9, opacity: .85, every: 10, attr: 'Lightning: NOAA nowCOAST (Vaisala NLDN/GLD360)' },
  clouds: { label: 'Satellite Clouds (IR)', maxzoom: 9, opacity: .55, every: 10, attr: 'Clouds: NOAA nowCOAST (GOES infrared)' },
  storms: { label: 'Hurricanes & Tropical Storms', maxzoom: 10, opacity: .85, every: 15, attr: 'Tropical cyclones: NOAA National Hurricane Center' },
  traffic: { label: 'Live Traffic', maxzoom: 18, opacity: .9, every: 2, attr: 'Traffic © TomTom' }
};
const ORDER = ['radar', 'lightning', 'clouds', 'wind', 'storms', 'traffic', 'terrain', 'nasa', 'hires'];
const LABEL = { ...Object.fromEntries(Object.entries(RASTER).map(([k, v]) => [k, v.label])), wind: 'Wind (Arrows, mph)', terrain: '3D Terrain', nasa: 'NASA Recent Imagery (30 m)', hires: 'High-Res Site Imagery' };
const EARTH_MI = 3958.8, R = Math.PI / 180;
export const milesBetween = (a, b) => { const h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 2 * EARTH_MI * Math.asin(Math.sqrt(h)); };
const abs = p => new URL(p, location.href).href;
const ymd = d => d.toISOString().slice(0, 10);

export function initLive(ctx) {
  const { map, esc, toast } = ctx;
  const on = Object.fromEntries(ORDER.map(k => [k, false]));
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); ORDER.forEach(k => { if (k !== 'nasa' && k !== 'hires' && saved[k] === true) on[k] = true; }); } catch (e) {}
  // layers other modules add (src/planes.js): { label, set(v) -> false to refuse, add() after a style swap, note(), persist }
  const EXT = {}, allKeys = () => [...ORDER, ...Object.keys(EXT)];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(on)); } catch (e) {} };
  let trafficOK = null, windData = null, nasa = null, route = null, lastCard = null;
  const stamp = {};

  // ---------- layers panel ----------
  const panel = document.getElementById('layers'), box = document.createElement('div');
  box.className = 'live-ly';
  box.innerHTML = '<div class="lt">Live Conditions</div>' + ORDER.map(k => '<label class="tg2"><input type="checkbox" data-live="' + k + '"><span>' + esc(LABEL[k]) + '</span></label>').join('') +
    '<div class="rnote" id="liveNote"></div>';
  panel.appendChild(box);
  const note = box.querySelector('#liveNote');
  box.querySelectorAll('input[data-live]').forEach(i => i.onchange = () => set({ [i.dataset.live]: i.checked }));
  function syncUI() {
    box.querySelectorAll('input[data-live]').forEach(i => { i.checked = on[i.dataset.live]; if (i.dataset.live === 'traffic') i.disabled = trafficOK === false && !on.traffic; });
    const bits = [];
    if (trafficOK === false) bits.push('Traffic needs a TomTom key on the server (see README).');
    if (on.wind && windData?.time) bits.push('Wind as of ' + new Date(windData.time + ':00').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' (Open-Meteo).');
    if (on.terrain && map.getZoom() < TERRAIN_Z) bits.push('3D terrain appears once you zoom in to town level.');
    if (on.nasa && nasa) bits.push(nasa.day ? 'NASA ' + nasa.name + ' pass ' + nasa.day + (nasa.cloud != null ? ' · ' + Math.round(nasa.cloud) + '% cloud in the scene' : '') + '.' : 'No clear NASA pass found here in the last 60 days.');
    for (const [k, x] of Object.entries(EXT)) { const t = on[k] && x.note?.(); if (t) bits.push(t); }
    note.textContent = bits.join(' ');
  }
  fetch('api/tile').then(r => r.ok ? r.json() : { traffic: false }).then(d => { trafficOK = !!d.traffic; if (!trafficOK && on.traffic) { on.traffic = false; removeRaster('traffic'); } syncUI(); }).catch(() => { trafficOK = false; syncUI(); });

  // ---------- raster overlays ----------
  const below = () => ['heat', 'filings', 'fs-field'].find(id => map.getLayer(id));
  const bucket = k => Math.floor(Date.now() / (RASTER[k].every * 60e3));
  const tileUrl = k => abs('api/tile?l=' + k + '&z={z}&x={x}&y={y}&t=' + bucket(k));
  function addRaster(k) {
    if (!map.getStyle()) return; const id = 'live-' + k;
    if (!map.getSource(id)) map.addSource(id, { type: 'raster', tiles: [tileUrl(k)], tileSize: 256, maxzoom: RASTER[k].maxzoom, attribution: RASTER[k].attr });
    if (!map.getLayer(id)) map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': RASTER[k].opacity, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, below());
    stamp[k] = bucket(k);
  }
  function removeRaster(k) { const id = 'live-' + k; if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
  setInterval(() => { for (const k of Object.keys(RASTER)) if (on[k] && stamp[k] !== bucket(k)) { const s = map.getSource('live-' + k); if (s?.setTiles) { s.setTiles([tileUrl(k)]); stamp[k] = bucket(k); } } }, 60e3);

  // ---------- wind arrows (Open-Meteo grid over the view) ----------
  function arrowImage() {
    const n = 48, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.beginPath(); g.moveTo(n / 2, 4); g.lineTo(n / 2 + 11, 22); g.lineTo(n / 2 + 4, 20); g.lineTo(n / 2 + 4, n - 6); g.lineTo(n / 2 - 4, n - 6); g.lineTo(n / 2 - 4, 20); g.lineTo(n / 2 - 11, 22); g.closePath(); g.fill();
    return g.getImageData(0, 0, n, n);
  }
  const windFC = () => ({ type: 'FeatureCollection', features: (windData?.points || []).map(p => ({ type: 'Feature', properties: { mph: p.mph, gust: p.gust, rot: (p.dir + 180) % 360, t: p.mph + (p.gust > p.mph + 5 ? '–' + p.gust : '') }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
  function addWind() {
    if (!map.getStyle()) return;
    if (!map.hasImage('live-arrow')) map.addImage('live-arrow', arrowImage(), { sdf: true, pixelRatio: 2 });
    if (!map.getSource('live-wind')) map.addSource('live-wind', { type: 'geojson', data: windFC(), attribution: 'Wind: Open-Meteo.com (CC BY 4.0)' });
    if (!map.getLayer('live-wind')) map.addLayer({ id: 'live-wind', type: 'symbol', source: 'live-wind', layout: {
      'icon-image': 'live-arrow', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['get', 'mph'], 0, .45, 10, .7, 25, 1, 50, 1.3],
      'text-field': ['concat', ['get', 't'], ' mph'], 'text-font': ['Noto Sans Bold'], 'text-size': 10.5, 'text-offset': [0, 1.7], 'text-allow-overlap': false, 'text-optional': true },
      paint: { 'icon-color': ['interpolate', ['linear'], ['get', 'mph'], 0, '#3987e5', 10, '#1f9249', 18, '#eda100', 28, '#e3622b', 40, '#c03b3a'], 'icon-halo-color': ctx.isDark() ? '#16191a' : '#ffffff', 'icon-halo-width': 1.2,
        'text-color': ctx.isDark() ? '#dde1e2' : '#23282a', 'text-halo-color': ctx.isDark() ? '#16191a' : '#ffffff', 'text-halo-width': 1.5 } });
  }
  function removeWind() { if (map.getLayer('live-wind')) map.removeLayer('live-wind'); if (map.getSource('live-wind')) map.removeSource('live-wind'); }
  let windT = 0, windCtl = null;
  async function loadWind() {
    if (!on.wind) return;
    const b = map.getBounds(), z = map.getZoom(), bbox = z < 6 ? [-97.6, 28.6, -94.2, 31.4] : [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    windCtl?.abort(); windCtl = new AbortController();
    try { const r = await fetch('api/weather?kind=wind&bbox=' + bbox.map(v => v.toFixed(2)).join(','), { signal: windCtl.signal }); const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status);
      windData = d; map.getSource('live-wind')?.setData(windFC()); syncUI(); if (!d.points.length && z >= 6) toast('Wind arrows cover Texas and nearby states only.'); }
    catch (e) { if (e.name !== 'AbortError') toast('Wind data didn’t load: ' + e.message); }
  }
  map.on('moveend', () => { if (!on.wind) return; clearTimeout(windT); windT = setTimeout(loadWind, 700); });
  setInterval(() => on.wind && loadWind(), 15 * 60e3);

  // ---------- 3D terrain (Mapterhorn, CC BY 4.0) ----------
  // The globe only turns into a flat (Mercator) map from zoom 11-12, and MapLibre doesn't fully support terrain on the globe
  // ("terrain is not fully supported on vertical perspective projection"): with terrain left on while zooming out to the
  // globe, the camera could end up off-centre or upside down. So the terrain mesh is only switched on from town zoom in;
  // the hillshade stays at every zoom.
  const TERRAIN_Z = 10;
  const setMesh = want => { const has = !!map.getTerrain?.(); if (want === has) return; try { map.setTerrain(want ? { source: 'live-dem', exaggeration: 1.8 } : null); } catch (e) { console.error(e); } syncUI(); };
  function addTerrain() {
    if (!map.getStyle()) return;
    if (!map.getSource('live-dem')) map.addSource('live-dem', { type: 'raster-dem', tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'], encoding: 'terrarium', tileSize: 512, maxzoom: 12, attribution: 'Terrain: Mapterhorn (CC BY 4.0)' });
    if (!map.getLayer('live-hill')) map.addLayer({ id: 'live-hill', type: 'hillshade', source: 'live-dem', paint: { 'hillshade-exaggeration': .35, 'hillshade-shadow-color': ctx.isDark() ? '#000000' : '#5b6366' } }, below());
    setMesh(map.getZoom() >= TERRAIN_Z);
  }
  // off as soon as a zoom-out passes the threshold (half a level of slack so it doesn't flicker), back on once the move settles
  map.on('zoom', () => { if (on.terrain && map.getZoom() < TERRAIN_Z - .5 && map.getTerrain?.()) setMesh(false); });
  map.on('moveend', () => { if (on.terrain && map.getSource('live-dem')) setMesh(map.getZoom() >= TERRAIN_Z); });
  function removeTerrain() { try { map.setTerrain(null); } catch (e) {} if (map.getLayer('live-hill')) map.removeLayer('live-hill'); if (map.getSource('live-dem')) map.removeSource('live-dem'); }

  // ---------- NASA recent imagery (HLS via GIBS; dates from CMR) ----------
  const passes = (box, days) => hlsPasses(box, days);

  const gibs = (p, day) => ['a', 'b', 'c'].map(s => 'https://gibs-' + s + '.earthdata.nasa.gov/wmts/epsg3857/best/' + NASA[p][0] + '/default/' + day + '/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png');
  const snapshot = (p, day, c, km = 2.5, px = 320) => { const dy = km / 111.32, dx = km / (111.32 * Math.cos(c[1] * R));
    return 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&LAYERS=' + NASA[p][0] + '&CRS=EPSG:4326&TIME=' + day + '&BBOX=' + [c[1] - dy, c[0] - dx, c[1] + dy, c[0] + dx].map(v => v.toFixed(5)).join(',') + '&WIDTH=' + px + '&HEIGHT=' + px + '&FORMAT=image/jpeg'; };
  function showNasa(pass) {
    nasa = pass ? { ...pass } : { day: null }; removeNasa(true);
    if (pass && map.getStyle()) {
      map.addSource('live-nasa', { type: 'raster', tiles: gibs(pass.product, pass.day), tileSize: 256, maxzoom: 12, attribution: 'Imagery: NASA GIBS / HLS (' + pass.name + ', ' + pass.day + ')' });
      map.addLayer({ id: 'live-nasa', type: 'raster', source: 'live-nasa', paint: { 'raster-opacity': .95 } }, ['live-hill', 'county-line', ...Object.keys(RASTER).map(k => 'live-' + k)].find(id => map.getLayer(id)) || below());
    }
    on.nasa = true; syncUI();
  }
  function removeNasa(keepState) { if (map.getLayer('live-nasa')) map.removeLayer('live-nasa'); if (map.getSource('live-nasa')) map.removeSource('live-nasa'); if (!keepState) nasa = null; }
  const clear = list => list.find(p => p.cloud != null && p.cloud <= 20) || list.find(p => p.cloud != null && p.cloud <= 50) || list[0] || null;
  async function nasaForView() {
    const c = map.getCenter(), b = map.getBounds(), half = Math.min(.3, (b.getEast() - b.getWest()) / 2);
    const list = await passes([c.lng - half, c.lat - half * .8, c.lng + half, c.lat + half * .8]);
    showNasa(clear(list)); return list;
  }

  // ---------- apply ----------
  function addAll() {
    for (const k of Object.keys(RASTER)) if (on[k]) addRaster(k);
    if (on.wind) addWind(); if (on.terrain) addTerrain(); if (on.nasa && nasa?.day) showNasa(nasa); if (on.hires && hires) showHires(hires);
    for (const [k, x] of Object.entries(EXT)) if (on[k]) x.add?.();
    if (route) drawRoute(route);
  }
  ctx.onOverlays(addAll);
  function register(k, x) {
    EXT[k] = x; on[k] = false;
    const lab = document.createElement('label'); lab.className = 'tg2'; lab.innerHTML = '<input type="checkbox" data-live="' + k + '"><span>' + esc(x.label) + '</span>';
    lab.querySelector('input').onchange = e => set({ [k]: e.target.checked }); box.insertBefore(lab, note);
    if (x.persist && saved[k] === true) { const go = () => set({ [k]: true }); map.loaded() ? go() : map.once('load', go); }
    syncUI();
  }
  async function set(a) {
    const done = [];
    if (a.all_off) allKeys().forEach(k => { if (on[k]) a[k] = false; });
    for (const k of allKeys()) {
      const v = a[k === 'nasa' ? (k in a ? k : 'nasa_imagery') : k]; if (typeof v !== 'boolean') continue;
      if (k === 'traffic' && v && trafficOK === false) { done.push('traffic unavailable (no TomTom key on the server)'); continue; }
      if (EXT[k]) { on[k] = v; const r = await EXT[k].set(v); if (r === false || typeof r === 'string') { on[k] = false; done.push(typeof r === 'string' ? r : EXT[k].label + ' unavailable'); } else done.push(EXT[k].label + (v ? ' on' : ' off')); continue; }
      on[k] = v; done.push(LABEL[k].replace(/ \(.*\)$/, '') + (v ? ' on' : ' off'));
      if (RASTER[k]) v ? addRaster(k) : removeRaster(k);
      else if (k === 'wind') { if (v) { addWind(); await loadWind(); } else removeWind(); }
      else if (k === 'terrain') { if (v) { addTerrain(); if (map.getZoom() >= TERRAIN_Z && map.getPitch() < 30) map.easeTo({ pitch: 55, duration: ctx.reduceMotion ? 0 : 700 }); else if (map.getZoom() < TERRAIN_Z) done.push('terrain shows once zoomed in to town level'); } else removeTerrain(); }
      else if (k === 'hires') { if (v && hires) showHires(hires); else if (v) { on.hires = false; done.push('high-res imagery: open a property, tap Site Imagery and pick a version first'); toast('Open a property, tap Site Imagery, then pick a high-res version and Show on Map.'); } else removeHires(); }
      else if (k === 'nasa') { if (v) { try { await nasaForView(); } catch (e) { on.nasa = false; done.push('NASA imagery failed: ' + e.message); } } else removeNasa(); }
    }
    if (a.storms === true) { try { const d = await (await fetch('api/weather?kind=storms')).json(); if (!d.storms?.length) done.push('no active hurricanes or tropical storms right now'); } catch (e) {} }
    save(); syncUI(); return done.length ? done : ['no change'];
  }
  if (Object.values(on).some(Boolean)) map.once('load', () => { if (on.wind) loadWind(); syncUI(); });

  // ---------- route line ----------
  function drawRoute(r) {
    route = r; showChip(r); if (!map.getStyle()) return;
    const data = { type: 'FeatureCollection', features: r?.line?.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.line } }] : [] };
    if (!map.getSource('live-route')) map.addSource('live-route', { type: 'geojson', data }); else map.getSource('live-route').setData(data);
    if (!map.getLayer('live-route-case')) map.addLayer({ id: 'live-route-case', type: 'line', source: 'live-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .9 } }, below());
    if (!map.getLayer('live-route')) map.addLayer({ id: 'live-route', type: 'line', source: 'live-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3987e5', 'line-width': 4 } }, below());
  }
  // a small "Clear route" chip on the map whenever a route is showing (phone users have no other obvious way)
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'route-chip'; chip.hidden = true; ctx.viewport.appendChild(chip);
  chip.onclick = () => clearRoute();
  const showChip = r => { chip.hidden = !(r?.line?.length > 1); if (!chip.hidden) chip.innerHTML = '<span>Route' + (r.miles != null ? ' · ' + r.miles + ' mi' + (r.minutes != null ? ' · ' + r.minutes + ' min' : '') : '') + '</span><b aria-hidden="true">×</b><i class="sr">Clear route</i>'; };
  const clearRoute = () => { route = null; map.getSource('live-route')?.setData({ type: 'FeatureCollection', features: [] }); showChip(null); };

  // ---------- targets ----------
  ctx.onCardRender(info => { if (lastCard && lastCard !== info) clearRoute(); lastCard = info; renderCardTools(info); });
  ctx.onCardClose(() => { lastCard = null; clearRoute(); closeLightbox(); });
  const cardPoint = () => !lastCard || !document.getElementById('card').classList.contains('open') ? null
    : lastCard.kind === 'filing' ? { c: [lastCard.f.lon, lastCard.f.lat], name: lastCard.f.name, f: lastCard.f, approx: !!lastCard.f.approx } : { c: lastCard.center, name: lastCard.label() };
  async function place(name) {
    const n = String(name).toLowerCase().replace(/,?\s*(tx|texas)$/, '').trim(), town = (ctx.DATA.places || []).find(p => p[0].toLowerCase() === n);
    if (town) return { c: [town[1], town[2]], name: town[0] + ', TX' };
    const g = await ctx.geocode(name + (/texas|\btx\b/i.test(name) ? '' : ', Texas')); return g[0] ? { c: g[0].c, name: g[0].t } : null;
  }
  const nearest = c => ctx.F.reduce((b, f) => { const d = milesBetween(c, [f.lon, f.lat]); return d < b.d ? { f, d } : b; }, { f: null, d: Infinity });
  async function me() { if (!ctx.locate) throw new Error('This browser can’t share its location.'); return { c: await ctx.locate(), name: 'your location' }; }

  async function drive(a = {}) {
    const t = a.target || (a.filing_id ? 'filing' : a.to_place ? 'place' : 'selected');
    // the card this drive belongs to, taken before any waiting (GPS, routing): if it's closed or swapped meanwhile, don't draw
    const owner = t === 'selected' ? lastCard : null, gone = () => owner && owner !== lastCard;
    const from = a.from_place ? await place(a.from_place) : await me(); if (!from) return { error: 'Couldn’t find “' + a.from_place + '”.' };
    if (gone()) return { error: 'The property card was closed, so the drive was cancelled.' };
    let to = null, note = '';
    if (t === 'filing') { const f = ctx.BY_ID.get(String(a.filing_id || '').trim()); if (!f) return { error: 'That filing isn’t loaded.' }; to = { c: [f.lon, f.lat], name: f.name, f, approx: !!f.approx }; }
    else if (t === 'place') { to = a.to_place && await place(a.to_place); if (!to) return { error: 'Couldn’t find that destination.' }; }
    else if (t === 'selected') to = cardPoint();
    if (!to) { const n = nearest(from.c); if (!n.f) return { error: 'No filings are loaded.' }; to = { c: [n.f.lon, n.f.lat], name: n.f.name, f: n.f, approx: !!n.f.approx }; note = t === 'selected' ? 'No property card was open, so this is the filing nearest to the start point.' : ''; }
    const straight = milesBetween(from.c, to.c), out = { from: from.name, to: to.name, filing_id: to.f?.id, straight_line_miles: +straight.toFixed(2) };
    if (to.approx) out.caution = 'This filing’s location is approximate (city-level), so distances are rough.';
    if (note) out.note = note;
    if (straight < 0.1) { out.at_property = true; out.summary = 'You are at ' + to.name + ' (about ' + Math.round(straight * 5280) + ' ft away).'; return out; }
    const q = 'from=' + from.c[1].toFixed(5) + ',' + from.c[0].toFixed(5) + '&to=' + to.c[1].toFixed(5) + ',' + to.c[0].toFixed(5);
    try {
      const r = await fetch('api/drive?' + q), d = await r.json(); if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
      Object.assign(out, { road_miles: d.miles, drive_minutes_now: d.minutes, typical_minutes: d.typical_minutes, traffic_delay_minutes: d.delay_minutes, live_traffic: d.traffic, routing_source: d.source, routing_note: d.note });
      out.summary = to.name + ': ' + d.miles + ' mi by road (' + straight.toFixed(1) + ' mi straight), about ' + d.minutes + ' min' + (d.traffic ? (d.delay_minutes > 1 ? ' with ' + d.delay_minutes + ' min of traffic delay' : ', traffic is light') : ' (no live traffic data)') + '.';
      if (a.show_route !== false && gone()) out.note = [out.note, 'The card was closed before the route came back, so it isn’t drawn.'].filter(Boolean).join(' ');
      else if (a.show_route !== false) { drawRoute(d); const xs = d.line.map(p => p[0]), ys = d.line.map(p => p[1]); if (xs.length) map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 70, maxZoom: 15, duration: ctx.reduceMotion ? 0 : 900 }); }
    } catch (e) { out.road_error = e.message; out.summary = to.name + ' is ' + straight.toFixed(1) + ' mi away in a straight line (driving route unavailable: ' + e.message + ').'; }
    out.google_maps = 'https://www.google.com/maps/dir/?api=1&origin=' + from.c[1].toFixed(5) + ',' + from.c[0].toFixed(5) + '&destination=' + to.c[1].toFixed(5) + ',' + to.c[0].toFixed(5) + '&travelmode=driving';
    return out;
  }

  async function weather(a = {}) {
    const where = a.where || (a.place ? 'place' : cardPoint() ? 'selected' : 'me');
    const p = where === 'place' ? await place(a.place || '') : where === 'selected' ? cardPoint() : await me();
    if (!p) return { error: where === 'selected' ? 'No property card is open.' : 'Couldn’t find that place.' };
    const [r, s] = await Promise.all([fetch('api/weather?kind=here&at=' + p.c[1].toFixed(4) + ',' + p.c[0].toFixed(4)), fetch('api/weather?kind=storms').catch(() => null)]);
    const d = await r.json(); if (!r.ok) return { error: d.error || 'Weather unavailable.' };
    const st = s?.ok ? (await s.json()).storms || [] : null;
    return { place: p.name, ...d, active_tropical_storms: st == null ? 'unavailable' : st.map(x => ({ name: x.name, type: x.classification, wind_mph: x.wind_mph, moving: x.moving, miles_away: Math.round(milesBetween(p.c, [x.lon, x.lat])) })), source: 'Open-Meteo; NOAA NHC' };
  }

  // the next 7 days at the open property, the user's location or a named place
  async function forecast(a = {}) {
    const where = a.where || (a.place ? 'place' : cardPoint() ? 'selected' : 'me');
    const p = where === 'place' ? await place(a.place || '') : where === 'selected' ? cardPoint() : await me();
    if (!p) return { error: where === 'selected' ? 'No property card is open.' : 'Couldn’t find that place.' };
    const r = await fetch('api/weather?kind=forecast&at=' + p.c[1].toFixed(4) + ',' + p.c[0].toFixed(4)), d = await r.json();
    if (!r.ok) return { error: d.error || 'Forecast unavailable.' };
    return { place: p.name, days: d.days.slice(0, Math.max(1, Math.min(7, a.days || 7))), source: 'Open-Meteo' };
  }

  // a filing's news subject: the project, the companies behind it, its street address, town and county, and the businesses
  // registered there when that lookup has already run
  function filingSubject(f) {
    const ad = ctx.filingAddr?.(f) || { street: '' }, ten = ad.street && ctx.tenantsPeek?.(ad.street, ad.zip, ad.city)?.tenants || [];
    const who = [f.dev, f.ten, f.owner].filter(Boolean);
    return { project: f.name, company: [...new Set(who.length ? who : [f.gc].filter(Boolean))], business: ten.map(t => t.name), addr: /^\d/.test(ad.street) ? ad.street : '', city: f.city || '', county: f.county || '' };
  }
  // one News search covers the project, its companies, the businesses at the spot, the owner, the address, the subdivision
  // and the town; each article says which of those found it
  async function news(a = {}) {
    const f = a.filing_id ? ctx.BY_ID.get(String(a.filing_id).trim()) : a.query ? null : cardPoint()?.f;
    let s = null;
    if (a.query) s = { company: [a.query], city: a.near || '' };
    else if (f) s = filingSubject(f);
    else if (lastCard?.subject && cardPoint()) { s = lastCard.subject(); const t = cardPoint().name;
      if (!s.business?.length && !s.owner && !s.addr && !s.city && !s.county && t && !/^(building|parcel|loading)/i.test(t)) s.company = [t]; }
    else if (a.near) s = { city: a.near };
    if (!s) { const c = cardPoint(); if (c) s = { company: [c.name] }; }
    if (!s) return { error: 'Say what to look up, or open a filing first.' };
    if (a.owner) s.owner = a.owner;
    if (a.businesses?.length) s.business = [...a.businesses, ...(s.business || [])];
    if (a.near && !a.query) s.city = s.city || a.near;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ project: s.project, owner: s.owner, addr: s.addr, legal: s.legal, city: s.city, county: s.county })) if (v) q.set(k, String(v).slice(0, k === 'legal' ? 200 : 100));
    (s.company || []).slice(0, 4).forEach(v => q.append('company', v)); (s.business || []).slice(0, 6).forEach(v => q.append('biz', v));
    if (f && !a.query) q.set('filing', f.id);
    const r = await fetch('api/news?' + q), d = await r.json(); if (!r.ok) return { error: d.error };
    return { searched: (d.searched || []).map(x => x.label), articles: d.articles.map(x => ({ title: x.title, url: x.url, domain: x.domain, date: x.date, about: x.about || (x.saved ? 'Saved earlier' : '') })), source: d.source || 'Google News',
      note: d.articles.length ? undefined : 'No coverage found in the last year for the project, the companies, the businesses there or the town. Single-asset LLC names rarely appear in news.' };
  }

  async function imagery(a = {}) {
    const f = a.filing_id ? ctx.BY_ID.get(String(a.filing_id).trim()) : null, p = f ? { c: [f.lon, f.lat], name: f.name } : cardPoint();
    if (!p) return { error: 'Open a filing or building first, or give a filing id.' };
    const [list, hi] = await Promise.all([passes([p.c[0] - .01, p.c[1] - .01, p.c[0] + .01, p.c[1] + .01]).catch(() => []), hiresCatalog(p.c)]);
    const high_res = hiItems(hi).map(x => ({ source: x.kind === 'wb' ? 'Esri World Imagery (archived version)' : 'USDA NAIP aerial photo', date: hiDate(x), resolution_m: x.res_m || x.gsd || null }));
    const pick = (a.date && list.find(x => x.day === a.date)) || clear(list);
    renderCardImagery(p.c, list, hi);
    if (!pick) return { place: p.name, passes: [], high_res, note: 'No NASA passes found here in the last 60 days. High-res aerial versions are shown in the card.' };
    if (a.show_on_map) { showNasa(pick); save(); map.flyTo({ center: p.c, zoom: Math.min(Math.max(map.getZoom(), 13.5), 14.5), duration: ctx.reduceMotion ? 0 : 900 }); }
    return { place: p.name, ...(a.show_on_map ? { showing: pick } : { clearest: pick, shown_as: 'preview images in the property card (map unchanged)' }), passes: list.slice(0, 12), high_res, note: 'NASA passes are 30 m pixels (land clearing, pads, big roofs) but arrive every few days. high_res versions are sub-metre aerial imagery (buildings, parking, equipment) but months to years old; dates are when each was captured. All are previewed in the card.' };
  }

  // ---------- result HTML, shared by the property card and the assistant's chat cards ----------
  const driveHTML = d => '<div class="live-big">' + (d.at_property ? 'You’re here' : d.road_miles != null ? d.drive_minutes_now + ' min · ' + d.road_miles + ' mi' : d.straight_line_miles.toFixed(1) + ' mi straight') + '</div>' +
    '<div class="rnote">' + esc(d.at_property ? d.summary : [d.straight_line_miles.toFixed(1) + ' mi straight line', d.live_traffic ? (d.traffic_delay_minutes > 1 ? d.traffic_delay_minutes + ' min traffic delay (usually ' + d.typical_minutes + ' min)' : 'traffic is light') : d.road_miles != null ? 'no live traffic data' : d.road_error, d.caution].filter(Boolean).join(' · ')) + '</div>' +
    (d.google_maps ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(d.google_maps) + '">Navigate in Google Maps ↗</a>' : '');
  const cap = t => String(t || '').replace(/\b[a-z]/g, c => c.toUpperCase()); // "mostly clear" -> "Mostly Clear"
  const weatherHTML = d => '<div class="live-big">' + Math.round(d.temp_f) + '°F · ' + esc(cap(d.conditions)) + '</div><div class="rnote">Wind ' + Math.round(d.wind_mph) + ' mph from the ' + esc(d.wind_from) + ' (gusts ' + Math.round(d.gust_mph) + ') · today ' + Math.round(d.today.low_f) + '–' + Math.round(d.today.high_f) + '°F, ' + (d.today.rain_chance_pct ?? 0) + '% rain</div>' +
    (d.tomorrow ? '<div class="rnote">Tomorrow ' + Math.round(d.tomorrow.low_f) + '–' + Math.round(d.tomorrow.high_f) + '°F, ' + (d.tomorrow.rain_chance_pct ?? 0) + '% rain</div>' : '') +
    (Array.isArray(d.active_tropical_storms) && d.active_tropical_storms.length ? '<div class="rnote">Active tropical systems: ' + d.active_tropical_storms.map(s => esc(s.type + ' ' + s.name + ' (' + s.miles_away.toLocaleString('en-US') + ' mi away)')).join(', ') + '</div>' : '') +
    '<div class="rnote src">Sources: Open-Meteo forecast · NOAA National Hurricane Center</div>';
  const dayName = (iso, i) => i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  // one row per day: name, conditions, rain chance and amount, a low–high bar on the week's range, wind
  const forecastHTML = d => { const lo = Math.min(...d.days.map(x => x.low_f ?? 99)), hi = Math.max(...d.days.map(x => x.high_f ?? -99)), span = Math.max(1, hi - lo);
    return '<div class="fc">' + d.days.map((x, i) => '<div class="fc-r"><b>' + esc(dayName(x.day, i)) + '</b><span class="fc-c">' + esc(cap(x.conditions || '')) + '</span>' +
      '<span class="fc-p" title="Chance of rain">' + (x.rain_chance_pct ?? 0) + '%' + (x.rain_in > 0.01 ? ' · ' + x.rain_in.toFixed(2) + '″' : '') + '</span>' +
      '<span class="fc-t"><i>' + Math.round(x.low_f) + '°</i><s><u style="left:' + ((x.low_f - lo) / span * 100).toFixed(1) + '%;right:' + ((hi - x.high_f) / span * 100).toFixed(1) + '%"></u></s><i>' + Math.round(x.high_f) + '°</i></span>' +
      '<span class="fc-w" title="Max wind (gusts)">' + Math.round(x.max_wind_mph) + (x.max_gust_mph ? '–' + Math.round(x.max_gust_mph) : '') + ' mph</span></div>').join('') + '</div>' +
      '<div class="rnote src">Source: Open-Meteo forecast (temperatures °F; rain = chance and expected inches; wind = max sustained–gusts)</div>'; };
  // articles grouped by what found them (this project, a company, a business there, the owner, the town), newest first in each
  const newsHTML = (d, n = 14) => { const groups = new Map(); for (const x of d.articles.slice(0, n)) { const k = x.about || 'News'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    return '<div class="rnote">Searched ' + esc((Array.isArray(d.searched) ? d.searched : [d.searched]).filter(Boolean).join(' · ')) + '</div>' + (d.articles.length ? [...groups].map(([k, l]) => (groups.size > 1 ? '<div class="fl">' + esc(k) + '</div>' : '') +
      l.map(x => '<a class="chitem" target="_blank" rel="noopener" href="' + esc(x.url) + '"><span><b>' + esc(x.title) + '</b><em>' + esc(x.domain) + (x.date ? ' · ' + esc(x.date) : '') + '</em></span></a>').join('')).join('') : '<div class="rnote">' + esc(d.note) + '</div>') + '<div class="rnote src">Source: ' + esc(d.source || 'Google News') + '</div>'; };

  // ---------- card tools: drive time, weather, site imagery, news ----------
  function renderCardTools(info) {
    const card = document.getElementById('card'); card.querySelector('#liveSec')?.remove();
    const sec = document.createElement('div'); sec.className = 'bsec live-sec'; sec.id = 'liveSec';
    sec.innerHTML = '<div class="lt">From Here</div><div class="btnrow"><button class="btn" data-a="drive">Drive Time From Me</button><button class="btn" data-a="wx">Weather</button><button class="btn" data-a="img">Site Imagery</button><button class="btn" data-a="news">News</button></div><div class="live-out" aria-live="polite"></div>';
    const brief = card.querySelector('#briefBox'); if (brief) brief.after(sec); else (card.querySelector('.bsrc') || card.lastElementChild)?.before(sec);
    const out = sec.querySelector('.live-out'), mine = () => lastCard === info;
    const busy = t => { out.innerHTML = '<div class="rnote">' + esc(t) + '</div>'; };
    const fail = e => { if (mine()) out.innerHTML = '<div class="rnote err">' + esc(e.message || e) + '</div>'; };
    sec.querySelector('[data-a=drive]').onclick = async () => { busy('Finding you and routing…'); try { const d = await drive({ target: 'selected' }); if (!mine()) return; if (d.error) throw new Error(d.error);
      out.innerHTML = driveHTML(d); } catch (e) { fail(e); } };
    sec.querySelector('[data-a=wx]').onclick = async () => { busy('Checking the weather…'); try { const d = await weather({ where: 'selected' }); if (!mine()) return; if (d.error) throw new Error(d.error);
      out.innerHTML = weatherHTML(d); } catch (e) { fail(e); } };
    sec.querySelector('[data-a=img]').onclick = async () => { busy('Looking for high-res aerial imagery and recent NASA passes…'); try {
      const c = info.kind === 'filing' ? [info.f.lon, info.f.lat] : info.center;
      const [list, hi] = await Promise.all([passes([c[0] - .01, c[1] - .01, c[0] + .01, c[1] + .01]).catch(() => []), hiresCatalog(c)]); if (!mine()) return;
      renderCardImagery(c, list, hi);
    } catch (e) { fail(e); } };
    sec.querySelector('[data-a=news]').onclick = async () => { busy('Searching news about the project, the businesses there, the owner and the area…'); try {
      const d = info.kind === 'filing' ? await news({ filing_id: info.f.id }) : await news(); if (!mine()) return; if (d.error) throw new Error(d.error);
      out.innerHTML = newsHTML(d);
    } catch (e) { fail(e); } };
  }

  // ---------- high-res site imagery (api/imagery: Esri World Imagery Wayback + USDA NAIP) ----------
  // Archived Esri versions where the imagery at the spot changed (sub-metre, capture dates vary) and NAIP aerial photos
  // (~0.6 m, Texas flown about every two years). Tiles come through our own endpoint, so they can be stitched into one
  // picture on a canvas, downloaded and shown on the map.
  let hires = null; // the version shown on the map
  const hiresCache = new Map();
  async function hiresCatalog(c) {
    const k = c.map(v => v.toFixed(4)).join(','); if (hiresCache.has(k)) return hiresCache.get(k);
    const p = fetch('api/imagery?at=' + k).then(r => r.ok ? r.json() : { wayback: [], naip: [] }).catch(() => ({ wayback: [], naip: [] }));
    hiresCache.set(k, p); return p;
  }
  const hiItems = hi => [...(hi?.wayback || []).slice(0, 6).map(x => ({ kind: 'wb', ...x })), ...(hi?.naip || []).slice(0, 3).map(x => ({ kind: 'naip', ...x }))];
  const hiDate = x => x.kind === 'wb' ? (x.captured || x.published) : x.date;
  const hiTile = (x, z, tx, ty) => abs('api/imagery?' + (x.kind === 'wb' ? 'src=wb&r=' + x.release : 'src=naip&item=' + encodeURIComponent(x.item) + '&s=' + (x.style || 'tms')) + '&z=' + z + '&x=' + tx + '&y=' + ty);
  const metersPerPx = (lat, z) => 156543.03392 * Math.cos(lat * R) / 2 ** z;
  // px × px picture centred on c at zoom z, from 256 px tiles
  const shots = new Map();
  function composite(x, c, z, px) {
    const key = [x.kind, x.release || x.item, z, px, c.join()].join('|'); if (shots.has(key)) return shots.get(key);
    const job = (async () => {
      const n = 256 * 2 ** z, s = Math.sin(c[1] * R), wx = (c[0] + 180) / 360 * n, wy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
      const x0 = Math.round(wx - px / 2), y0 = Math.round(wy - px / 2), cv = document.createElement('canvas'); cv.width = cv.height = px;
      const g = cv.getContext('2d'); g.fillStyle = '#0b0d0c'; g.fillRect(0, 0, px, px);
      const jobs = []; let ok = 0;
      for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + px - 1) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + px - 1) / 256); ty++)
        jobs.push(new Promise(res => { const im = new Image(); im.onload = () => { g.drawImage(im, tx * 256 - x0, ty * 256 - y0); ok++; res(); }; im.onerror = () => res(); im.src = hiTile(x, z, tx, ty); }));
      await Promise.all(jobs); if (!ok) throw new Error('No imagery tiles loaded'); return cv;
    })();
    shots.set(key, job); job.catch(() => shots.delete(key)); return job;
  }
  function showHires(x) {
    hires = x; removeHires(true); if (!map.getStyle()) return;
    map.addSource('live-hires', { type: 'raster', tiles: [hiTile(x, '{z}', '{x}', '{y}')], tileSize: 256, minzoom: 10, maxzoom: x.kind === 'naip' ? 18 : 19,
      attribution: x.kind === 'wb' ? 'Imagery: Esri World Imagery Wayback (' + hiDate(x) + ')' : 'Imagery: USDA NAIP ' + x.date + ' via Microsoft Planetary Computer' });
    map.addLayer({ id: 'live-hires', type: 'raster', source: 'live-hires', minzoom: 10 }, ['live-nasa', 'live-hill', 'county-line', ...Object.keys(RASTER).map(k => 'live-' + k)].find(id => map.getLayer(id)) || below());
    on.hires = true; syncUI();
  }
  function removeHires(keep) { if (map.getLayer('live-hires')) map.removeLayer('live-hires'); if (map.getSource('live-hires')) map.removeSource('live-hires'); if (!keep) hires = null; }

  // ---------- site imagery previews: thumbnails in the card, click for a large preview with download ----------
  const pic = p => p.kind === 'nasa' || !p.kind ? 'nasa' : 'hi';
  const capOf = p => pic(p) === 'nasa' ? p.day + ' · ' + p.name + (p.cloud != null ? ' · ' + Math.round(p.cloud) + '% cloud' : '')
    : p.kind === 'wb' ? (p.captured ? 'Captured ' + p.captured : 'Published ' + p.published) + (p.res_m ? ' · ' + p.res_m + ' m' : '') + ' · Esri' : p.date + ' · NAIP ' + (p.gsd || 0.6) + ' m';
  let lastImagery = null; // the latest site_imagery lookup, so the assistant can show the same thumbnails in the chat
  function renderCardImagery(c, list, hi, out = document.querySelector('#liveSec .live-out')) {
    lastImagery = { c, list, hi }; if (!out) return;
    const shown = (list || []).filter(p => p.cloud == null || p.cloud <= 60).slice(0, 4), nasaShow = (shown.length ? shown : (list || []).slice(0, 3)).map(p => ({ kind: 'nasa', ...p }));
    const hiShow = hiItems(hi), all = [...hiShow, ...nasaShow];
    if (!all.length) { out.innerHTML = '<div class="rnote">No imagery found here: no high-res versions and no NASA passes in the last 60 days.</div>'; return; }
    const thumbs = (arr, off) => '<div class="live-thumbs">' + arr.map((p, i) => '<button type="button" data-i="' + (off + i) + '" title="Preview">' + (pic(p) === 'nasa' ? '<img loading="lazy" alt="NASA image ' + esc(p.day) + '" src="' + esc(snapshot(p.product, p.day, c)) + '">' : '<img alt="" class="ld">') + '<span>' + esc(capOf(p)) + '</span></button>').join('') + '</div>';
    out.innerHTML = (hiShow.length ? '<div class="live-sub">High-Res Aerial · Dated</div>' + thumbs(hiShow, 0) + '<div class="rnote">Sub-metre imagery: buildings, parking, equipment. ' + (hi.wayback?.length ? 'Esri versions are listed only when the imagery here changed. ' : '') + 'Months to a few years old, so check the date.</div>' : '<div class="rnote">No high-res aerial versions found here.</div>') +
      (nasaShow.length ? '<div class="live-sub">Recent Satellite · NASA, Every Few Days</div>' + thumbs(nasaShow, hiShow.length) + '<div class="rnote">30 m pixels (about 2.5 km square): land clearing, pads and big roofs, not detail. Cloud % is for the whole scene.</div>' : '') +
      '<div class="rnote">Click an image to preview, download or show it on the map.</div>';
    out.querySelectorAll('[data-i]').forEach(b => b.onclick = () => openLightbox(all, +b.dataset.i, c));
    hiShow.forEach((p, i) => composite(p, c, 17, 256).then(cv => { const im = out.querySelector('[data-i="' + i + '"] img'); if (im) { im.src = cv.toDataURL('image/jpeg', .85); im.classList.remove('ld'); } })
      .catch(() => { const b = out.querySelector('[data-i="' + i + '"]'); if (b) { b.disabled = true; b.querySelector('span').textContent += ' · didn’t load'; } }));
  }
  let lb = null;
  function closeLightbox() { if (lb) { lb.remove(); lb = null; window.removeEventListener('keydown', lbKeys, true); } }
  // capture phase, so Esc closes only the preview and not the property card under it
  function lbKeys(e) { if (!lb) return; if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.stopImmediatePropagation(); e.preventDefault(); } if (e.key === 'Escape') closeLightbox(); else if (e.key === 'ArrowLeft') lb._step(-1); else if (e.key === 'ArrowRight') lb._step(1); }
  function openLightbox(list, i, c) {
    closeLightbox(); let wide = false;
    lb = document.createElement('div'); lb.className = 'lbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Site image preview');
    document.body.appendChild(lb); window.addEventListener('keydown', lbKeys, true);
    const where = (lastCard?.kind === 'filing' ? lastCard.f.name : lastCard?.label?.()) || 'site';
    const draw = () => {
      const p = list[i], nasaP = pic(p) === 'nasa', km = nasaP ? (wide ? 10 : 2.5) : null, z = wide ? 16 : 18, PX = 1024;
      const kmHi = Math.round(metersPerPx(c[1], z) * PX / 100) / 10;
      const title = nasaP ? p.day + ' · ' + p.name : p.kind === 'wb' ? 'Esri World Imagery · ' + (p.captured ? 'captured ' + p.captured : 'published ' + p.published) : 'USDA NAIP aerial photo · ' + p.date;
      const sub = nasaP ? (p.cloud != null ? Math.round(p.cloud) + '% cloud (whole scene) · ' : '') + km + ' km square · NASA HLS 30 m'
        : kmHi + ' km square · ' + (p.kind === 'wb' ? (p.res_m ? p.res_m + ' m source' : 'sub-metre') + (p.provider ? ' · ' + p.provider : '') + ' · Wayback version of ' + p.published : (p.gsd || 0.6) + ' m · via Microsoft Planetary Computer');
      lb.innerHTML = '<div class="lb-box"><div class="lb-h"><div><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div><button class="x" aria-label="Close">×</button></div>' +
        '<div class="lb-img">' + (list.length > 1 ? '<button class="lb-nav prev" aria-label="Previous">‹</button>' : '') + (nasaP ? '<img alt="NASA satellite image ' + esc(p.day) + '" src="' + esc(snapshot(p.product, p.day, c, km, 1024)) + '">' : '<img alt="High-res aerial image" class="ld"><div class="lb-load">Loading high-res tiles…</div>') + (list.length > 1 ? '<button class="lb-nav next" aria-label="Next">›</button>' : '') + '</div>' +
        '<div class="lb-f"><span>' + (i + 1) + ' of ' + list.length + '</span><button class="btn" id="lbWide">' + (wide ? 'Closer View' : 'Wider View') + '</button><button class="btn" id="lbMap">Show on Map</button><button class="btn primary" id="lbDl">Download</button></div></div>';
      lb.querySelector('.x').onclick = closeLightbox;
      lb.querySelector('.prev')?.addEventListener('click', () => lb._step(-1)); lb.querySelector('.next')?.addEventListener('click', () => lb._step(1));
      lb.querySelector('#lbWide').onclick = () => { wide = !wide; draw(); };
      lb.querySelector('#lbMap').onclick = () => { if (nasaP) showNasa(p); else showHires(p); save(); closeLightbox();
        map.flyTo({ center: c, zoom: nasaP ? (wide ? 12 : Math.max(map.getZoom(), 13.5)) : (wide ? 15.5 : 17.5), duration: ctx.reduceMotion ? 0 : 700 }); };
      const shot = nasaP ? null : composite(p, c, z, PX);
      if (shot) shot.then(cv => { const im = lb?.querySelector('.lb-img img'); if (im && list[i] === p) { im.src = cv.toDataURL('image/jpeg', .9); im.classList.remove('ld'); lb.querySelector('.lb-load')?.remove(); } })
        .catch(() => { const l = lb?.querySelector('.lb-load'); if (l) l.textContent = 'The imagery service didn’t answer. Try again in a minute.'; });
      lb.querySelector('#lbDl').onclick = async e => {
        const tag = nasaP ? 'nasa-' + p.day + '-' + p.name : p.kind === 'wb' ? 'esri-' + hiDate(p) : 'naip-' + p.date;
        const name = (tag + '-' + where).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) + '.jpg';
        e.target.disabled = true; e.target.textContent = 'Downloading…';
        try {
          const blob = nasaP ? await fetch(snapshot(p.product, p.day, c, km, 1024), { mode: 'cors' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
            : await shot.then(cv => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('no image')), 'image/jpeg', .92)));
          await ctx.saveFile(name, blob, 'image/jpeg');
        } catch (err) { if (nasaP) { window.open(snapshot(p.product, p.day, c, km, 1024), '_blank', 'noopener'); ctx.toast('Opened the full image in a new tab. Save it from there.'); } else ctx.toast('Couldn’t build the download: ' + err.message); }
        finally { if (lb) { e.target.disabled = false; e.target.textContent = 'Download'; } }
      };
    };
    lb._step = d => { i = (i + d + list.length) % list.length; draw(); };
    lb.addEventListener('pointerdown', e => { if (e.target === lb) closeLightbox(); });
    draw(); setTimeout(() => lb?.querySelector('#lbDl')?.focus(), 30);
  }

  syncUI();
  // for the Sources tab: what is on, how often it refreshes, and the latest data time we know of
  const status = () => ({ ext: Object.fromEntries(Object.entries(EXT).map(([k, x]) => [k, { on: !!on[k], ...(x.status?.() || {}) }])), hires: hires ? { kind: hires.kind, date: hiDate(hires) } : null, on: { ...on }, trafficOK, terrainMesh: !!map.getTerrain?.(), terrainZoom: TERRAIN_Z, windTime: windData?.time || null, nasa: nasa?.day ? { day: nasa.day, name: nasa.name, cloud: nasa.cloud } : null,
    raster: Object.fromEntries(Object.entries(RASTER).map(([k, v]) => [k, { every: v.every, requested: stamp[k] != null ? stamp[k] * v.every * 60e3 : null }])) });
  ctx.live = { register, syncUI, set, drive, weather, forecast, forecastHTML, news, imagery, clearRoute, state: () => ({ ...on }), status, driveHTML, weatherHTML, newsHTML,
    imageryInto: el => { if (lastImagery) renderCardImagery(lastImagery.c, lastImagery.list, lastImagery.hi, el); } };
}
