// Live planes and low-flight history on the map (api/planes.js; data from the adsb.lol / airplanes.live ADS-B networks).
//   Live Planes:            every aircraft in view, refreshed every 10 s and moved smoothly in between along its track;
//                           click one for callsign, type, altitude, speed, route and a follow camera. Works anywhere.
//   Low Flight Paths:       30-day density of aircraft seen below 3,000 ft (api/planes-sample.js samples every minute).
//   Air traffic (cards):    low-aircraft sightings a day over a property and the nearest airport.
//   Registration (card):    who a US plane is registered to, from the FAA registry (api/planes ?reg=, loaded nightly).
//   Photo, details, path:   the plane's photo (planespotters.net), maker / operator / year, and this flight's path from
//                           adsb.lol traces (api/planes ?aircraft= / ?track=): a line coloured by altitude, and in the 3D
//                           view (map tilted) a ribbon at the plane's real altitude with a curtain down to the ground.
// Both toggles live in Layers → Live Conditions (registered with src/live.js) and in the assistant's set_live_layers.
import { pickAircraft } from './lib/assist-logic.mjs';
import { SHAPES, SIZE } from './lib/aircraft-shapes.mjs';
import { smoothPath, altColorExpr, altGradient } from './lib/flightpath.mjs';
import { flightPath3D } from './flightpath3d.js';

const REFRESH = 10e3, MINZ = 5, KT = 1.852 / 3600; // km per second per knot
const BANDS = [[1, '#8d9598'], [3000, '#e3622b'], [10000, '#eda100'], [25000, '#3987e5'], [99999, '#1f9249']]; // ground, low, climbing, mid, cruise

