// Live planes and low-flight history on the map (api/planes.js; data from the adsb.lol / airplanes.live ADS-B networks).
//   Live Planes:            every aircraft in view, refreshed every 10 s and moved smoothly in between along its track;
//                           click one for callsign, type, altitude, speed, route and a follow camera. Works anywhere.
//   Low Flight Paths:       30-day density of aircraft seen below 3,000 ft (api/planes-sample.js samples every 5 min).
//   Air traffic (cards):    low-aircraft sightings a day over a property and the nearest airport.
// Both toggles live in Layers → Live Conditions (registered with src/live.js) and in the assistant's set_live_layers.
const REFRESH = 10e3, MINZ = 5, KT = 1.852 / 3600; // km per second per knot
const BANDS = [[1, '#8d9598'], [3000, '#e3622b'], [10000, '#eda100'], [25000, '#3987e5'], [99999, '#1f9249']]; // ground, low, climbing, mid, cruise

export function initPlanes(ctx) {
  const { map, esc, toast } = ctx, card = ctx.card;
  let list = [], at = 0, src = '', timer = 0, tick = 0, ctl = null, moveT = 0, err = '', follow = null, shown = null, paths = null, pathsCtl = null;
  const on = () => !!ctx.live?.state?.().planes;

  // ---------- icon: an airplane pointing north, drawn once as an SDF so altitude bands can recolour it ----------
  function planeImage() {
    const n = 64, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), m = n / 2;
    g.fillStyle = '#000'; g.beginPath();
    g.moveTo(m, 4); g.lineTo(m + 4, 14); g.lineTo(m + 4, 24); g.lineTo(m + 26, 36); g.lineTo(m + 26, 41); g.lineTo(m + 4, 34); g.lineTo(m + 4, 50);
    g.lineTo(m + 11, 56); g.lineTo(m + 11, 60); g.lineTo(m, 57); g.lineTo(m - 11, 60); g.lineTo(m - 11, 56); g.lineTo(m - 4, 50); g.lineTo(m - 4, 34);
    g.lineTo(m - 26, 41); g.lineTo(m - 26, 36); g.lineTo(m - 4, 24); g.lineTo(m - 4, 14); g.closePath(); g.fill();
    return g.getImageData(0, 0, n, n);
  }
  const altLabel = p => p.ground ? 'ground' : p.alt == null ? '' : p.alt >= 18000 ? 'FL' + Math.round(p.alt / 100) : p.alt.toLocaleString('en-US') + ' ft';
  // dead reckoning: where each plane is now, from its last report, ground speed and track (capped at a minute)
  function fc() {
    const dt = Math.min(60, (Date.now() - at) / 1000), R = Math.PI / 180;
    return { type: 'FeatureCollection', features: list.map(p => {
      let { lon, lat } = p;
      if (!p.ground && p.gs > 30 && p.track != null) { const d = p.gs * KT * dt, a = p.track * R; lat += d * Math.cos(a) / 110.57; lon += d * Math.sin(a) / (111.32 * Math.cos(lat * R)); }
      return { type: 'Feature', properties: { hex: p.hex, track: p.track || 0, alt: p.ground ? 0 : (p.alt ?? 0), t: [p.flight || p.reg || '', altLabel(p)].filter(Boolean).join('\n') }, geometry: { type: 'Point', coordinates: [lon, lat] } };
    }) };
  }
  const below = () => ['filings', 'fs-field'].find(id => map.getLayer(id));
  function addLayers() {
    if (!map.getStyle()) return;
    if (!map.hasImage('live-plane')) map.addImage('live-plane', planeImage(), { sdf: true, pixelRatio: 2 });
    if (!map.getSource('live-planes')) map.addSource('live-planes', { type: 'geojson', data: fc(), attribution: 'Aircraft: adsb.lol (ODbL) · airplanes.live' });
    if (!map.getLayer('live-planes')) map.addLayer({ id: 'live-planes', type: 'symbol', source: 'live-planes', layout: {
      'icon-image': 'live-plane', 'icon-rotate': ['get', 'track'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, .45, 9, .68, 13, .95],
      'text-field': ['step', ['zoom'], '', 9, ['get', 't']], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': [0, 1.9], 'text-optional': true, 'text-allow-overlap': false },
      paint: { 'icon-color': ['step', ['get', 'alt'], BANDS[0][1], ...BANDS.flatMap(([a, c], i) => i ? [BANDS[i - 1][0], c] : [])],
        'icon-halo-color': ctx.isDark() ? '#0b0d0c' : '#ffffff', 'icon-halo-width': 1.4,
        'text-color': ctx.isDark() ? '#dde1e2' : '#23282a', 'text-halo-color': ctx.isDark() ? '#16191a' : '#ffffff', 'text-halo-width': 1.5 } });
  }
  function removeLayers() { if (map.getLayer('live-planes')) map.removeLayer('live-planes'); if (map.getSource('live-planes')) map.removeSource('live-planes'); }

  async function load() {
    if (!on() || document.visibilityState === 'hidden') return;
    if (map.getZoom() < MINZ) { list = []; map.getSource('live-planes')?.setData(fc()); ctx.live.syncUI(); return; }
    const b = map.getBounds(), bbox = [b.getWest(), Math.max(-85, b.getSouth()), b.getEast(), Math.min(85, b.getNorth())].map(v => v.toFixed(3)).join(',');
    ctl?.abort(); ctl = new AbortController();
    try {
      const r = await fetch('api/planes?bbox=' + bbox, { signal: ctl.signal }), d = await r.json();
      if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
      // drop what's already older than a minute (the feeds keep stale entries briefly); positions are as of the feed's
      // time, never later than now (clock skew), and the moving icons start from there
      list = (d.aircraft || []).filter(p => p.seen == null || p.seen < 60); src = d.source; err = '';
      at = Math.min(Date.now(), Date.parse(d.time) || Date.now());
      map.getSource('live-planes')?.setData(fc()); if (shown) renderCard(shown, true); if (follow) followCam();
    } catch (e) { if (e.name !== 'AbortError') { err = e.message; } }
    ctx.live.syncUI();
  }
  function start() { addLayers(); load(); clearInterval(timer); clearInterval(tick); timer = setInterval(load, REFRESH);
    tick = setInterval(() => { if (list.length && map.getSource('live-planes')) { map.getSource('live-planes').setData(fc()); if (follow) followCam(); } }, 1000); }
  function stop() { clearInterval(timer); clearInterval(tick); ctl?.abort(); list = []; follow = null; removeLayers(); }
  map.on('moveend', () => { if (!on()) return; clearTimeout(moveT); moveT = setTimeout(load, 600); });
  document.addEventListener('visibilitychange', () => { if (on() && document.visibilityState === 'visible') load(); });

  // ---------- plane card ----------
  const find = hex => list.find(p => p.hex === hex);
  function followCam() { const f = fc().features.find(x => x.properties.hex === follow); if (f) map.easeTo({ center: f.geometry.coordinates, duration: 900, easing: t => t }); else follow = null; }
  const routes = new Map();
  async function routeFor(p) {
    if (!p.flight) return null; if (routes.has(p.flight)) return routes.get(p.flight);
    const job = fetch('api/planes?route=' + encodeURIComponent(p.flight) + '&lat=' + p.lat + '&lon=' + p.lon).then(r => r.ok ? r.json() : null).catch(() => null);
    routes.set(p.flight, job); return job;
  }
  const ap = a => a ? esc((a.code ? a.code + ' ' : '') + (a.city || a.name || '')) : '?';
  async function renderCard(hex, refresh) {
    const p = find(hex); if (!p) { if (!refresh) toast('That aircraft is no longer in view.'); return; }
    if (!refresh) { const keep = follow === hex ? hex : null; ctx.closeCard?.(); follow = keep; }
    shown = hex;
    const rows = [['Altitude', p.ground ? 'On the ground' : altLabel(p) + (p.vs ? (p.vs > 150 ? ' · climbing ' : p.vs < -150 ? ' · descending ' : ' · level ') + (Math.abs(p.vs) > 150 ? Math.abs(p.vs).toLocaleString('en-US') + ' ft/min' : '') : '')],
      ['Speed', p.gs != null ? p.gs + ' kt (' + Math.round(p.gs * 1.15078) + ' mph)' : '—'], ['Heading', p.track != null ? p.track + '°' : '—'],
      ['Aircraft', [p.type, p.desc].filter(Boolean).join(' · ') || '—'], ['Registration', p.reg || '—'], ['Squawk', p.squawk || '—'], ['ICAO hex', p.hex]];
    card.innerHTML = '<div class="top"><div><div class="kicker">Aircraft · live</div><h2>' + esc(p.flight || p.reg || p.hex.toUpperCase()) + '</h2><div class="bsub" id="plRoute">' + (p.flight ? 'Looking up the route…' : 'No callsign') + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' +
      '<dl>' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
      '<div class="bacts"><button class="btn' + (follow === hex ? ' on' : '') + '" id="plFollow">' + (follow === hex ? 'Following' : 'Follow') + '</button>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://globe.adsb.lol/?icao=' + encodeURIComponent(p.hex) + '">Track on adsb.lol ↗</a>' +
      (p.flight ? '<a class="btn" target="_blank" rel="noopener" href="https://www.flightaware.com/live/flight/' + encodeURIComponent(p.flight) + '">FlightAware ↗</a>' : '') + '</div>' +
      '<div class="bsrc rnote">Live ADS-B from ' + esc(src || 'adsb.lol') + ' (community receivers, ODbL). Positions refresh every 10 s; some military and private aircraft aren’t shown.</div>';
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#plFollow').onclick = () => { follow = follow === hex ? null : hex; renderCard(hex, true); if (follow) followCam(); };
    if (!refresh || !card.classList.contains('open')) card.classList.add('open');
    const r = await routeFor(p), el = card.querySelector('#plRoute');
    if (el && shown === hex) el.textContent = r?.origin && r?.destination ? ap(r.origin).replace(/&amp;/g, '&') + ' → ' + ap(r.destination).replace(/&amp;/g, '&') : p.flight ? 'Route not in the database' : 'No callsign';
  }
  ctx.onCardClose?.(() => { shown = null; follow = null; });
  ctx.mapClickHandlers.unshift(e => {
    if (!map.getLayer('live-planes')) return false;
    const hit = map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ['live-planes'] })[0]; if (!hit) return false;
    renderCard(hit.properties.hex); return true;
  });
  map.on('mousemove', 'live-planes', e => {
    const f = e.features?.[0]; if (!f) return; const p = find(f.properties.hex); if (!p) return; map.getCanvas().style.cursor = 'pointer';
    const tip = ctx.tip; tip.innerHTML = '<b>' + esc(p.flight || p.reg || p.hex.toUpperCase()) + '</b><span>' + esc([p.type, altLabel(p), p.gs != null ? p.gs + ' kt' : ''].filter(Boolean).join(' · ')) + '</span>';
    const x = e.point.x + 14, flip = x + 220 > ctx.viewport.clientWidth; tip.style.left = (flip ? e.point.x - 14 - tip.offsetWidth : x) + 'px'; tip.style.top = (e.point.y + 10) + 'px'; tip.style.opacity = 1;
  });
  map.on('mouseleave', 'live-planes', () => { map.getCanvas().style.cursor = ''; ctx.tip.style.opacity = 0; });

  ctx.live.register('planes', {
    label: 'Live Planes', persist: true,
    set: v => { v ? start() : stop(); },
    add: () => { addLayers(); map.getSource('live-planes')?.setData(fc()); },
    note: () => map.getZoom() < MINZ ? 'Zoom in to see planes.' : err ? 'Planes: ' + err : at ? list.length.toLocaleString('en-US') + ' aircraft in view · ' + new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + ' (' + src + ').' : 'Loading planes…',
    status: () => ({ count: list.length, time: at || null, source: src || null })
  });

  // ---------- Low Flight Paths (30-day history) ----------
  async function loadPaths() {
    const b = map.getBounds(), w = Math.max(b.getWest(), map.getCenter().lng - 2), e = Math.min(b.getEast(), map.getCenter().lng + 2), s = Math.max(b.getSouth(), map.getCenter().lat - 2), n = Math.min(b.getNorth(), map.getCenter().lat + 2);
    pathsCtl?.abort(); pathsCtl = new AbortController();
    try {
      const r = await fetch('api/planes?density=' + [w, s, e, n].map(v => v.toFixed(2)).join(',') + '&days=30', { signal: pathsCtl.signal }), d = await r.json();
      if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
      paths = d; map.getSource('live-flightpaths')?.setData(d.history ? d : { type: 'FeatureCollection', features: [] });
    } catch (e2) { if (e2.name !== 'AbortError') paths = { history: false, note: e2.message }; }
    ctx.live.syncUI();
  }
  function addPaths() {
    if (!map.getStyle()) return;
    if (!map.getSource('live-flightpaths')) map.addSource('live-flightpaths', { type: 'geojson', data: paths?.history ? paths : { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('live-flightpaths')) map.addLayer({ id: 'live-flightpaths', type: 'fill', source: 'live-flightpaths', paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'per_day'], 0.2, '#fde8c8', 2, '#f6b26b', 8, '#e3622b', 25, '#c03b3a', 80, '#7a1f1f'],
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, .55, 13, .4] } }, below());
  }
  function removePaths() { if (map.getLayer('live-flightpaths')) map.removeLayer('live-flightpaths'); if (map.getSource('live-flightpaths')) map.removeSource('live-flightpaths'); }
  let pathsT = 0; map.on('moveend', () => { if (!ctx.live?.state?.().flight_paths) return; clearTimeout(pathsT); pathsT = setTimeout(loadPaths, 800); });
  ctx.live.register('flight_paths', {
    label: 'Low Flight Paths (30 Days)', persist: true,
    set: async v => { if (!v) { removePaths(); return; } addPaths(); await loadPaths(); if (paths && paths.history === false) { removePaths(); return paths.note || 'flight history isn’t available yet'; } },
    add: addPaths,
    note: () => paths?.history ? 'Aircraft below 3,000 ft: sightings a day per ~1 km cell over ' + paths.sampled_days + ' sampled days (5-minute snapshots, an exposure index).' : paths?.note || '',
    status: () => ({ sampled_days: paths?.sampled_days ?? null, available: paths ? paths.history !== false : null })
  });

  // ---------- for property cards and the assistant ----------
  const hist = new Map();
  ctx.airHistory = (c, km = 1) => {
    const k = c.map(v => v.toFixed(3)).join(',') + '|' + km; if (hist.has(k)) return hist.get(k);
    const job = fetch('api/planes?history=' + c[0].toFixed(5) + ',' + c[1].toFixed(5) + '&km=' + km).then(r => r.json()).catch(e => ({ history: false, note: e.message }));
    hist.set(k, job); return job;
  };
  ctx.planesNear = async (c, miles = 3) => {
    const dLat = miles / 69, dLon = miles / (69 * Math.cos(c[1] * Math.PI / 180));
    const r = await fetch('api/planes?bbox=' + [c[0] - dLon, c[1] - dLat, c[0] + dLon, c[1] + dLat].map(v => v.toFixed(3)).join(',')), d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    const R = Math.PI / 180, mi = p => 3958.8 * 2 * Math.asin(Math.sqrt(Math.sin((p.lat - c[1]) * R / 2) ** 2 + Math.cos(c[1] * R) * Math.cos(p.lat * R) * Math.sin((p.lon - c[0]) * R / 2) ** 2));
    const near = (d.aircraft || []).map(p => ({ ...p, miles: Math.round(mi(p) * 10) / 10 })).filter(p => p.miles <= miles).sort((a, b) => a.miles - b.miles);
    return { source: d.source, time: d.time, aircraft: near };
  };
  ctx.showPlane = hex => renderCard(hex);

  // "Air Traffic" on filing and building cards: low aircraft over the spot (30-day history), only where it exists
  ctx.onCardRender?.(info => {
    const c = info.kind === 'filing' ? (info.f.approx ? null : [info.f.lon, info.f.lat]) : info.center; if (!c) return;
    ctx.airHistory(c, 1).then(h => {
      if (!h?.history || h.low_per_day == null || !card.classList.contains('open')) return;
      card.querySelector('#airSec')?.remove();
      const lvl = h.low_per_day >= 40 ? 'heavy' : h.low_per_day >= 10 ? 'moderate' : h.low_per_day >= 2 ? 'light' : 'very little';
      const sec = document.createElement('div'); sec.className = 'bsec'; sec.id = 'airSec';
      sec.innerHTML = '<div class="lt">Air Traffic</div><div><b>' + esc(lvl[0].toUpperCase() + lvl.slice(1)) + ' low air traffic</b>: about ' + h.low_per_day + ' sightings a day of aircraft below 3,000 ft within ~1 km' +
        (h.lowest_ft != null ? ', lowest ' + h.lowest_ft.toLocaleString('en-US') + ' ft' : '') + '.</div><div class="rnote">Last ' + h.days + ' days, ' + h.sampled_days + ' days sampled in 5-minute snapshots (an exposure index, not a flight count). <button class="lnk" type="button" id="airNow">Planes overhead now</button></div>';
      (card.querySelector('#liveSec') || card.querySelector('.bsrc') || card.lastElementChild)?.before(sec);
      sec.querySelector('#airNow').onclick = () => { ctx.live.set({ planes: true }); map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 11), duration: ctx.reduceMotion ? 0 : 700 }); };
    });
  });
}
