// Airports (api/airports, every airport in the world from OurAirports; US extras from the FAA):
//   Map layer "Airports": large and medium airports from a state-wide view, small fields and heliports as you zoom in.
//   Airport card: photo, codes, weather now (METAR), runways with a diagram, the full airport layout from OpenStreetMap
//   on the map, the FAA airport diagram, takeoffs and landings per day (counted from our own ADS-B sampling around
//   Houston), the airlines that fly there and statistics (Wikipedia), radio frequencies; Export PDF / CSV.
//   Building and filing cards: the nearest airports, and whether the site is under a runway's approach path.
import { esc, fmt, kgrid, table, bars, reportDoc, savePdf, saveCsv, openCard, cardTop, fillCard } from './reportkit.js';

const TYPE = { large_airport: 'Large airport', medium_airport: 'Medium airport', small_airport: 'Small airport', heliport: 'Heliport', seaplane_base: 'Seaplane base', balloonport: 'Balloonport' };
const COL = { large_airport: '#1d4ed8', medium_airport: '#2563eb', small_airport: '#64748b', heliport: '#a855f7', seaplane_base: '#0891b2', balloonport: '#94a3b8' };
const SURFACE = s => { const x = String(s || '').toUpperCase(); return /^(ASP|BIT)/.test(x) ? 'Asphalt' : /^(CON|PEM)/.test(x) ? 'Concrete' : /TURF|GRASS|GRS/.test(x) ? 'Grass' : /GRAV|GRVL|GVL/.test(x) ? 'Gravel' : /DIRT|SAND|SOIL/.test(x) ? 'Dirt' : /WATER/.test(x) ? 'Water' : s || '—'; };

// the runways as a small diagram (true north up), with each end's number
export function runwaySvg(runways, { W = 320, H = 220, dark = false } = {}) {
  const rw = (runways || []).filter(r => r.le_lat != null && r.he_lat != null && !r.closed); if (!rw.length) return '';
  const pts = rw.flatMap(r => [[r.le_lon, r.le_lat], [r.he_lon, r.he_lat]]);
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x * k); x1 = Math.max(x1, x * k); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = 26, s = Math.min((W - 2 * pad) / ((x1 - x0) || 1e-4), (H - 2 * pad) / ((y1 - y0) || 1e-4)), ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
  const pr = ([x, y]) => [ox + (x * k - x0) * s, oy + (y1 - y) * s];
  const ink = dark ? '#e5e7eb' : '#23282a';
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Runway diagram"><rect width="' + W + '" height="' + H + '" rx="6" fill="' + (dark ? '#111827' : '#f3f5f5') + '"/>' +
    rw.map(r => { const a = pr([r.le_lon, r.le_lat]), b = pr([r.he_lon, r.he_lat]), w = Math.max(3, Math.min(9, (r.width_ft || 100) / 25));
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="' + ink + '" stroke-width="' + w + '" stroke-linecap="butt"/>' +
        '<text x="' + (a[0] - ux * 13).toFixed(1) + '" y="' + (a[1] - uy * 13 + 4).toFixed(1) + '" font-size="11" font-weight="700" text-anchor="middle" fill="' + ink + '">' + esc(r.le_ident || '') + '</text>' +
        '<text x="' + (b[0] + ux * 13).toFixed(1) + '" y="' + (b[1] + uy * 13 + 4).toFixed(1) + '" font-size="11" font-weight="700" text-anchor="middle" fill="' + ink + '">' + esc(r.he_ident || '') + '</text>'; }).join('') +
    '<text x="' + (W - 14) + '" y="18" font-size="11" text-anchor="middle" fill="' + ink + '">N</text><path d="M' + (W - 14) + ' 22 l-4 10 h8z" fill="' + ink + '"/></svg>';
}

