// Live layers and "from here" tools: weather radar, lightning, satellite clouds, wind, hurricanes, traffic, 3D terrain and
// NASA recent imagery on the map; drive time, weather, site imagery and news for the open property. All sources are free:
//   NOAA nowCOAST + NHC (via /api/tile), Open-Meteo (/api/weather), TomTom traffic (/api/tile, optional key), Mapterhorn terrain,
//   NASA GIBS + CMR (browser direct), GDELT news (/api/news), OSRM or TomTom routing (/api/drive).
const KEY = 'fs-live-v1';
const RASTER = { // proxied through api/tile; refreshed every few minutes
  radar: { label: 'Rain radar', maxzoom: 10, opacity: .7, every: 4, attr: 'Radar: NOAA nowCOAST (MRMS)' },
  lightning: { label: 'Lightning (15 min)', maxzoom: 9, opacity: .85, every: 10, attr: 'Lightning: NOAA nowCOAST (Vaisala NLDN/GLD360)' },
  clouds: { label: 'Satellite clouds (IR)', maxzoom: 9, opacity: .55, every: 10, attr: 'Clouds: NOAA nowCOAST (GOES infrared)' },
  storms: { label: 'Hurricanes & tropical storms', maxzoom: 10, opacity: .85, every: 15, attr: 'Tropical cyclones: NOAA National Hurricane Center' },
  traffic: { label: 'Live traffic', maxzoom: 18, opacity: .9, every: 2, attr: 'Traffic © TomTom' }
};
const ORDER = ['radar', 'lightning', 'clouds', 'wind', 'storms', 'traffic', 'terrain', 'nasa'];
const LABEL = { ...Object.fromEntries(Object.entries(RASTER).map(([k, v]) => [k, v.label])), wind: 'Wind (arrows, mph)', terrain: '3D terrain', nasa: 'NASA recent imagery (30 m)' };
const NASA = { S30: ['HLS_S30_Nadir_BRDF_Adjusted_Reflectance', 'C2021957295-LPCLOUD', 'Sentinel-2'], L30: ['HLS_L30_Nadir_BRDF_Adjusted_Reflectance', 'C2021957657-LPCLOUD', 'Landsat 8/9'] };
const EARTH_MI = 3958.8, R = Math.PI / 180;
export const milesBetween = (a, b) => { const h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 2 * EARTH_MI * Math.asin(Math.sqrt(h)); };
const abs = p => new URL(p, location.href).href;
const ymd = d => d.toISOString().slice(0, 10);