export function initPlanes(ctx) {
  const { map, esc, toast } = ctx, card = ctx.card;
  let list = [], at = 0, src = '', timer = 0, tick = 0, ctl = null, moveT = 0, err = '', follow = null, shown = null, paths = null, pathsCtl = null;
  const on = () => !!ctx.live?.state?.().planes;

  // ---------- icons: a top-down silhouette per kind of aircraft (lib/aircraft-shapes.mjs picks it from the ICAO type),
  // nose north, drawn once each as SDFs so altitude bands can recolour them; SIZE scales them (a 747 dwarfs a Cessna) ----------
  function shapeImage(kind) {
    const n = 64, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), X = 32;
    g.fillStyle = '#000';
    const body = (y0, y1, w) => { const r = w / 2; g.beginPath(); g.moveTo(X - r, y0 + r * 1.8); g.quadraticCurveTo(X - r, y0, X, y0); g.quadraticCurveTo(X + r, y0, X + r, y0 + r * 1.8);
      g.lineTo(X + r * .55, y1 - 1.5); g.quadraticCurveTo(X, y1 + 1, X - r * .55, y1 - 1.5); g.closePath(); g.fill(); };
    // a pair of wings (or tailplanes): root at the fuselage, swept back by `sweep`, tip chord `tip`
    const wings = (y, root, span, sweep, tip, half = 2.5) => { for (const k of [-1, 1]) { g.beginPath(); g.moveTo(X + k * half, y); g.lineTo(X + k * span / 2, y + sweep);
      g.lineTo(X + k * span / 2, y + sweep + tip); g.lineTo(X + k * half, y + root); g.closePath(); g.fill(); } };
    const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); };
    const pods = (dx, y, len, w) => { for (const k of dx ? [-1, 1] : [0]) rr(X + k * dx - w / 2, y, w, len, w / 2); };
    const props = (dx, y, w) => { for (const k of dx ? [-1, 1] : [0]) g.fillRect(X + k * dx - w / 2, y, w, 1.8); };
    const blade = (cx, cy, len, w, a) => { g.save(); g.translate(cx, cy); g.rotate(a); g.fillRect(-len / 2, -w / 2, len, w); g.restore(); };
    switch (kind) {
      case 'heavy4': body(1, 62, 8); wings(21, 17, 62, 18, 5, 3.5); wings(51, 9, 26, 7, 3, 3); pods(13, 25, 9, 4.5); pods(22, 31, 8, 4); break;
      case 'heavy2': body(1, 62, 8); wings(21, 16, 62, 17, 5, 3.5); wings(51, 9, 26, 7, 3, 3); pods(15, 25, 11, 5.5); break;
      case 'regional': body(3, 61, 5.5); wings(27, 11, 46, 9, 4); wings(54, 7, 20, 5, 3); pods(5.4, 40, 10, 4); break;
      case 'bizjet': body(6, 58, 5); wings(28, 10, 40, 9, 3); wings(51, 6, 18, 5, 2.5); pods(5, 39, 8, 3.6); break;
      // military transport (C-17, C-130, tankers): wide body, high straight-ish wing with engines hung forward, T-tail
      case 'military': body(2, 60, 7.5); wings(20, 12, 60, 5, 6, 3.5); wings(54, 7, 26, 3, 4); pods(12, 16, 11, 4); pods(21, 18, 10, 3.6); break;
      case 'fighter': body(1, 62, 5); wings(20, 28, 36, 22, 4); wings(50, 10, 22, 7, 3); break;
      case 'turboprop2': body(6, 60, 5); wings(22, 9, 56, 0, 6); wings(52, 7, 20, 1, 5); pods(11, 15, 15, 4); props(11, 13.5, 12); break;
      case 'turboprop1': body(5, 58, 5); wings(20, 9, 50, 0, 6); wings(50, 7, 18, 1, 5); props(0, 3, 14); break;
      case 'twin': body(9, 56, 4.5); wings(24, 8, 46, 0, 6); wings(48, 6, 16, 0, 5); pods(9, 19, 11, 3.5); props(9, 17.5, 10); break;
      case 'single': body(7, 57, 4.5); wings(19, 8, 50, 0, 7); wings(49, 7, 18, 0, 5); props(0, 5, 12); break;
      case 'glider': body(12, 58, 3); wings(22, 5, 62, 0, 3, 1.5); wings(54, 4, 16, 0, 3, 1.5); break;
      case 'heli': g.beginPath(); g.ellipse(X, 24, 6.5, 10, 0, 0, Math.PI * 2); g.fill(); g.fillRect(X - 1.3, 32, 2.6, 25); g.fillRect(X - 5, 54, 10, 2.6);
        blade(X, 24, 56, 3.5, Math.PI / 4); blade(X, 24, 56, 3.5, -Math.PI / 4); break;
      case 'balloon': g.beginPath(); g.arc(X, 25, 17, 0, Math.PI * 2); g.fill(); g.fillRect(X - 4, 48, 8, 7); g.fillRect(X - 3.5, 40, 1.4, 9); g.fillRect(X + 2.1, 40, 1.4, 9); break;
      case 'drone': blade(X, 32, 44, 3.5, Math.PI / 4); blade(X, 32, 44, 3.5, -Math.PI / 4); rr(X - 6, 26, 12, 12, 3);
        for (const [dx, dy] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) { g.beginPath(); g.arc(X + dx, 32 + dy, 6, 0, Math.PI * 2); g.fill(); } break;
      case 'ground': rr(X - 8, 18, 16, 28, 4); break;
      default: body(2, 61, 6); wings(24, 13, 56, 13, 4, 3); wings(51, 8, 22, 6, 3, 3); pods(12, 25, 9, 4); // jet
    }
    return g.getImageData(0, 0, n, n);
  }
  const altLabel = p => p.ground ? 'ground' : p.alt == null ? '' : p.alt >= 18000 ? 'FL' + Math.round(p.alt / 100) : p.alt.toLocaleString('en-US') + ' ft';
  // ---------- smooth motion ----------
  // Each plane is dead-reckoned from its last report (ground speed, track and climb rate; at most a minute ahead) and
  // drawn every animation frame. When a new report disagrees with where the icon is drawn, the difference is eased out
  // over two seconds instead of jumping, and the heading turns instead of snapping.
  const drawn = new Map(), blend = new Map(), EASE_MS = 2000;
  const wrap180 = d => ((d + 540) % 360) - 180;
  function predict(p, now, base = at) {
    const dt = Math.min(60, Math.max(0, (now - base) / 1000)), R = Math.PI / 180;
    let { lon, lat } = p, alt = p.ground ? 0 : (p.alt ?? 0);
    if (!p.ground && p.gs > 30 && p.track != null) { const d = p.gs * KT * dt, a = p.track * R; lat += d * Math.cos(a) / 110.57; lon += d * Math.sin(a) / (111.32 * Math.cos(lat * R)); }
    if (!p.ground && p.vs) alt = Math.max(0, alt + p.vs * Math.min(dt, 20) / 60);
    return { lon, lat, alt, track: p.track || 0 };
  }
  function posOf(p, now) {
    const q = predict(p, now), b = blend.get(p.hex); if (!b) return q;
    const k = 1 - (now - b.t0) / EASE_MS; if (k <= 0) { blend.delete(p.hex); return q; }
    const e = k * k * (3 - 2 * k); // smoothstep
    return { lon: q.lon + b.dlon * e, lat: q.lat + b.dlat * e, alt: Math.max(0, q.alt + b.dalt * e), track: (q.track + b.dtrk * e + 360) % 360 };
  }
  // a new snapshot arrives: keep each plane where it is drawn and ease toward the new prediction
  function rebase(next, nextAt) {
    const now = Date.now(), keep = new Set();
    for (const p of next) {
      keep.add(p.hex); const old = drawn.get(p.hex); if (!old) continue;
      const q = predict(p, now, nextAt), dlon = old.lon - q.lon, dlat = old.lat - q.lat;
      if (Math.hypot(dlon * Math.cos(q.lat * Math.PI / 180), dlat) > .05) continue; // more than ~5 km off: just move it
      blend.set(p.hex, { dlon, dlat, dalt: old.alt - q.alt, dtrk: wrap180(old.track - q.track), t0: now });
    }
    for (const k of [...drawn.keys()]) if (!keep.has(k)) { drawn.delete(k); blend.delete(k); }
  }
  function fc() {
    const now = Date.now();
    return { type: 'FeatureCollection', features: list.map(p => {
      const q = posOf(p, now); drawn.set(p.hex, q);
      return { type: 'Feature', properties: { hex: p.hex, shape: SHAPES.includes(p.shape) ? p.shape : 'jet', sz: SIZE[p.shape] || 1, track: q.track, alt: p.ground ? 0 : Math.round(q.alt), t: [p.flight || p.reg || '', altLabel(p)].filter(Boolean).join('\n') }, geometry: { type: 'Point', coordinates: [q.lon, q.lat] } };
    }) };
  }
  const below = () => ['filings', 'fs-field'].find(id => map.getLayer(id));
  function addLayers() {
    if (!map.getStyle()) return;
    for (const k of SHAPES) if (!map.hasImage('plane-' + k)) map.addImage('plane-' + k, shapeImage(k), { sdf: true, pixelRatio: 2 });
    if (!map.getSource('live-planes')) map.addSource('live-planes', { type: 'geojson', data: fc(), attribution: 'Aircraft: adsb.lol (ODbL) · airplanes.live' });
    if (!map.getLayer('live-planes')) map.addLayer({ id: 'live-planes', type: 'symbol', source: 'live-planes', layout: {
      'icon-image': ['concat', 'plane-', ['get', 'shape']], 'icon-rotate': ['get', 'track'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, ['*', .5, ['get', 'sz']], 9, ['*', .78, ['get', 'sz']], 13, ['*', 1.05, ['get', 'sz']]],
      'text-field': ['step', ['zoom'], '', 9, ['get', 't']], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': ['case', ['>=', ['get', 'sz'], 1.2], ['literal', [0, 2.6]], ['literal', [0, 1.9]]], 'text-optional': true, 'text-allow-overlap': false },
      paint: { 'icon-color': ['step', ['get', 'alt'], BANDS[0][1], ...BANDS.flatMap(([a, c], i) => i ? [BANDS[i - 1][0], c] : [])],
        'icon-halo-color': ctx.isDark() ? '#0b0d0c' : '#ffffff', 'icon-halo-width': 1.4,
        'text-color': ctx.isDark() ? '#dde1e2' : '#23282a', 'text-halo-color': ctx.isDark() ? '#16191a' : '#ffffff', 'text-halo-width': 1.5 } });
    if (pathOn) { addPathLayers(); syncPath(); } // after a basemap change
  }
  // ---------- the selected plane's route: flown leg solid, remaining leg dashed, both airports ----------
  // great-circle path between two [lon, lat] points (the curve airliners actually fly)
  function arc(a, b, n = 64) {
    const R = Math.PI / 180, [l1, p1, l2, p2] = [a[0] * R, a[1] * R, b[0] * R, b[1] * R];
    const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
    if (!(d > 1e-6)) return [a, b];
    const out = []; let prev = null;
    for (let i = 0; i <= n; i++) {
      const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2);
      let lon = Math.atan2(y, x) / R; const lat = Math.atan2(z, Math.hypot(x, y)) / R;
      if (prev != null) while (lon - prev > 180) lon -= 360; while (prev != null && lon - prev < -180) lon += 360; // stay continuous across the date line
      out.push([lon, lat]); prev = lon;
    }
    return out;
  }
  let routeOn = null; // { hex, o: { code, lon, lat }, d: { … } }
  const EMPTY = { type: 'FeatureCollection', features: [] };
  function routeFC() {
    if (!routeOn) return EMPTY;
    const me = fc().features.find(f => f.properties.hex === routeOn.hex), o = [routeOn.o.lon, routeOn.o.lat], d = [routeOn.d.lon, routeOn.d.lat];
    const pos = me ? me.geometry.coordinates : null, feats = [];
    if (pos && pathOn?.hex === routeOn.hex) feats.push({ type: 'Feature', properties: { k: 'left' }, geometry: { type: 'LineString', coordinates: arc(pos, d) } });
    else if (pos) { feats.push({ type: 'Feature', properties: { k: 'flown' }, geometry: { type: 'LineString', coordinates: arc(o, pos) } }, { type: 'Feature', properties: { k: 'left' }, geometry: { type: 'LineString', coordinates: arc(pos, d) } }); }
    else feats.push({ type: 'Feature', properties: { k: 'left' }, geometry: { type: 'LineString', coordinates: arc(o, d) } });
    for (const a of [routeOn.o, routeOn.d]) feats.push({ type: 'Feature', properties: { k: 'ap', code: a.code || '' }, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } });
    return { type: 'FeatureCollection', features: feats };
  }
  function addRouteLayers() {
    if (!map.getStyle()) return;
    const c = ctx.isDark() ? '#6a8fe0' : '#2a78d6', before = map.getLayer('live-planes') ? 'live-planes' : undefined;
    if (!map.getSource('plane-route')) map.addSource('plane-route', { type: 'geojson', data: routeFC() });
    if (!map.getLayer('plane-route-flown')) map.addLayer({ id: 'plane-route-flown', type: 'line', source: 'plane-route', filter: ['==', ['get', 'k'], 'flown'], layout: { 'line-cap': 'round' }, paint: { 'line-color': c, 'line-width': 2.5, 'line-opacity': .9 } }, before);
    if (!map.getLayer('plane-route-left')) map.addLayer({ id: 'plane-route-left', type: 'line', source: 'plane-route', filter: ['==', ['get', 'k'], 'left'], paint: { 'line-color': c, 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': .85 } }, before);
    if (!map.getLayer('plane-route-ap')) map.addLayer({ id: 'plane-route-ap', type: 'circle', source: 'plane-route', filter: ['==', ['get', 'k'], 'ap'], paint: { 'circle-radius': 5, 'circle-color': ctx.isDark() ? '#16191a' : '#ffffff', 'circle-stroke-color': c, 'circle-stroke-width': 2.5 } }, before);
    if (!map.getLayer('plane-route-label')) map.addLayer({ id: 'plane-route-label', type: 'symbol', source: 'plane-route', filter: ['==', ['get', 'k'], 'ap'], layout: { 'text-field': ['get', 'code'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-allow-overlap': true },
      paint: { 'text-color': ctx.isDark() ? '#dde1e2' : '#23282a', 'text-halo-color': ctx.isDark() ? '#16191a' : '#ffffff', 'text-halo-width': 1.6 } });
  }
  const syncRoute = () => map.getSource('plane-route')?.setData(routeFC());
  function clearRoute() { routeOn = null; syncRoute(); }
  function showRoute(hex, r) {
    const ok = a => a && Number.isFinite(a.lat) && Number.isFinite(a.lon);
    if (!ok(r?.origin) || !ok(r?.destination)) { clearRoute(); return false; }
    routeOn = { hex, o: r.origin, d: r.destination }; addRouteLayers(); syncRoute();
    // frame the whole trip unless the camera is following the plane
    if (follow !== hex) { const pts = routeFC().features.flatMap(f => f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates);
      const cam = frameFor(pts, { top: 80, bottom: 80, left: 80, right: (ctx.card?.offsetWidth || 380) + 60 }, 9); if (cam) map.easeTo({ ...cam, duration: ctx.reduceMotion ? 0 : 1200 }); }
    return true;
  }
  // a camera for [lon, lat] points that may cross the date line or span half the globe (IAH → Taipei): centred on their
  // mean direction on the sphere, with longitudes unwrapped around it. The plain bounding box of such a route is the
  // whole world, whose middle (0°, 0°) put the globe's far side in view.
  function frameFor(pts, padding, maxZoom = 13) {
    if (!pts.length) return null;
    const R = Math.PI / 180; let x = 0, y = 0, z = 0;
    for (const [lo, la] of pts) { x += Math.cos(la * R) * Math.cos(lo * R); y += Math.cos(la * R) * Math.sin(lo * R); z += Math.sin(la * R); }
    const clon = Math.atan2(y, x) / R, clat = Math.atan2(z, Math.hypot(x, y)) / R;
    const xs = pts.map(([lo]) => lo + Math.round((clon - lo) / 360) * 360), ys = pts.map(p => Math.max(-84, Math.min(84, p[1])));
    const w = Math.min(...xs), e = Math.max(...xs), cam = map.cameraForBounds([[w, Math.min(...ys)], [e, Math.max(...ys)]], { padding, maxZoom });
    const span = e - w; // the box's own centre is right for regional routes; the sphere's for long ones
    const c = span < 60 && cam?.center ? cam.center : [((clon + 540) % 360) - 180, clat];
    return { center: c, zoom: Math.max(1, cam?.zoom ?? 2) };
  }
  // legend (bottom left): the altitude colours of the plane icons, and the path's gradient when one is drawn
  function syncLegend() {
    if (!ctx.setLegend) return;
    if (!on() && !pathOn) { ctx.setLegend('planes', null); return; }
    const sw = BANDS.map(([, c], i) => '<div class="li"><i style="background:' + c + '"></i>' + ['On the ground', 'Below 3,000 ft', '3,000–10,000 ft', '10,000–25,000 ft', 'Above 25,000 ft'][i] + '</div>').join('');
    ctx.setLegend('planes', pathOn
      ? '<div class="t">Flight path altitude</div><div class="lg-grad" style="background:' + altGradient(35000) + '"></div><div class="lg-ticks lg-abs"><span style="left:0">Ground</span><span style="left:28.6%">10k</span><span style="left:57.1%">20k</span><span style="left:100%">35k ft</span></div>' +
        (is3d() ? '<div class="lg-note">Line and ball at the plane’s altitude; the curtain drops to the ground.</div>' : '<div class="lg-note">Tilt the map to see it in 3D.</div>')
      : '<div class="t">Aircraft altitude</div>' + sw);
  }
  // ---------- this flight's path (adsb.lol trace + live positions since) ----------
  // Smoothed (lib/flightpath.mjs) and drawn twice: a line on the ground coloured by altitude (the path in 2D, its
  // shadow in 3D), and with the map tilted, the real 3D path with a curtain and a ball at the plane (src/flightpath3d.js).
  let pathOn = null; // { hex, pts: [[lon, lat, alt_ft, unix]], smooth: [[lon, lat, alt_ft]], n }
  const is3d = () => map.getPitch() >= 15, path3d = flightPath3D();
  const pathPts = () => { if (!pathOn) return []; const me = drawn.get(pathOn.hex); return me ? pathOn.smooth.concat([[me.lon, me.lat, me.alt]]) : pathOn.smooth; };
  function pathFC() {
    const pts = pathPts(), feats = [];
    for (let i = 1; i < pts.length; i++) feats.push({ type: 'Feature', properties: { alt: (pts[i - 1][2] + pts[i][2]) / 2 }, geometry: { type: 'LineString', coordinates: [pts[i - 1].slice(0, 2), pts[i].slice(0, 2)] } });
    return { type: 'FeatureCollection', features: feats };
  }
  function addPathLayers() {
    if (!map.getStyle()) return;
    const before = map.getLayer('plane-route-flown') ? 'plane-route-flown' : map.getLayer('live-planes') ? 'live-planes' : undefined;
    if (!map.getSource('plane-path')) map.addSource('plane-path', { type: 'geojson', data: pathFC() });
    if (!map.getLayer('plane-path-line')) map.addLayer({ id: 'plane-path-line', type: 'line', source: 'plane-path', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': altColorExpr, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 12, 4], 'line-opacity': .9 } }, before);
    if (!map.getLayer(path3d.layer.id)) map.addLayer(path3d.layer); // on top: the path and ball are in the air
  }
  function syncPath() {
    if (!pathOn) { map.getSource('plane-path')?.setData(EMPTY); path3d.show(false); syncLegend(); return; }
    if (pathOn.n !== pathOn.pts.length) { pathOn.smooth = smoothPath(pathOn.pts); pathOn.n = pathOn.pts.length; path3d.setPath(pathOn.smooth); }
    map.getSource('plane-path')?.setData(pathFC());
    sync3d(); syncLegend();
  }
  // the 3D layer only in the tilted view; there the line on the ground reads as the path's shadow
  function sync3d() {
    const three = !!pathOn && is3d(); path3d.show(three);
    map.getLayer('plane-path-line') && map.setPaintProperty('plane-path-line', 'line-opacity', three ? .35 : .9);
  }
  function showPath(hex, t) { pathOn = { hex, pts: t.points.map(p => p.slice()), smooth: [], n: -1 }; addPathLayers(); syncPath(); syncRoute(); }
  function clearPath() { pathOn = null; syncPath(); }
  map.on('pitch', () => { if (pathOn && is3d() !== path3d.shown) { sync3d(); syncLegend(); } });
  // tilt the camera along the path and fit it, so the climb and descent show
  function view3d(hex) {
    if (!pathOn || pathOn.hex !== hex) { const t = trackDone.get(hex); if (t?.points?.length > 1) showPath(hex, t); else return false; }
    const pts = pathPts(); if (pts.length < 2) return false; const a = pts[0], b = pts[pts.length - 1];
    const bearing = (Math.atan2((b[0] - a[0]) * Math.cos(b[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI + 90 + 360) % 360; // look across the track
    follow = null; orbiting = false;
    const cam = frameFor(pts.map(p => p.slice(0, 2)), { top: 60, bottom: 60, left: 60, right: (ctx.card?.offsetWidth || 380) + 60 });
    map.easeTo({ ...(cam || {}), zoom: (cam?.zoom ?? map.getZoom()) - .3, pitch: 62, bearing, duration: ctx.reduceMotion ? 0 : 1600 });
    return true;
  }
  function removeLayers() { [path3d.layer.id, 'plane-path-line'].forEach(id => map.getLayer(id) && map.removeLayer(id)); ['plane-path'].forEach(id => map.getSource(id) && map.removeSource(id));
    ['plane-route-label', 'plane-route-ap', 'plane-route-left', 'plane-route-flown', 'live-planes'].forEach(id => map.getLayer(id) && map.removeLayer(id)); ['plane-route', 'live-planes'].forEach(id => map.getSource(id) && map.removeSource(id)); }

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
      const next = (d.aircraft || []).filter(p => p.seen == null || p.seen < 60), nextAt = Math.min(Date.now(), Date.parse(d.time) || Date.now());
      rebase(next, nextAt); list = next; at = nextAt; src = d.source; err = '';
      if (pathOn) { const p = list.find(x => x.hex === pathOn.hex), last = pathOn.pts[pathOn.pts.length - 1];
        if (p && (!last || last[0] !== p.lon || last[1] !== p.lat)) pathOn.pts.push([p.lon, p.lat, p.ground ? 0 : p.alt ?? last?.[2] ?? 0, Math.round(at / 1000)]); }
      map.getSource('live-planes')?.setData(fc()); if (pathOn) syncPath(); if (shown) renderCard(shown, true); if (follow) followCam();
    } catch (e) { if (e.name !== 'AbortError') { err = e.message; } }
    ctx.live.syncUI();
  }
  // animation: planes redrawn every frame (about 30 a second when following, a path is open or the view is close in,
  // about 12 otherwise), the route and the 2D path line once a second
  let raf = 0, lastFrame = 0, lastSlow = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!list.length || document.visibilityState === 'hidden' || !map.getSource('live-planes')) return;
    const fast = follow || pathOn || (map.getZoom() >= 10 && list.length < 400);
    if (ts - lastFrame < (fast ? 30 : 80)) return;
    const dtCam = Math.min(.25, (ts - lastFrame) / 1000); lastFrame = ts;
    map.getSource('live-planes').setData(fc());
    if (follow) followCam(dtCam);
    if (pathOn) { const me = drawn.get(pathOn.hex); path3d.setBall(me ? [me.lon, me.lat, me.alt] : null); }
    if (ts - lastSlow > 1000) { lastSlow = ts; if (routeOn) syncRoute(); if (pathOn) syncPath(); }
  }
  function start() { addLayers(); load(); clearInterval(timer); timer = setInterval(load, REFRESH); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); syncLegend(); }
  function stop() { clearInterval(timer); cancelAnimationFrame(raf); ctl?.abort(); list = []; drawn.clear(); blend.clear(); follow = null; routeOn = null; pathOn = null; removeLayers(); syncLegend(); }
  map.on('moveend', () => { if (!on()) return; clearTimeout(moveT); moveT = setTimeout(load, 600); });
  document.addEventListener('visibilitychange', () => { if (on() && document.visibilityState === 'visible') load(); });

  // ---------- plane card ----------
  const find = hex => list.find(p => p.hex === hex);
  // follow: keep the plane centred; orbit: also circle the camera around it (tilted), turning ~6° a second
  let orbiting = false;
  // keep the followed plane above the open card on wide screens (the card sits over the lower middle of the map)
  const camOffset = () => card.classList.contains('open') && innerWidth > 760 ? [0, -Math.min(140, card.offsetHeight / 3)] : [0, 0];
  // every frame: put the plane where it should be on screen (just above the card on wide screens), turning ~6° a second
  // when orbiting; a zoom in progress is left alone so wheel and pinch zooming still work while following
  function followCam(dt = 0) {
    const q = drawn.get(follow); if (!q || !find(follow)) { follow = null; orbiting = false; return; }
    if (map.isZooming?.() || map.isEasing?.()) return;
    const want = camOffset(), c = map.getCenter(), cp = map.project(c), pp = map.project([q.lon, q.lat]);
    const center = map.unproject([cp.x + (pp.x - (cp.x + want[0])), cp.y + (pp.y - (cp.y + want[1]))]);
    map.jumpTo({ center, ...(orbiting ? { bearing: map.getBearing() + 6 * dt, pitch: Math.max(map.getPitch(), 55) } : {}) });
  }
  // a hand on the map (drag, rotate, zoom gesture) ends follow / orbit, like the place orbit
  ['dragstart', 'rotatestart', 'pitchstart'].forEach(ev => map.on(ev, e => { if (e.originalEvent && follow) { follow = null; orbiting = false; if (shown) renderCard(shown, true); } }));
  ctx.onOrbitStop?.(() => { orbiting = false; });
  const routes = new Map();
  async function routeFor(p) {
    if (!p.flight) return null; if (routes.has(p.flight)) return routes.get(p.flight);
    const job = fetch('api/planes?route=' + encodeURIComponent(p.flight) + '&lat=' + p.lat + '&lon=' + p.lon + (p.track != null && !p.ground ? '&track=' + p.track : '')).then(r => r.ok ? r.json() : null).catch(() => null);
    routes.set(p.flight, job); return job;
  }
  // a route fits the trace when a flight that took off on this trace left from (near) the route's origin
  const MI = (a, b) => { const R = Math.PI / 180, h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(h)); };
  const routeFits = (r, t) => !(t?.leg?.started_on_ground && Number.isFinite(r.origin?.lat) && MI(t.leg.from, [r.origin.lon, r.origin.lat]) > 40);
  const ap = a => a ? esc((a.code ? a.code + ' ' : '') + (a.city || a.name || '')) : '?';
  // FAA registration by hex or N-number: one request per batch of new ids, kept for the session (the FAA updates daily)
  const regs = new Map(), regDone = new Map();
  function regFor(ids) {
    const want = [...new Set(ids.filter(id => id && !regs.has(id)))];
    for (let i = 0; i < want.length; i += 25) {
      const part = want.slice(i, i + 25), job = fetch('api/planes?reg=' + part.map(encodeURIComponent).join(',')).then(r => r.ok ? r.json() : null).catch(() => null);
      part.forEach(id => regs.set(id, job.then(d => {
        if (!d) { regs.delete(id); return null; } // try again next time
        const r = { registry: d.registry, note: d.note, ...(d.aircraft?.[id] || { found: false }) }; regDone.set(id, r); return r;
      })));
    }
    return Promise.all(ids.map(id => id ? regs.get(id) : null));
  }
  // by the broadcast hex; if that isn't in the registry, by the registration the feed reports (N-numbers only)
  async function regOf(p) {
    let [r] = await regFor([p.hex]);
    if (r && !r.found && /^N[1-9]/i.test(p.reg || '')) { const [x] = await regFor([p.reg]); if (x) r = x.found ? x : { ...r, faa_url: x.faa_url }; }
    if (r) regDone.set(p.hex, r); return r;
  }
  // ---------- adsb.lol extras: photo and details (once per plane per visit), this flight's path ----------
  const infos = new Map(), infoDone = new Map(), tracks = new Map(), trackDone = new Map();
  function infoFor(p) {
    if (!infos.has(p.hex)) infos.set(p.hex, fetch('api/planes?aircraft=' + p.hex + (p.reg ? '&r=' + encodeURIComponent(p.reg) : '')).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (d) infoDone.set(p.hex, d); else infos.delete(p.hex); return d; }));
    return infos.get(p.hex);
  }
  function trackFor(hex) {
    if (!tracks.has(hex)) tracks.set(hex, fetch('api/planes?track=' + hex).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (d) trackDone.set(hex, d); else tracks.delete(hex); return d; }));
    return tracks.get(hex);
  }
  const hhmm = t => t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const when = t => { if (!t) return ''; const d = new Date(t), today = new Date().toDateString() === d.toDateString(); return today ? hhmm(t) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + hhmm(t); };
  const dur = sec => { const m = Math.max(1, Math.round(sec / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  function photoHtml(info) {
    const ph = info?.photo; if (!ph?.src) return '';
    return '<a class="pl-photo" href="' + esc(ph.link || ph.src) + '" target="_blank" rel="noopener"><img src="' + esc(ph.src) + '" alt="Photo of this aircraft" loading="lazy" referrerpolicy="no-referrer"></a>' +
      '<div class="pl-credit">Photo' + (ph.credit ? ' © ' + esc(ph.credit) : '') + ' · ' + esc(ph.source) + '</div>';
  }
  function flightHtml(t) {
    const l = t?.leg; if (!l) return '';
    const earlier = (t.today || []).length - 1;
    const rows = [[l.started_on_ground ? 'Departed' : 'First seen', when(l.start)], ['Flying for', dur((Date.parse(l.end) - Date.parse(l.start)) / 1000)],
      ['Highest', l.max_alt_ft ? l.max_alt_ft.toLocaleString('en-US') + ' ft' : ''], ['Earlier today', earlier > 0 ? earlier + ' other flight' + (earlier > 1 ? 's' : '') : '']].filter(x => x[1]);
    return '<div class="bsec" id="plPath"><div class="lt">This flight</div><dl>' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
      '<div class="rnote">Flight path from adsb.lol, coloured by altitude. <button class="lnk" type="button" id="pl3d">View the path in 3D</button></div></div>';
  }
  const fmtDay = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  function regHtml(p, r) {
    const link = u => u ? ' <a class="lnk" target="_blank" rel="noopener" href="' + esc(u) + '">FAA record ↗</a>' : '';
    const faa = r?.faa_url || (/^N[1-9]/i.test(p.reg || '') ? 'https://registry.faa.gov/AircraftInquiry/Search/NNumberResult?nNumberTxt=' + encodeURIComponent(p.reg.replace(/^N/i, '')) : '');
    let body;
    if (!r) body = '<div class="rnote">Looking up the FAA registration…</div>';
    else if (r.failed) body = '<div class="rnote">The registration lookup didn’t answer.' + link(faa) + '</div>';
    else if (r.found) {
      const rows = [['Registered to', (r.owner || 'Withheld at the owner’s request') + (r.owner_type ? ' (' + r.owner_type + ')' : '')], ['Co-owners', (r.other_owners || []).join('; ')],
        ['Owner location', [r.city, r.state, r.country && r.country !== 'US' ? r.country : ''].filter(Boolean).join(', ')], ['Tail number', r.n_number],
        ['Aircraft', r.aircraft], ['Certificate', r.airworthiness && r.airworthiness !== 'Standard' ? r.airworthiness : ''], ['Max weight', r.weight_class && r.weight_class !== 'Up to 12,499 lb' ? r.weight_class : ''], ['Registered', [fmtDay(r.registered), r.expires ? 'expires ' + fmtDay(r.expires) : ''].filter(Boolean).join(' · ')],
        ['Status', r.status && !r.valid ? r.status : ''], ['Note', r.fractional ? 'Fractional ownership' : '']].filter(x => x[1]);
      body = '<dl>' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
        '<div class="rnote">FAA aircraft registry (updated nightly). The registered owner can be a trust, lessor or management company rather than the operator.' + link(r.faa_url) + '</div>';
    } else if (r.us === false) body = '<div class="rnote">Not a US (N-number) aircraft, so the FAA registry has no record of it.</div>';
    else if (r.registry === false) body = '<div class="rnote">Owner lookup isn’t set up yet.' + (faa ? ' Look it up on the FAA site:' + link(faa) : '') + '</div>';
    else body = '<div class="rnote">Not in the FAA registry' + (p.reg ? '' : ' (no registration broadcast)') + '.' + link(faa) + '</div>';
    return '<div class="bsec" id="plReg"><div class="lt">Registration</div>' + body + '</div>';
  }
  async function renderCard(hex, refresh) {
    const p = find(hex); if (!p) { if (!refresh) toast('That aircraft is no longer in view.'); return; }
    if (!refresh) { const keep = follow === hex ? hex : null, orb = keep && orbiting; ctx.closeCard?.(); follow = keep; orbiting = !!orb; if (routeOn?.hex !== hex) clearRoute(); }
    shown = hex;
    const info = infoDone.get(hex), tr = trackDone.get(hex);
    const vs = p.vs > 150 ? 'Climbing ' + Math.abs(p.vs).toLocaleString('en-US') + ' ft/min' : p.vs < -150 ? 'Descending ' + Math.abs(p.vs).toLocaleString('en-US') + ' ft/min' : p.ground ? '' : 'Level';
    const rows = [['Type', [p.desc || (info?.manufacturer && info?.model ? info.manufacturer + ' ' + info.model : ''), p.type].filter(Boolean).join(' · ') || '—'],
      ...[['Operator', tr?.operator || info?.owner || ''], ['Built', tr?.year || ''], ['Military', p.mil || tr?.military ? 'Yes' : '']].filter(x => x[1]),
      ['Registration', p.reg || tr?.registration || '—'], ['Squawk', p.squawk || '—'], ['ICAO hex', p.hex]];
    card.innerHTML = '<div class="top"><div><div class="kicker">Aircraft · live</div><h2>' + esc(p.flight || p.reg || p.hex.toUpperCase()) + '</h2><div class="bsub" id="plRoute">' + (p.flight ? 'Looking up the route…' : 'No callsign') + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' +
      photoHtml(info) + '<div class="bsec pl-sec"><div class="lt">Flight</div><div class="kgrid"><div><b>' + esc(p.ground ? 'Ground' : altLabel(p)) + '</b><span>Altitude' + (vs ? ' · ' + esc(vs) : '') + '</span></div>' +
        '<div><b>' + (p.gs != null ? p.gs + ' kt' : '—') + '</b><span>Speed' + (p.gs != null ? ' · ' + Math.round(p.gs * 1.15078) + ' mph' : '') + '</span></div><div><b>' + (p.track != null ? p.track + '°' : '—') + '</b><span>Heading</span></div><div><b id="plDist">—</b><span>Route</span></div></div></div>' +
      '<div class="bsec" id="plAc"><div class="lt">Aircraft</div><dl>' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl></div>' +
      flightHtml(tr) + regHtml(p, regDone.get(hex)) +
      '<div class="bsec" id="plTools"><div class="lt">Tools</div><div class="bacts"><button class="btn' + (follow === hex && !orbiting ? ' on' : '') + '" id="plFollow">' + (follow === hex && !orbiting ? 'Following' : 'Follow') + '</button>' +
      '<button class="btn' + (follow === hex && orbiting ? ' on' : '') + '" id="plOrbit">' + (follow === hex && orbiting ? 'Orbiting' : 'Orbit') + '</button>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://globe.adsb.lol/?icao=' + encodeURIComponent(p.hex) + '">adsb.lol ↗</a>' +
      (tr?.points?.length > 1 ? '<button class="btn" type="button" id="pl3dBtn">3D flight path</button>' : '') + '</div>' +
      '<div class="ssrc src">Live ADS-B from ' + esc(src || 'adsb.lol') + ' (community receivers, ODbL). Positions refresh every 10 s; some military and private aircraft aren’t shown. Routes: adsbdb and adsb.lol. Flight path: adsb.lol traces.</div></div>';
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelector('#plFollow').onclick = () => { const was = follow === hex && !orbiting; follow = was ? null : hex; orbiting = false; renderCard(hex, true); if (follow) followCam(); };
    card.querySelector('#plOrbit').onclick = () => { const was = follow === hex && orbiting; follow = was ? null : hex; orbiting = !was; renderCard(hex, true);
      if (orbiting) map.easeTo({ zoom: Math.max(map.getZoom(), 11), pitch: 60, duration: ctx.reduceMotion ? 0 : 800 }); };
    card.querySelector('#pl3d')?.addEventListener('click', () => view3d(hex));
    card.querySelector('#pl3dBtn')?.addEventListener('click', () => view3d(hex));
    if (!refresh || !card.classList.contains('open')) card.classList.add('open');
    // photo / details and the flight path: fetched once when the card opens, then the card re-renders with them
    if (!refresh) {
      if (!infoDone.has(hex)) infoFor(p).then(d => { if (d && shown === hex) renderCard(hex, true); });
      trackFor(hex).then(async t => { if (!t || shown !== hex) return; if (t.points?.length > 1) showPath(hex, t);
        // the flight path can show a database route is stale: it took off far from the listed origin
        const r = await routeFor(p); if (r?.origin && !routeFits(r, t)) { r.mismatch = true; if (routeOn?.hex === hex) clearRoute(); }
        if (shown === hex) renderCard(hex, true); });
    }
    if (!regDone.has(hex)) regOf(p).then(r => { const sec = card.querySelector('#plReg'); if (sec && shown === hex) sec.outerHTML = regHtml(p, r || { failed: true }); });
    const r = await routeFor(p), el = card.querySelector('#plRoute');
    const known = r?.origin && r?.destination && !r.mismatch;
    if (el && shown === hex) el.textContent = known ? ap(r.origin).replace(/&amp;/g, '&') + ' → ' + ap(r.destination).replace(/&amp;/g, '&') : p.flight ? 'Route not in the database (flight path below)' : 'No callsign';
    const rd = card.querySelector('#plDist'); if (rd && shown === hex) rd.textContent = known ? (r.origin.code || '?') + ' → ' + (r.destination.code || '?') : '—';
    // draw the route the first time the card opens for this plane (not on every 10-second refresh)
    if (shown === hex && !refresh && r && !r.mismatch) showRoute(hex, r);
  }
  ctx.onCardClose?.(() => { shown = null; follow = null; orbiting = false; clearRoute(); clearPath(); });
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
    add: () => { addLayers(); map.getSource('live-planes')?.setData(fc()); if (routeOn) { addRouteLayers(); syncRoute(); } },
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
    set: async v => { if (!v) { removePaths(); ctx.setLegend?.('lowflights', null); return; } addPaths(); await loadPaths(); if (paths && paths.history === false) { removePaths(); return paths.note || 'flight history isn’t available yet'; }
      ctx.setLegend?.('lowflights', '<div class="t">Low flights a day</div><div class="lg-grad" style="background:linear-gradient(90deg,#fde8c8,#f6b26b,#e3622b,#c03b3a,#7a1f1f)"></div><div class="lg-ticks"><span>0.2</span><span>2</span><span>8</span><span>25</span><span>80+</span></div><div class="lg-note">Aircraft below 3,000 ft per ~1 km square</div>'); },
    add: addPaths,
    note: () => paths?.history ? 'Aircraft below 3,000 ft: sightings a day per ~1 km cell over ' + paths.sampled_days + ' sampled days (one-minute snapshots, an exposure index).' : paths?.note || '',
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
    const u = 'api/planes?bbox=' + [c[0] - dLon, c[1] - dLat, c[0] + dLon, c[1] + dLat].map(v => v.toFixed(3)).join(',');
    // the free feeds sometimes refuse for a moment: one retry after a short pause before giving up
    let r = await fetch(u).catch(() => null), d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { await new Promise(res => setTimeout(res, 1500)); r = await fetch(u); d = await r.json().catch(() => ({})); }
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    const R = Math.PI / 180, mi = p => 3958.8 * 2 * Math.asin(Math.sqrt(Math.sin((p.lat - c[1]) * R / 2) ** 2 + Math.cos(c[1] * R) * Math.cos(p.lat * R) * Math.sin((p.lon - c[0]) * R / 2) ** 2));
    const near = (d.aircraft || []).map(p => ({ ...p, miles: Math.round(mi(p) * 10) / 10 })).filter(p => p.miles <= miles).sort((a, b) => a.miles - b.miles);
    return { source: d.source, time: d.time, aircraft: near };
  };
  ctx.showPlane = hex => renderCard(hex);
  ctx.planeRoute = p => routeFor(p);
  ctx.planeRegistry = ids => regFor(ids);
  ctx.planeTrack = hex => trackFor(String(hex || '').toLowerCase());
  ctx.planeInfo = p => infoFor(p);
  ctx.planePath3d = hex => view3d(hex);
  // the assistant: find a plane by callsign, registration or hex (or the nearest airborne one), open its card and follow
  // or orbit it. Looks up to 250 miles around `near` (default: the map centre), so it needn't be on screen.
  ctx.followPlane = async (id, o = {}) => {
    if (!ctx.live.state().planes) await ctx.live.set({ planes: true });
    const q = String(id || '').trim(), c = o.near || [map.getCenter().lng, map.getCenter().lat];
    let p = q ? pickAircraft(list, q) : null;
    if (!p) { const d = await ctx.planesNear(c, q ? 250 : Math.max(5, o.miles || 25)); p = pickAircraft(d.aircraft, q);
      if (p) { list = list.filter(x => x.hex !== p.hex).concat([p]); if (!at) at = Date.now(); } }
    if (!p) return { error: q ? 'No aircraft “' + id + '” is broadcasting within 250 miles right now.' : 'No aircraft found near there right now.' };
    follow = p.hex; orbiting = !!o.orbit;
    map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), o.orbit ? 11 : 10), pitch: o.orbit ? 60 : map.getPitch(), duration: ctx.reduceMotion ? 0 : 1200 });
    await renderCard(p.hex);
    follow = p.hex; orbiting = !!o.orbit; // renderCard closes the previous card, which clears both
    const r = await routeFor(p);
    return { plane: p, route: r };
  };

  // "Air Traffic" on filing and building cards: low aircraft over the spot (30-day history), only where it exists
  ctx.onCardRender?.(info => {
    const c = info.kind === 'filing' ? (info.f.approx ? null : [info.f.lon, info.f.lat]) : info.center; if (!c) return;
    ctx.airHistory(c, 1).then(h => {
      if (!h?.history || h.low_per_day == null || !card.classList.contains('open')) return;
      card.querySelector('#airSec')?.remove();
      const lvl = h.low_per_day >= 40 ? 'heavy' : h.low_per_day >= 10 ? 'moderate' : h.low_per_day >= 2 ? 'light' : 'very little';
      const sec = document.createElement('div'); sec.className = 'bsec'; sec.id = 'airSec';
      sec.innerHTML = '<div class="lt">Air Traffic</div><div><b>' + esc(lvl[0].toUpperCase() + lvl.slice(1)) + ' low air traffic</b>: about ' + h.low_per_day + ' sightings a day of aircraft below 3,000 ft within ~1 km' +
        (h.lowest_ft != null ? ', lowest ' + h.lowest_ft.toLocaleString('en-US') + ' ft' : '') + '.</div><div class="fs">Last ' + h.days + ' days, ' + h.sampled_days + ' days sampled (an exposure index, not a flight count).' + (h.sampled_days < 3 ? ' The history is still filling in.' : '') + '</div>' +
        '<button class="btn" type="button" id="airNow">Planes Overhead Now</button><div class="ssrc src">Community ADS-B receivers (adsb.lol), sampled every minute.</div>';
      // building card: before Construction; filing card: before From Here
      (card.querySelector('#bFilings') || card.querySelector('#liveSec') || card.querySelector('#fTools') || card.lastElementChild)?.before(sec);
      sec.querySelector('#airNow').onclick = () => { ctx.live.set({ planes: true }); map.easeTo({ center: c, zoom: Math.max(map.getZoom(), 11), duration: ctx.reduceMotion ? 0 : 700 }); };
    });
  });
}
