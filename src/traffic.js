// Vehicle traffic (api/traffic):
//   Map layer "Traffic Counts": TxDOT annual average daily traffic on each counted road segment, from zoom 11.
//   Traffic report for any area: the busiest roads and every counted segment (TxDOT), average traffic by road type,
//   live speed vs free flow on the busiest roads and current crashes / closures / road works (TomTom, live, not stored).
//   Opens in the card; exports a PDF report and CSV.
import { esc, fmt, kgrid, table, bars, areaSvg, reportDoc, savePdf, saveCsv, openCard, cardTop, fillCard } from './reportkit.js';

const STOPS = [[5000, '#22c55e'], [20000, '#eab308'], [60000, '#f97316'], [150000, '#dc2626'], [300000, '#7f1d1d']];
const colorOf = v => (STOPS.find(s => v < s[0]) || STOPS[STOPS.length - 1])[1];

export function initTraffic(ctx) {
  const { map } = ctx, box = document.getElementById('lyAadt'), note = document.getElementById('lyAadtNote');
  let on = false, last = null, loadSeq = 0;
  const SRC = 'aadt';
  const lineColor = ['interpolate', ['linear'], ['get', 'aadt'], ...STOPS.flatMap(([v, c], i) => [i ? STOPS[i - 1][0] : 0, c])];
  let ctl = null, lastKey = '';
  async function load() {
    if (!on) return; const my = ++loadSeq;
    if (map.getZoom() < 11) { if (note) note.textContent = 'Zoom in to a part of town to see traffic counts.'; lastKey = ''; setData({ type: 'FeatureCollection', features: [] }); return; }
    const b = map.getBounds(), c = map.getCenter(), hw = Math.min(.3, (b.getEast() - b.getWest()) / 2 + .02), hh = Math.min(.3, (b.getNorth() - b.getSouth()) / 2 + .02);
    const bb = [c.lng - hw, c.lat - hh, c.lng + hw, c.lat + hh].map((v, i) => (i < 2 ? Math.floor(v * 100) : Math.ceil(v * 100)) / 100);
    const key = bb.join(','); if (key === lastKey && map.getSource(SRC)) return; // same area as what's drawn
    ctl?.abort(); ctl = new AbortController();
    try { const r = await fetch('api/traffic?lines=' + key, { signal: ctl.signal }), d = await r.json(); if (!r.ok) throw new Error(d.error || 'traffic counts unavailable'); if (my !== loadSeq) return; lastKey = key; setData(d);
      if (note) note.textContent = 'Average vehicles a day (TxDOT). ' + (d.features.length >= 2000 ? 'Showing the 2,000 busiest segments here; zoom in for more.' : fmt(d.features.length) + ' counted segments in view.') + ' Hover a road for its count.'; }
    catch (e) { if (e.name !== 'AbortError' && note) note.textContent = e.message; }
  }
  // hover handlers once (adding them with the layer stacked another pair on every toggle and basemap change)
  map.on('mousemove', SRC, e => { const f = e.features?.[0]; if (f && ctx.tip) { ctx.tip.textContent = f.properties.road + ': ' + fmt(f.properties.aadt) + ' vehicles a day'; ctx.tip.style.opacity = 1; ctx.tip.style.left = (e.point.x + 14) + 'px'; ctx.tip.style.top = (e.point.y + 14) + 'px'; } });
  map.on('mouseleave', SRC, () => { if (ctx.tip) ctx.tip.style.opacity = 0; });
  // Filters → Traffic: hide roads below a daily count
  let minAadt = 0; const applyMin = () => { if (map.getLayer(SRC)) map.setFilter(SRC, minAadt ? ['>=', ['get', 'aadt'], minAadt] : null); };
  ctx.trafficMin = v => { minAadt = +v || 0; applyMin(); };
  function setData(d) {
    try {
      const s = map.getSource(SRC); if (s) { s.setData(d); return; }
      map.addSource(SRC, { type: 'geojson', data: d });
      map.addLayer({ id: SRC, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': lineColor, 'line-width': ['interpolate', ['linear'], ['get', 'aadt'], 0, 1.5, 50000, 4, 250000, 8], 'line-opacity': .85 } }); applyMin();
    } catch (e) { /* style loading */ }
  }
  function setOn(v) {
    on = !!v; if (box) box.checked = on; if (note) note.hidden = !on;
    if (!on) { ctl?.abort(); lastKey = ''; try { if (map.getLayer(SRC)) map.removeLayer(SRC); if (map.getSource(SRC)) map.removeSource(SRC); } catch (e) {} ctx.setLegend?.('aadt', ''); return; }
    ctx.setLegend?.('aadt', '<div class="t">Vehicles a day</div>' + STOPS.map(([v, c], i) => '<div class="li"><i style="background:' + c + '"></i>' + (i ? fmt(STOPS[i - 1][0] / 1000) + 'k' : '0') + (i < STOPS.length - 1 ? '–' + fmt(v / 1000) + 'k' : '+') + '</div>').join(''));
    load();
  }
  if (box) box.onchange = () => setOn(box.checked);
  // reload once the map settles (following or orbiting moves it every frame), not on every move
  let moveT = 0; map.on('moveend', () => { if (on) { clearTimeout(moveT); moveT = setTimeout(load, 350); } });
  ctx.onOverlays?.(() => { if (on && !map.getSource(SRC)) load(); });
  ctx.trafficLayer = setOn;

  // ---------- report ----------
  async function reportFor(geometry, label) {
    const r = await fetch('api/traffic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry, label }), signal: AbortSignal.timeout(45000) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Traffic report failed (' + r.status + ')'); return d;
  }
  ctx.trafficReportData = reportFor;
  const congestion = x => x.closed ? 'Closed' : x.congestion_pct == null ? '—' : x.congestion_pct + '% slower';
  async function report({ geometry, label }) {
    if (ctx.view !== 'map') ctx.setView?.('map');
    const card = openCard(ctx, { kicker: 'Traffic report', title: label, loading: 'Reading traffic counts and live conditions…' });
    showArea(geometry);
    let d; try { d = await reportFor(geometry, label); } catch (e) { card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
    last = { d, label, geometry };
    const c = d.counts || {}, roads = c.roads || [], live = Array.isArray(d.live) ? d.live : [], inc = Array.isArray(d.incidents) ? d.incidents : [];
    const top = roads[0], slow = live.filter(x => x.congestion_pct >= 25);
    fillCard(ctx, card, cardTop('Traffic report', label, (d.area_sqmi ? fmt(d.area_sqmi) + ' sq mi · ' : '') + 'TxDOT counts' + (c.as_of ? ' (file of ' + esc(String(c.as_of).slice(0, 10)) + ')' : '') + ' · live now') +
      '<div class="bsec">' + (c.error ? '<div class="rnote err">Traffic counts: ' + esc(c.error) + '</div>' :
        kgrid([[top ? fmt(top.aadt) : '—', top ? 'Busiest: ' + top.road : 'No counted roads'], [fmt(roads.length), 'Counted roads'], [live.length ? slow.length + ' of ' + live.length : '—', 'Busy roads slowed now'], [Array.isArray(d.incidents) ? fmt(inc.length) : '—', 'Incidents now']])) + '</div>' +
      (roads.length ? '<div class="bsec"><div class="lt">Busiest roads (vehicles a day)</div>' + bars(roads.slice(0, 10).map(r => ({ label: r.road.length > 12 ? r.road.slice(0, 11) + '…' : r.road, v: r.aadt, color: colorOf(r.aadt) })), { height: 110 }) +
        '<dl>' + roads.slice(0, 12).map(r => '<dt>' + esc(r.road) + '</dt><dd class="mono">' + fmt(r.aadt) + ' <span class="sc">' + esc(r.type) + (r.segments > 1 ? ', avg ' + fmt(r.avg) + ' over ' + r.segments + ' segments' : '') + '</span></dd>').join('') + '</dl></div>' : '') +
      (c.types?.length ? '<div class="bsec"><div class="lt">By road type (average a day)</div><dl>' + c.types.map(t => '<dt>' + esc(t.label) + '</dt><dd class="mono">' + fmt(t.avg) + ' <span class="sc">' + fmt(t.segments) + ' segments, busiest ' + fmt(t.max) + '</span></dd>').join('') + '</dl></div>' : '') +
      '<div class="bsec"><div class="lt">Live conditions on the busiest roads</div>' + (d.live?.error ? '<div class="rnote">' + esc(d.live.error) + '</div>' : live.length ?
        '<dl>' + live.map(x => '<dt>' + esc(x.road) + '</dt><dd class="mono">' + fmt(x.current_mph) + ' mph <span class="sc">free flow ' + fmt(x.free_flow_mph) + ' · ' + esc(congestion(x)) + '</span></dd>').join('') + '</dl>' : '<div class="rnote">No live readings.</div>') + '</div>' +
      '<div class="bsec"><div class="lt">Incidents right now</div>' + (d.incidents?.error ? '<div class="rnote">' + esc(d.incidents.error) + '</div>' : inc.length ?
        inc.slice(0, 10).map(x => '<div class="pl"><b>' + esc(x.kind + (x.road ? ' · ' + x.road : '')) + '</b><span>' + esc([x.what, x.from && x.to ? x.from + ' to ' + x.to : x.from, x.delay_min ? x.delay_min + ' min delay' : ''].filter(Boolean).join(' · ')) + '</span></div>').join('') : '<div class="rnote">No crashes, closures or road works reported in this area.</div>') + '</div>' +
      '<div class="bacts"><button class="btn" id="trLayer" type="button">Show Counts on Map</button><button class="btn primary" id="trPdf" type="button">Export PDF</button><button class="btn" id="trCsv" type="button">Export CSV</button></div>' +
      '<div class="rnote bsec">Counts are TxDOT annual averages (both directions, all vehicles); TxDOT publishes the current year only. Live speeds and incidents are a snapshot from when the report was opened.<span class="src"> ' + esc(d.sources) + '</span></div>');
    card.querySelector('#trLayer').onclick = () => { setOn(true); ctx.fitGeom?.(geometry); };
    card.querySelector('#trPdf').onclick = exportReport; card.querySelector('#trCsv').onclick = exportCsv;
  }
  ctx.trafficReport = report;
  function showArea(g) {
    try { const data = { type: 'FeatureCollection', features: g ? [{ type: 'Feature', properties: {}, geometry: g }] : [] }, s = map.getSource('traffic-area');
      if (s) s.setData(data); else if (g) { map.addSource('traffic-area', { type: 'geojson', data }); map.addLayer({ id: 'traffic-area', type: 'line', source: 'traffic-area', paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [2, 1.5] } }); } }
    catch (e) { /* optional */ }
  }
  ctx.onCardClose?.(() => showArea(null));

  function exportCsv() {
    if (!last) return; const { d, label } = last, c = d.counts || {}, rows = [];
    for (const s of c.segments || []) rows.push({ Table: 'Counted segment', Road: s.road, 'Road type': s.type, 'Vehicles a day (AADT)': s.aadt, 'Live mph': '', 'Free-flow mph': '', Detail: '', Latitude: s.path[Math.floor(s.path.length / 2)]?.[1] ?? '', Longitude: s.path[Math.floor(s.path.length / 2)]?.[0] ?? '' });
    for (const x of Array.isArray(d.live) ? d.live : []) rows.push({ Table: 'Live speed', Road: x.road, 'Road type': '', 'Vehicles a day (AADT)': x.aadt, 'Live mph': x.current_mph, 'Free-flow mph': x.free_flow_mph, Detail: congestion(x), Latitude: x.lat, Longitude: x.lon });
    for (const x of Array.isArray(d.incidents) ? d.incidents : []) rows.push({ Table: 'Incident', Road: x.road, 'Road type': x.kind, 'Vehicles a day (AADT)': '', 'Live mph': '', 'Free-flow mph': '', Detail: [x.what, x.from && x.to ? x.from + ' to ' + x.to : x.from, x.delay_min ? x.delay_min + ' min delay' : ''].filter(Boolean).join(' · '), Latitude: x.lat ?? '', Longitude: x.lon ?? '' });
    saveCsv(ctx, 'traffic', label, rows);
  }
  async function exportReport() {
    if (!last) return; const { d, label, geometry } = last, c = d.counts || {}, roads = c.roads || [], live = Array.isArray(d.live) ? d.live : [], inc = Array.isArray(d.incidents) ? d.incidents : [];
    const segs = (c.segments || []).slice(0, 400);
    // draw the counted segments into the area map
    const svg = areaWithLines(geometry, segs);
    const body = '<div class="kp">' + [[roads[0] ? fmt(roads[0].aadt) : '—', roads[0] ? 'Busiest: ' + roads[0].road : 'No counted roads'], [fmt(roads.length), 'Counted roads'], [live.length ? live.filter(x => x.congestion_pct >= 25).length + ' of ' + live.length : '—', 'Busy roads slowed'], [fmt(inc.length), 'Incidents']].map(([v, l]) => '<div><b>' + v + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>' +
      '<div class="map">' + svg + '</div><div class="lg">' + STOPS.map(([v, col], i) => '<span><i style="background:' + col + '"></i>' + (i ? fmt(STOPS[i - 1][0] / 1000) + 'k' : '0') + (i < STOPS.length - 1 ? '–' + fmt(v / 1000) + 'k' : '+') + ' a day</span>').join('') + '</div>' +
      '<h2>Busiest roads</h2><div class="bars">' + bars(roads.slice(0, 12).map(r => ({ label: r.road.length > 10 ? r.road.slice(0, 9) + '…' : r.road, v: r.aadt, color: colorOf(r.aadt) }))) + '</div>' +
      table(['Road', 'Type', { t: 'Busiest segment', r: 1 }, { t: 'Average', r: 1 }, { t: 'Segments', r: 1 }], roads.map(r => [esc(r.road), esc(r.type), fmt(r.aadt), fmt(r.avg), fmt(r.segments)])) +
      '<div class="two"><div><h2>By road type</h2>' + table(['Type', { t: 'Avg a day', r: 1 }, { t: 'Busiest', r: 1 }, { t: 'Segments', r: 1 }], (c.types || []).map(t => [esc(t.label), fmt(t.avg), fmt(t.max), fmt(t.segments)])) + '</div>' +
      '<div><h2>Live speeds (' + new Date(d.as_of_live).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) + ')</h2>' + (live.length ? table(['Road', { t: 'Now', r: 1 }, { t: 'Free flow', r: 1 }, 'Condition'], live.map(x => [esc(x.road), fmt(x.current_mph) + ' mph', fmt(x.free_flow_mph) + ' mph', esc(congestion(x))])) : '<p class="meta">' + esc(d.live?.error || 'No live readings.') + '</p>') + '</div></div>' +
      '<h2>Incidents at the time of the report</h2>' + (inc.length ? table(['Type', 'Road', 'Where', 'What', { t: 'Delay', r: 1 }], inc.map(x => [esc(x.kind), esc(x.road), esc(x.from && x.to ? x.from + ' to ' + x.to : x.from), esc(x.what), x.delay_min ? x.delay_min + ' min' : ''])) : '<p class="meta">' + esc(d.incidents?.error || 'None reported.') + '</p>');
    await savePdf(ctx, 'traffic', label, reportDoc({ kicker: 'Traffic report', title: label, meta: (d.area_sqmi ? fmt(d.area_sqmi) + ' sq mi' : '') + (c.as_of ? ' · TxDOT file of ' + esc(String(c.as_of).slice(0, 10)) : ''), body,
      sources: esc(d.sources) + ' Counts are annual averages for both directions and all vehicles; live speeds and incidents are a snapshot.' }));
  }
  // the area outline with the counted segments coloured by traffic
  function areaWithLines(g, segs) {
    const base = areaSvg([{ geometry: g, stroke: '#7c3aed', fill: 'rgba(124,58,237,.04)', dash: true }]); if (!base) return '';
    const ring = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat(2);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const W = 1000, H = 440, k = Math.cos((y0 + y1) / 2 * Math.PI / 180), sx = (x1 - x0) * k || 1e-4, sy = (y1 - y0) || 1e-4, s = Math.min((W - 40) / sx, (H - 40) / sy);
    const pr = ([x, y]) => [(W - sx * s) / 2 + (x - x0) * k * s, (H - sy * s) / 2 + (y1 - y) * s];
    const lines = segs.slice().reverse().map(sg => '<path d="M' + sg.path.map(p => pr(p).map(v => v.toFixed(1)).join(',')).join('L') + '" fill="none" stroke="' + colorOf(sg.aadt) + '" stroke-width="' + (1.2 + Math.min(5, sg.aadt / 50000)).toFixed(1) + '" stroke-linecap="round"/>').join('');
    return base.replace('</svg>', lines + '</svg>');
  }

  ctx.addAreaReport?.({ key: 'traffic', label: 'Traffic Report', desc: 'Vehicle traffic for an area in Texas: the busiest roads and every counted segment (vehicles a day, TxDOT), average traffic by road type, live speeds on the busiest roads and current crashes, closures and road works. Export as a PDF report or CSV.',
    note: 'Texas only. Select an area with Area, Shape, Radius or County, or use the map view', run: ({ geometry, label }) => report({ geometry, label }) });
}