export function initLive(ctx) {
  const { map, esc, toast } = ctx;
  const on = Object.fromEntries(ORDER.map(k => [k, false]));
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); ORDER.forEach(k => { if (k !== 'nasa' && s[k] === true) on[k] = true; }); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(on)); } catch (e) {} };
  let trafficOK = null, windData = null, nasa = null, route = null, lastCard = null;
  const stamp = {};

  // ---------- layers panel ----------
  const panel = document.getElementById('layers'), box = document.createElement('div');
  box.className = 'live-ly';
  box.innerHTML = '<div class="lt">Live conditions</div>' + ORDER.map(k => '<label class="tg2"><input type="checkbox" data-live="' + k + '"><span>' + esc(LABEL[k]) + '</span></label>').join('') +
    '<div class="rnote" id="liveNote"></div>';
  panel.appendChild(box);
  const note = box.querySelector('#liveNote');
  box.querySelectorAll('input[data-live]').forEach(i => i.onchange = () => set({ [i.dataset.live]: i.checked }));
  function syncUI() {
    box.querySelectorAll('input[data-live]').forEach(i => { i.checked = on[i.dataset.live]; if (i.dataset.live === 'traffic') i.disabled = trafficOK === false && !on.traffic; });
    const bits = [];
    if (trafficOK === false) bits.push('Traffic needs a TomTom key on the server (see README).');
    if (on.wind && windData?.time) bits.push('Wind as of ' + new Date(windData.time + ':00').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' (Open-Meteo).');
    if (on.nasa && nasa) bits.push(nasa.day ? 'NASA ' + nasa.name + ' pass ' + nasa.day + (nasa.cloud != null ? ' · ' + Math.round(nasa.cloud) + '% cloud in the scene' : '') + '.' : 'No clear NASA pass found here in the last 60 days.');
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
    if (!map.getLayer(id)) map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': RASTER[k].opacity, 'raster-fade-duration': 0 } }, below());
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
  function addTerrain() {
    if (!map.getStyle()) return;
    if (!map.getSource('live-dem')) map.addSource('live-dem', { type: 'raster-dem', tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'], encoding: 'terrarium', tileSize: 512, maxzoom: 12, attribution: 'Terrain: Mapterhorn (CC BY 4.0)' });
    if (!map.getLayer('live-hill')) map.addLayer({ id: 'live-hill', type: 'hillshade', source: 'live-dem', paint: { 'hillshade-exaggeration': .35, 'hillshade-shadow-color': ctx.isDark() ? '#000000' : '#5b6366' } }, below());
    try { map.setTerrain({ source: 'live-dem', exaggeration: 1.8 }); } catch (e) { console.error(e); }
  }
  function removeTerrain() { try { map.setTerrain(null); } catch (e) {} if (map.getLayer('live-hill')) map.removeLayer('live-hill'); if (map.getSource('live-dem')) map.removeSource('live-dem'); }

  // ---------- NASA recent imagery (HLS via GIBS; dates from CMR) ----------
  async function passes([w, s, e, n], days = 60) {
    const end = new Date(), start = new Date(Date.now() - days * 864e5), out = [];
    await Promise.all(Object.entries(NASA).map(async ([p, [, coll, name]]) => {
      const u = 'https://cmr.earthdata.nasa.gov/search/granules.umm_json?collection_concept_id=' + coll + '&bounding_box=' + [w, s, e, n].map(v => v.toFixed(4)).join(',') + '&temporal=' + start.toISOString() + ',' + end.toISOString() + '&sort_key=-start_date&page_size=100';
      const r = await fetch(u); if (!r.ok) throw new Error('NASA CMR ' + r.status);
      for (const it of (await r.json()).items || []) {
        const t = it.umm?.TemporalExtent?.RangeDateTime?.BeginningDateTime; if (!t) continue;
        const cc = (it.umm.AdditionalAttributes || []).find(a => a.Name === 'CLOUD_COVERAGE')?.Values?.[0];
        out.push({ product: p, name, day: t.slice(0, 10), cloud: cc == null ? null : +cc });
      }
    }));
    // one entry per product/day: worst cloud of the granules that day (a scene is ~110 km, so this is a regional figure)
    const by = new Map(); for (const g of out) { const k = g.product + g.day, o = by.get(k); if (!o || (g.cloud ?? 100) > (o.cloud ?? 100)) by.set(k, g); }
    return [...by.values()].sort((a, b) => b.day.localeCompare(a.day) || (a.cloud ?? 100) - (b.cloud ?? 100));
  }
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
    if (on.wind) addWind(); if (on.terrain) addTerrain(); if (on.nasa && nasa?.day) showNasa(nasa);
    if (route) drawRoute(route);
  }
  ctx.onOverlays(addAll);
  async function set(a) {
    const done = [];
    if (a.all_off) ORDER.forEach(k => { if (on[k]) a[k] = false; });
    for (const k of ORDER) {
      const v = a[k === 'nasa' ? (k in a ? k : 'nasa_imagery') : k]; if (typeof v !== 'boolean') continue;
      if (k === 'traffic' && v && trafficOK === false) { done.push('traffic unavailable (no TomTom key on the server)'); continue; }
      on[k] = v; done.push(LABEL[k].replace(/ \(.*\)$/, '') + (v ? ' on' : ' off'));
      if (RASTER[k]) v ? addRaster(k) : removeRaster(k);
      else if (k === 'wind') { if (v) { addWind(); await loadWind(); } else removeWind(); }
      else if (k === 'terrain') { if (v) { addTerrain(); if (map.getPitch() < 30) map.easeTo({ pitch: 55, duration: ctx.reduceMotion ? 0 : 700 }); } else removeTerrain(); }
      else if (k === 'nasa') { if (v) { try { await nasaForView(); } catch (e) { on.nasa = false; done.push('NASA imagery failed: ' + e.message); } } else removeNasa(); }
    }
    if (a.storms === true) { try { const d = await (await fetch('api/weather?kind=storms')).json(); if (!d.storms?.length) done.push('no active hurricanes or tropical storms right now'); } catch (e) {} }
    save(); syncUI(); return done.length ? done : ['no change'];
  }
  if (Object.values(on).some(Boolean)) map.once('load', () => { if (on.wind) loadWind(); syncUI(); });

  // ---------- route line ----------
  function drawRoute(r) {
    route = r; if (!map.getStyle()) return;
    const data = { type: 'FeatureCollection', features: r?.line?.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.line } }] : [] };
    if (!map.getSource('live-route')) map.addSource('live-route', { type: 'geojson', data }); else map.getSource('live-route').setData(data);
    if (!map.getLayer('live-route-case')) map.addLayer({ id: 'live-route-case', type: 'line', source: 'live-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .9 } }, below());
    if (!map.getLayer('live-route')) map.addLayer({ id: 'live-route', type: 'line', source: 'live-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3987e5', 'line-width': 4 } }, below());
  }
  const clearRoute = () => { route = null; map.getSource('live-route')?.setData({ type: 'FeatureCollection', features: [] }); };

  // ---------- targets ----------
  ctx.onCardRender(info => { lastCard = info; renderCardTools(info); });
  ctx.onCardClose(() => { lastCard = null; });
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
    const from = a.from_place ? await place(a.from_place) : await me(); if (!from) return { error: 'Couldn’t find “' + a.from_place + '”.' };
    let to = null, note = '';
    const t = a.target || (a.filing_id ? 'filing' : a.to_place ? 'place' : 'selected');
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
      if (a.show_route !== false) { drawRoute(d); const xs = d.line.map(p => p[0]), ys = d.line.map(p => p[1]); if (xs.length) map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 70, maxZoom: 15, duration: ctx.reduceMotion ? 0 : 900 }); }
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

  async function news(a = {}) {
    let q = a.query || '', near = a.near || '';
    const f = a.filing_id ? ctx.BY_ID.get(String(a.filing_id).trim()) : cardPoint()?.f;
    if (!q && f) { q = f.dev || f.ten || f.owner || f.name; near = near || f.city || ''; }
    if (!q && !near) { const c = cardPoint(); if (c) q = c.name; }
    if (!q && !near) return { error: 'Say what to look up, or open a filing first.' };
    const r = await fetch('api/news?' + new URLSearchParams({ q, near })), d = await r.json(); if (!r.ok) return { error: d.error };
    return { searched: d.query, articles: d.articles, source: 'GDELT Project', note: d.articles.length ? undefined : 'No coverage found in the last ~3 months. Single-asset LLC names rarely appear in news; try the tenant or brand.' };
  }

  async function imagery(a = {}) {
    const f = a.filing_id ? ctx.BY_ID.get(String(a.filing_id).trim()) : null, p = f ? { c: [f.lon, f.lat], name: f.name } : cardPoint();
    if (!p) return { error: 'Open a filing or building first, or give a filing id.' };
    const list = await passes([p.c[0] - .01, p.c[1] - .01, p.c[0] + .01, p.c[1] + .01]);
    const pick = (a.date && list.find(x => x.day === a.date)) || clear(list);
    if (!pick) return { place: p.name, passes: [], note: 'No NASA passes found here in the last 60 days.' };
    showNasa(pick); save();
    map.flyTo({ center: p.c, zoom: Math.min(Math.max(map.getZoom(), 13.5), 14.5), duration: ctx.reduceMotion ? 0 : 900 });
    return { place: p.name, showing: pick, passes: list.slice(0, 12), note: '30 m pixels: shows land clearing, pads and big roofs, not fine detail. Cloud % is for the whole ~110 km scene.' };
  }

  // ---------- card tools: drive time, weather, site imagery, news ----------
  function renderCardTools(info) {
    const card = document.getElementById('card'); card.querySelector('#liveSec')?.remove();
    const sec = document.createElement('div'); sec.className = 'bsec live-sec'; sec.id = 'liveSec';
    sec.innerHTML = '<div class="lt">From here</div><div class="btnrow"><button class="btn" data-a="drive">Drive time from me</button><button class="btn" data-a="wx">Weather</button><button class="btn" data-a="img">Site imagery</button><button class="btn" data-a="news">News</button></div><div class="live-out" aria-live="polite"></div>';
    const brief = card.querySelector('#briefBox'); if (brief) brief.after(sec); else (card.querySelector('.bsrc') || card.lastElementChild)?.before(sec);
    const out = sec.querySelector('.live-out'), mine = () => lastCard === info;
    const busy = t => { out.innerHTML = '<div class="rnote">' + esc(t) + '</div>'; };
    const fail = e => { if (mine()) out.innerHTML = '<div class="rnote err">' + esc(e.message || e) + '</div>'; };
    sec.querySelector('[data-a=drive]').onclick = async () => { busy('Finding you and routing…'); try { const d = await drive({ target: 'selected' }); if (!mine()) return; if (d.error) throw new Error(d.error);
      out.innerHTML = '<div class="live-big">' + (d.at_property ? 'You’re here' : d.road_miles != null ? d.drive_minutes_now + ' min · ' + d.road_miles + ' mi' : d.straight_line_miles.toFixed(1) + ' mi straight') + '</div>' +
        '<div class="rnote">' + esc(d.at_property ? d.summary : [d.straight_line_miles.toFixed(1) + ' mi straight line', d.live_traffic ? (d.traffic_delay_minutes > 1 ? d.traffic_delay_minutes + ' min traffic delay (usually ' + d.typical_minutes + ' min)' : 'traffic is light') : d.road_miles != null ? 'no live traffic data' : d.road_error, d.caution].filter(Boolean).join(' · ')) + '</div>' +
        (d.google_maps ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(d.google_maps) + '">Navigate in Google Maps ↗</a>' : ''); } catch (e) { fail(e); } };
    sec.querySelector('[data-a=wx]').onclick = async () => { busy('Checking the weather…'); try { const d = await weather({ where: 'selected' }); if (!mine()) return; if (d.error) throw new Error(d.error);
      out.innerHTML = '<div class="live-big">' + Math.round(d.temp_f) + '°F · ' + esc(d.conditions) + '</div><div class="rnote">Wind ' + Math.round(d.wind_mph) + ' mph from the ' + esc(d.wind_from) + ' (gusts ' + Math.round(d.gust_mph) + ') · today ' + Math.round(d.today.low_f) + '–' + Math.round(d.today.high_f) + '°F, ' + (d.today.rain_chance_pct ?? 0) + '% rain</div>' +
        (Array.isArray(d.active_tropical_storms) && d.active_tropical_storms.length ? '<div class="rnote">' + d.active_tropical_storms.map(s => esc(s.type + ' ' + s.name + ', ' + s.miles_away + ' mi away')).join('<br>') + '</div>' : '') + '<div class="rnote">Open-Meteo · NOAA NHC</div>'; } catch (e) { fail(e); } };
    sec.querySelector('[data-a=img]').onclick = async () => { busy('Searching NASA passes over the last 60 days…'); try {
      const c = info.kind === 'filing' ? [info.f.lon, info.f.lat] : info.center, list = await passes([c[0] - .01, c[1] - .01, c[0] + .01, c[1] + .01]); if (!mine()) return;
      if (!list.length) { out.innerHTML = '<div class="rnote">No NASA passes here in the last 60 days.</div>'; return; }
      const shown = list.filter(p => p.cloud == null || p.cloud <= 60).slice(0, 6);
      out.innerHTML = '<div class="live-thumbs">' + (shown.length ? shown : list.slice(0, 3)).map((p, i) => '<button type="button" data-i="' + list.indexOf(p) + '" title="Show this pass on the map"><img loading="lazy" alt="" src="' + esc(snapshot(p.product, p.day, c)) + '"><span>' + esc(p.day) + ' · ' + esc(p.name) + (p.cloud != null ? ' · ' + Math.round(p.cloud) + '% cloud' : '') + '</span></button>').join('') + '</div>' +
        '<div class="rnote">NASA HLS, 30 m pixels (about 2.5 km square shown). Cloud % is for the whole scene; tap one to show it on the map.</div>';
      out.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { showNasa(list[+b.dataset.i]); save(); map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 13.5), duration: ctx.reduceMotion ? 0 : 700 }); });
    } catch (e) { fail(e); } };
    sec.querySelector('[data-a=news]').onclick = async () => { busy('Searching recent news…'); try {
      const d = info.kind === 'filing' ? await news({ filing_id: info.f.id }) : await news({ query: info.label() }); if (!mine()) return; if (d.error) throw new Error(d.error);
      out.innerHTML = '<div class="rnote">Searched ' + esc(d.searched) + '</div>' + (d.articles.length ? d.articles.slice(0, 8).map(x => '<a class="chitem" target="_blank" rel="noopener" href="' + esc(x.url) + '"><span><b>' + esc(x.title) + '</b><em>' + esc(x.domain) + (x.date ? ' · ' + esc(x.date) : '') + '</em></span></a>').join('') : '<div class="rnote">' + esc(d.note) + '</div>') + '<div class="rnote">News index: GDELT Project</div>';
    } catch (e) { fail(e); } };
  }

  syncUI();
  ctx.live = { set, drive, weather, news, imagery, clearRoute, state: () => ({ ...on }) };
}