export function initAirports(ctx) {
  const { map } = ctx, box = document.getElementById('lyAirports'), note = document.getElementById('lyAirportsNote');
  let on = false, seq = 0, last = null;
  const SRC = 'airports', OSM = 'airport-osm';

  // ---------- map layer ----------
  const typesFor = z => z < 7 ? 'large' : z < 9 ? 'large,medium' : z < 11 ? 'large,medium,small' : 'large,medium,small,heliport,seaplane';
  let ctl = null, lastKey = '';
  async function load() {
    if (!on) return; const my = ++seq, z = map.getZoom();
    if (z < 4) { setData([]); if (note) note.textContent = 'Zoom in to see airports.'; return; }
    const b = map.getBounds(), r = v => Math.round(v * 10) / 10;
    const bb = [Math.max(-180, r(b.getWest()) - .1), Math.max(-85, r(b.getSouth()) - .1), Math.min(180, r(b.getEast()) + .1), Math.min(85, r(b.getNorth()) + .1)];
    if ((bb[2] - bb[0]) * (bb[3] - bb[1]) > 2500) { if (note) note.textContent = 'Zoom in a little to see airports.'; return; }
    const key = bb.join(',') + '&types=' + typesFor(z); if (key === lastKey && map.getSource(SRC)) return; // same area as what's drawn
    ctl?.abort(); ctl = new AbortController();
    try { const res = await fetch('api/airports?box=' + key, { signal: ctl.signal }), d = await res.json(); if (!res.ok) throw new Error(d.error || 'airports unavailable'); if (my !== seq) return; lastKey = key;
      setData(d.airports || []); if (note) note.textContent = fmt((d.airports || []).length) + ' airports in view. ' + (z < 11 ? 'Zoom in for small fields and heliports. ' : '') + 'Click one for its card.'; }
    catch (e) { if (e.name !== 'AbortError' && note) note.textContent = e.message; }
  }
  // click and hover handlers once (adding them with the layer stacked another set on every toggle and basemap change,
  // so one click opened the card several times)
  map.on('click', SRC, e => { const f = e.features?.[0]; if (f) { ctx.tabs?.arm(e); show(f.properties.ident); } });
  map.on('mouseenter', SRC, e => { map.getCanvas().style.cursor = 'pointer'; const f = e.features?.[0]; if (f && ctx.tip) { ctx.tip.textContent = f.properties.name + ' (' + f.properties.code + ')'; ctx.tip.style.opacity = 1; ctx.tip.style.left = (e.point.x + 14) + 'px'; ctx.tip.style.top = (e.point.y + 14) + 'px'; } });
  map.on('mouseleave', SRC, () => { map.getCanvas().style.cursor = ''; if (ctx.tip) ctx.tip.style.opacity = 0; });
  function setData(list) {
    const fc = { type: 'FeatureCollection', features: list.map(a => ({ type: 'Feature', properties: { ident: a[0], name: a[1], type: a[2], code: a[5], big: a[2] === 'large_airport' ? 2 : a[2] === 'medium_airport' ? 1 : 0 }, geometry: { type: 'Point', coordinates: [a[3], a[4]] } })) };
    try {
      const s = map.getSource(SRC); if (s) { s.setData(fc); return; }
      map.addSource(SRC, { type: 'geojson', data: fc });
      map.addLayer({ id: SRC, type: 'circle', source: SRC, paint: { 'circle-radius': ['match', ['get', 'big'], 2, 8, 1, 6, 4], 'circle-color': ['match', ['get', 'type'], ...Object.entries(COL).flat(), '#64748b'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.6 } });
      map.addLayer({ id: SRC + '-lbl', type: 'symbol', source: SRC, minzoom: 6, layout: { 'text-field': ['get', 'code'], 'text-size': ['match', ['get', 'big'], 2, 13, 1, 12, 11], 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-allow-overlap': false },
        paint: { 'text-color': '#1e293b', 'text-halo-color': '#fff', 'text-halo-width': 1.6 } });
    } catch (e) { /* style loading */ }
  }
  function setOn(v) {
    on = !!v; if (box) box.checked = on; if (note) note.hidden = !on;
    if (!on) { ctl?.abort(); lastKey = ''; try { for (const id of [SRC + '-lbl', SRC]) if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(SRC)) map.removeSource(SRC); } catch (e) {} ctx.setLegend?.('airports', ''); return; }
    ctx.setLegend?.('airports', '<div class="t">Airports</div>' + ['large_airport', 'medium_airport', 'small_airport', 'heliport'].map(t => '<div class="li"><i style="background:' + COL[t] + '"></i>' + TYPE[t] + '</div>').join(''));
    load();
  }
  if (box) box.onchange = () => setOn(box.checked);
  // reload once the map settles (following or orbiting a plane moves it every frame), not on every move
  let moveT = 0; map.on('moveend', () => { if (on) { clearTimeout(moveT); moveT = setTimeout(load, 350); } });
  ctx.onOverlays?.(() => { if (on && !map.getSource(SRC)) load(); if (last?.osm && !map.getSource(OSM)) drawOsm(last.osm); });
  ctx.airportsLayer = setOn;

  // ---------- the airport's layout (OpenStreetMap) ----------
  function drawOsm(fc) {
    try {
      const s = map.getSource(OSM); if (s) { s.setData(fc || { type: 'FeatureCollection', features: [] }); return; } if (!fc) return;
      map.addSource(OSM, { type: 'geojson', data: fc });
      const isA = k => ['==', ['get', 'kind'], k];
      map.addLayer({ id: OSM + '-area', type: 'fill', source: OSM, filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['!=', ['get', 'kind'], 'aerodrome']],
        paint: { 'fill-color': ['match', ['get', 'kind'], 'terminal', '#f59e0b', 'hangar', '#a78bfa', 'apron', '#94a3b8', 'helipad', '#a855f7', 'runway', '#334155', '#cbd5e1'], 'fill-opacity': ['match', ['get', 'kind'], 'apron', .35, .7] } });
      map.addLayer({ id: OSM + '-bound', type: 'line', source: OSM, filter: isA('aerodrome'), paint: { 'line-color': '#1d4ed8', 'line-width': 1.5, 'line-dasharray': [3, 2] } });
      map.addLayer({ id: OSM + '-twy', type: 'line', source: OSM, filter: ['all', ['==', ['geometry-type'], 'LineString'], isA('taxiway')], paint: { 'line-color': '#eab308', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 5] } });
      map.addLayer({ id: OSM + '-rwy', type: 'line', source: OSM, filter: ['all', ['==', ['geometry-type'], 'LineString'], isA('runway')], paint: { 'line-color': '#1f2937', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 11, 3, 16, 40] } });
      map.addLayer({ id: OSM + '-lbl', type: 'symbol', source: OSM, minzoom: 13, filter: ['any', isA('runway'), isA('taxiway'), isA('terminal'), isA('gate')],
        layout: { 'text-field': ['coalesce', ['get', 'ref'], ['get', 'name']], 'text-size': 11, 'symbol-placement': ['match', ['geometry-type'], 'LineString', 'line', 'point'] }, paint: { 'text-color': '#111827', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } });
    } catch (e) { /* style loading */ }
  }
  function clearOsm() { drawOsm(null); }
  ctx.onCardClose?.(() => { if (last) { last.osm = null; clearOsm(); } });

  // ---------- the airport card ----------
  async function fetchAirport(id) { const r = await fetch('api/airports?id=' + encodeURIComponent(id), { signal: AbortSignal.timeout(30000) }), d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Airport lookup failed (' + r.status + ')'); return d; }
  ctx.airportData = fetchAirport;
  const opsSummary = ops => { const days = (ops || []).filter(o => o.source === 'adsb'), last30 = days.slice(-30);
    if (!last30.length) return null; const tot = last30.map(o => o.departures + o.arrivals);
    return { days: last30.length, avg: Math.round(tot.reduce((s, v) => s + v, 0) / tot.length), max: Math.max(...tot), dep: last30.reduce((s, o) => s + o.departures, 0), arr: last30.reduce((s, o) => s + o.arrivals, 0), list: last30 }; };
  async function show(id, { fly = false } = {}) {
    if (ctx.view !== 'map') ctx.setView?.('map');
    const card = openCard(ctx, { kicker: 'Airport', title: String(id), loading: 'Looking up the airport…' }), tid = 'a:' + id;
    ctx.tabs?.track({ id: tid, kind: 'airport', label: String(id), reopen: () => show(id), leave: () => { if (last) { last.osm = null; clearOsm(); } } });
    const gone = () => ctx.tabs && ctx.tabs.active()?.id !== tid; // closed, or another tab picked while loading
    let d; try { d = await fetchAirport(id); } catch (e) { if (!gone()) card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return { error: e.message }; }
    if (gone()) return d;
    last = { d, osm: null }; const a = d.airport, rw = d.runways || [], w = d.wiki || {}, m = d.metar, ops = opsSummary(d.ops);
    if (fly) map.flyTo({ center: [a.lon, a.lat], zoom: a.type === 'large_airport' ? 12 : 13.5, duration: ctx.reduceMotion ? 0 : 1200 });
    const code = [a.iata, a.icao || a.gps_code, a.local_code && a.local_code !== a.iata ? a.local_code : null].filter(Boolean), open = rw.filter(r => !r.closed), longest = open[0];
    fillCard(ctx, card, cardTop('Airport', a.name, esc([code.join(' · '), TYPE[a.type] || a.type, [a.municipality, a.iso_region?.replace(/^US-/, ''), a.iso_country !== 'US' ? a.iso_country : ''].filter(Boolean).join(', ')].filter(Boolean).join(' · '))) +
      (w.image ? '<div class="apt-photo"><img src="' + esc(w.image.url) + '" alt="' + esc(a.name) + '" loading="lazy" onerror="this.parentNode.remove()"><span>' + esc(w.image.credit || '') + '</span></div>' : '') +
      '<div class="bsec">' + kgrid([[fmt(open.length), 'Runways'], [longest?.length_ft ? fmt(longest.length_ft) + ' ft' : '—', 'Longest runway'], [a.elevation_ft != null ? fmt(a.elevation_ft) + ' ft' : '—', 'Elevation'], [ops ? fmt(ops.avg) : '—', ops ? 'Takeoffs + landings a day' : 'Daily counts']]) +
      (w.summary ? '<p class="apt-sum">' + esc(w.summary.length > 420 ? w.summary.slice(0, 400).replace(/\s\S*$/, '') + '…' : w.summary) + '</p>' : '') + '</div>' +
      '<div class="bacts"><button class="btn" type="button" id="aptMap">Show Airport Map</button>' + (d.extras?.diagram_url ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(d.extras.diagram_url) + '">FAA Airport Diagram</a>' : '') +
        '<button class="btn primary" type="button" id="aptPdf">Export PDF</button><button class="btn" type="button" id="aptCsv">Export CSV</button></div>' +
      (m ? '<div class="bsec"><div class="lt">Weather now</div><div><b>' + esc(m.category || '') + '</b> ' + (m.temp_f != null ? fmt(m.temp_f) + '°F · ' : '') + (m.wind_kt != null ? 'wind ' + (m.wind_dir === 'VRB' ? 'variable' : esc(String(m.wind_dir ?? '')) + '°') + ' ' + m.wind_kt + ' kt' + (m.gust_kt ? ' gusting ' + m.gust_kt : '') + ' · ' : '') + 'visibility ' + esc(String(m.visibility ?? '—')) + ' mi' + (m.clouds ? ' · ' + esc(m.clouds) : '') + '</div><div class="mono apt-raw">' + esc(m.raw || '') + '</div></div>' : '') +
      (open.length ? '<div class="bsec"><div class="lt">Runways</div><div class="apt-rwy">' + runwaySvg(open, { dark: document.documentElement.dataset.theme === 'dark' }) + '</div><dl>' +
        open.map(r => '<dt>' + esc((r.le_ident || '') + (r.he_ident ? '/' + r.he_ident : '')) + '</dt><dd class="mono">' + (r.length_ft ? fmt(r.length_ft) + ' × ' + fmt(r.width_ft) + ' ft' : '—') + ' <span class="sc">' + esc(SURFACE(r.surface)) + (r.lighted ? ', lighted' : '') + (r.le_heading != null ? ', heading ' + Math.round(r.le_heading) + '°' : '') + '</span></dd>').join('') + '</dl></div>' : '') +
      '<div class="bsec"><div class="lt">Takeoffs and landings per day</div>' + (ops ? bars(ops.list.map(o => ({ label: o.day.slice(5), v: o.departures + o.arrivals })), { height: 90, every: Math.ceil(ops.list.length / 6) }) +
        '<div class="rnote">Average ' + fmt(ops.avg) + ' a day over ' + ops.days + ' day' + (ops.days === 1 ? '' : 's') + ' (' + fmt(ops.dep) + ' takeoffs, ' + fmt(ops.arr) + ' landings), busiest ' + fmt(ops.max) + '. Counted from aircraft broadcasting their position (ADS-B) within about 100 nm of Houston, so it undercounts small planes without transponders and misses some at low altitude; official FAA counts are higher at busy airports.</div>' :
        '<div class="rnote">No daily counts here yet. We count takeoffs and landings from live aircraft positions within about 100 nm of Houston; other airports show their runways, airlines and statistics.</div>') + '</div>' +
      (w.airlines?.length ? '<div class="bsec"><div class="lt">Airlines (' + w.airlines.length + ')</div><dl>' + w.airlines.slice(0, 25).map(x => '<dt>' + esc(x.airline) + '</dt><dd class="mono">' + x.destinations + ' destination' + (x.destinations === 1 ? '' : 's') + (x.seasonal ? ' <span class="sc">+' + x.seasonal + ' seasonal</span>' : '') + '</dd>').join('') + '</dl>' +
        (w.cargo?.length ? '<div class="rnote">Cargo: ' + esc(w.cargo.map(x => x.airline).join(', ')) + '</div>' : '') + '</div>' : '') +
      (w.tables?.length ? '<div class="bsec"><div class="lt">Statistics</div>' + w.tables.slice(0, 3).map(t => '<div class="apt-tbl"><b>' + esc(t.caption || '') + '</b><table class="mini"><thead><tr>' + t.headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + t.rows.slice(0, 10).map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>').join('') + '</div>' : '') +
      (d.frequencies?.length ? '<div class="bsec"><details class="raw"><summary>Radio frequencies (' + d.frequencies.length + ')</summary><dl>' + d.frequencies.map(f => '<dt>' + esc(f.description || f.type) + '</dt><dd class="mono">' + esc(String(f.mhz)) + ' MHz <span class="sc">' + esc(f.type || '') + '</span></dd>').join('') + '</dl></details></div>' : '') +
      '<div class="bsec" id="aptLive"><div class="lt">Aircraft here now</div><div class="rnote">Checking…</div></div>' +
      '<div class="rnote bsec">' + (w.url ? '<a target="_blank" rel="noopener" href="' + esc(w.url) + '">Wikipedia article</a>' : '') + (a.home_link ? (w.url ? ' · ' : '') + '<a target="_blank" rel="noopener" href="' + esc(a.home_link) + '">Airport website</a>' : '') +
        '<span class="src"> Sources: OurAirports (runways, codes), FAA (diagram), aviationweather.gov (weather), Wikipedia / Wikidata (photo, airlines, statistics), OpenStreetMap (layout), adsb.lol (aircraft).</span></div>');
    ctx.tabs?.mount(); ctx.tabs?.label(tid, a.iata || a.icao || a.gps_code || a.name);
    card.querySelector('#aptMap').onclick = async ev => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'Loading the layout…';
      try { const r = await fetch('api/airports?osm=' + encodeURIComponent(a.ident)), fc = await r.json(); if (!r.ok) throw new Error(fc.error || 'layout unavailable'); last.osm = fc; drawOsm(fc);
        ctx.setMapOptions?.({ basemap: 'sat' }); const xs = [a.lon], ys = [a.lat]; rw.forEach(r => { if (r.le_lon != null) { xs.push(r.le_lon, r.he_lon); ys.push(r.le_lat, r.he_lat); } });
        map.fitBounds([[Math.min(...xs) - .005, Math.min(...ys) - .005], [Math.max(...xs) + .005, Math.max(...ys) + .005]], { padding: 40, duration: ctx.reduceMotion ? 0 : 900 });
        b.textContent = fc.features.length ? 'Airport Map Shown' : 'No layout mapped here'; }
      catch (e) { b.textContent = 'Show Airport Map'; b.disabled = false; ctx.toast?.(e.message); } };
    card.querySelector('#aptPdf').onclick = () => exportReport(); card.querySelector('#aptCsv').onclick = () => exportCsv();
    // live: planes on the ground or arriving within 4 miles
    ctx.planesNear?.([a.lon, a.lat], 4).then(n => {
      const el = card.querySelector('#aptLive'); if (!el || last?.d !== d) return; const list = n.aircraft || [], ground = list.filter(p => p.ground), low = list.filter(p => !p.ground && p.alt != null && p.alt - (a.elevation_ft || 0) < 3000);
      el.innerHTML = '<div class="lt">Aircraft here now</div><div>' + fmt(ground.length) + ' on the ground · ' + fmt(low.filter(p => (p.vs || 0) < -200).length) + ' descending in · ' + fmt(low.filter(p => (p.vs || 0) > 200).length) + ' climbing out · ' + fmt(list.length) + ' within 4 mi</div>' +
        (list.length ? '<div class="rnote">' + list.slice(0, 8).map(p => esc((p.flight || p.reg || p.hex) + (p.desc ? ' · ' + p.desc : ''))).join('; ') + '</div><button class="btn" type="button" id="aptPlanes">Show Live Planes</button>' : '');
      el.querySelector('#aptPlanes')?.addEventListener('click', () => ctx.live?.set?.({ planes: true }));
    }).catch(() => { const el = card.querySelector('#aptLive'); if (el) el.innerHTML = '<div class="lt">Aircraft here now</div><div class="rnote">Live aircraft feed unavailable right now.</div>'; });
    return d;
  }
  ctx.airportCard = show;

  function exportCsv() {
    if (!last) return; const { d } = last, a = d.airport, rows = [];
    for (const r of d.runways || []) rows.push({ Table: 'Runway', Item: (r.le_ident || '') + '/' + (r.he_ident || ''), 'Length ft': r.length_ft ?? '', 'Width ft': r.width_ft ?? '', Surface: SURFACE(r.surface), Lighted: r.lighted ? 'yes' : 'no', Closed: r.closed ? 'yes' : 'no', Date: '', Takeoffs: '', Landings: '', Destinations: '' });
    for (const o of (d.ops || []).filter(o => o.source === 'adsb')) rows.push({ Table: 'Daily count (ADS-B)', Item: '', 'Length ft': '', 'Width ft': '', Surface: '', Lighted: '', Closed: '', Date: o.day, Takeoffs: o.departures, Landings: o.arrivals, Destinations: '' });
    for (const x of d.wiki?.airlines || []) rows.push({ Table: 'Airline', Item: x.airline, 'Length ft': '', 'Width ft': '', Surface: '', Lighted: '', Closed: '', Date: '', Takeoffs: '', Landings: '', Destinations: x.destinations + (x.seasonal ? ' (+' + x.seasonal + ' seasonal)' : '') });
    for (const f of d.frequencies || []) rows.push({ Table: 'Frequency', Item: (f.description || f.type) + ' ' + f.mhz + ' MHz', 'Length ft': '', 'Width ft': '', Surface: '', Lighted: '', Closed: '', Date: '', Takeoffs: '', Landings: '', Destinations: '' });
    saveCsv(ctx, 'airport', (a.iata || a.ident) + ' ' + a.name, rows);
  }
  async function exportReport() {
    if (!last) return; const { d } = last, a = d.airport, rw = (d.runways || []).filter(r => !r.closed), w = d.wiki || {}, ops = opsSummary(d.ops), m = d.metar;
    const code = [a.iata, a.icao || a.gps_code].filter(Boolean).join(' · ');
    const body = (w.image ? '<div class="photo"><img src="' + esc(w.image.url) + '" alt=""></div><div class="cap">Photo: ' + esc(w.image.credit || '') + '</div>' : '') +
      '<div class="kp">' + [[fmt(rw.length), 'Runways'], [rw[0]?.length_ft ? fmt(rw[0].length_ft) + ' ft' : '—', 'Longest runway'], [a.elevation_ft != null ? fmt(a.elevation_ft) + ' ft' : '—', 'Elevation'], [ops ? fmt(ops.avg) : '—', 'Ops a day (ADS-B)']].map(([v, l]) => '<div><b>' + v + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>' +
      (w.summary ? '<p>' + esc(w.summary) + '</p>' : '') +
      '<div class="two"><div><h2>Runways</h2>' + table(['Runway', { t: 'Length ft', r: 1 }, { t: 'Width ft', r: 1 }, 'Surface', 'Lighted'], rw.map(r => [esc((r.le_ident || '') + '/' + (r.he_ident || '')), fmt(r.length_ft), fmt(r.width_ft), esc(SURFACE(r.surface)), r.lighted ? 'Yes' : 'No'])) + '</div>' +
        '<div><h2>Runway diagram</h2><div class="map">' + runwaySvg(rw, { W: 420, H: 300 }) + '</div>' + (d.extras?.diagram_url ? '<p class="meta">Official FAA airport diagram: ' + esc(d.extras.diagram_url) + '</p>' : '') + '</div></div>' +
      (ops ? '<h2>Takeoffs and landings per day (ADS-B count)</h2><div class="bars">' + bars(ops.list.map(o => ({ label: o.day.slice(5), v: o.departures + o.arrivals })), { every: Math.ceil(ops.list.length / 8) }) + '</div><p class="meta">Average ' + fmt(ops.avg) + ' a day over ' + ops.days + ' days (' + fmt(ops.dep) + ' takeoffs, ' + fmt(ops.arr) + ' landings). Counted from aircraft broadcasting ADS-B; undercounts small aircraft.</p>' : '') +
      (w.airlines?.length ? '<h2>Airlines</h2>' + table(['Airline', { t: 'Destinations', r: 1 }, { t: 'Seasonal', r: 1 }], w.airlines.map(x => [esc(x.airline), fmt(x.destinations), x.seasonal ? fmt(x.seasonal) : ''])) + (w.cargo?.length ? '<p class="meta">Cargo airlines: ' + esc(w.cargo.map(x => x.airline).join(', ')) + '</p>' : '') : '') +
      (w.tables || []).slice(0, 4).map(t => '<h2>' + esc(t.caption || 'Statistics') + '</h2>' + table(t.headers.length ? t.headers : t.rows[0].map(() => ''), t.rows.map(r => r.map(esc)))).join('') +
      (m ? '<h2>Weather when the report was made</h2><p class="m">' + esc(m.raw || '') + '</p>' : '');
    await savePdf(ctx, 'airport', (a.iata || a.ident) + ' ' + a.name, reportDoc({ kicker: 'Airport report', title: a.name, meta: esc([code, TYPE[a.type], [a.municipality, a.iso_region].filter(Boolean).join(', ')].filter(Boolean).join(' · ')), body,
      sources: 'OurAirports (codes, runways, frequencies; public domain); FAA d-TPP (diagram); Wikipedia and Wikidata (photo, airlines, statistics; CC BY-SA); aviationweather.gov (METAR); takeoff and landing counts from community ADS-B data (adsb.lol), sampled every minute.' }));
  }

  // ---------- filing cards: the nearest airports and approach paths (not on property cards) ----------
  ctx.onCardRender?.(info => {
    const c = info.kind === 'filing' && !info.f.approx ? [info.f.lon, info.f.lat] : null; if (!c) return;
    const card = document.getElementById('card');
    fetch('api/airports?near=' + c[1].toFixed(4) + ',' + c[0].toFixed(4) + '&km=60&n=4&path=1').then(r => r.ok ? r.json() : null).then(d => {
      if (!d?.airports?.length || !card.classList.contains('open')) return;
      card.querySelector('#aptNear')?.remove();
      const list = d.airports.filter(a => a.type !== 'small_airport').slice(0, 2).concat(d.airports.filter(a => a.type === 'small_airport').slice(0, 1)).sort((x, y) => x.km - y.km);
      const sec = document.createElement('div'); sec.className = 'bsec'; sec.id = 'aptNear';
      sec.innerHTML = '<div class="lt">Airports Nearby</div>' + (d.path ? '<div class="apt-path"><b>Under the approach path</b> to ' + esc(d.path.code) + ' runway ' + esc(d.path.landing_runway) + ': ' + d.path.beyond_nm + ' nm from the runway end, ' + d.path.offset_nm + ' nm off the centerline. Expect low aircraft overhead when that runway is in use.</div>' : '') +
        list.map(a => '<div class="pl"><b><button class="lnk" type="button" data-apt="' + esc(a.ident) + '">' + esc(a.name) + '</button></b><span>' + esc((a.iata || a.icao || a.ident) + ' · ' + (TYPE[a.type] || a.type) + ' · ' + (a.km * 0.621371).toFixed(1) + ' mi') + '</span></div>').join('');
      (card.querySelector('#airSec') || card.querySelector('#bFilings') || card.querySelector('#liveSec') || card.lastElementChild)?.before(sec);
      sec.querySelectorAll('[data-apt]').forEach(b => b.onclick = () => show(b.dataset.apt, { fly: true }));
    }).catch(() => {});
  });
}
