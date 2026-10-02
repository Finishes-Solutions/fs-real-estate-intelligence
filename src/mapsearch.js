// Map search (under the map tools): filings by project, owner, address, developer or TABS number, plus places
// (counties, towns, addresses, landmarks, roads). Results appear while typing, 10 at a time, with more loading as you
// scroll. Picking a place outlines it on the map: city / county / neighborhood boundaries and building footprints
// from OpenStreetMap (Nominatim), whole roads from OpenStreetMap (Overpass). The place card can filter to the area
// or add it to Compare.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const TX_VIEWBOX = '-106.7,36.5,-93.5,25.8';
const PAGE = 10;
const KIND_LABEL = { county: 'County', town: 'City / town', address: 'Address', poi: 'Place', road: 'Road', area: 'Neighborhood', zip: 'ZIP code', building: 'Building', coords: 'Coordinates' };
const kindFromMaptiler = t => ({ address: 'address', poi: 'poi', street: 'road', road: 'road', neighbourhood: 'area', locality: 'area', postal_code: 'zip', county: 'county', municipality: 'town', place: 'town', municipal_district: 'town' }[t] || 'town');

export function initMapSearch(ctx) {
  const { map, esc, fmtM, fmtN, F, COUNTIES, DATA } = ctx;
  const wrap = document.getElementById('msearch'), input = document.getElementById('msq'), res = document.getElementById('msres'), clearB = document.getElementById('msx');
  const bar = document.getElementById('placebar');
  let items = [], hits = [], shown = 0, active = -1, q = '', geoT = 0, seq = 0, remote = [];

  // ---------- mount: under the tools (tablet/desktop) or in the floating top bar (phone) ----------
  const phoneMQ = window.matchMedia('(max-width:700px)');
  const mount = () => { const host = phoneMQ.matches ? document.getElementById('mSearchSlot') : document.getElementById('mapleft'); if (host && wrap.parentElement !== host) host.insertBefore(wrap, phoneMQ.matches ? null : document.getElementById('placebar')); };
  phoneMQ.addEventListener('change', mount); mount();

  // ---------- local search ----------
  const hay = f => f._sh ||= [f.name, f.owner, f.addr, f.city, f.dev, f.ten, f.id, f.arch, f.gc].filter(Boolean).join(' · ').toLowerCase();
  function searchFilings(text) {
    const t = text.toLowerCase(), toks = t.split(/\s+/).filter(Boolean); if (!toks.length) return [];
    const vis = new Set(ctx.visible), out = [];
    for (const f of F) { const h = hay(f); if (!toks.every(x => h.includes(x))) continue;
      const nm = f.name.toLowerCase(); out.push({ f, s: (nm.startsWith(t) ? 4 : nm.includes(t) ? 2 : 0) + ((f.addr || '').toLowerCase().startsWith(t) ? 2 : 0) + ((f.owner || '').toLowerCase().includes(t) ? 1 : 0) + (vis.has(f) ? 1 : 0) }); }
    return out.sort((a, b) => b.s - a.s || b.f.cost - a.f.cost).map(x => x.f);
  }
  function localPlaces(text) {
    const t = text.toLowerCase().replace(/\s+county$/, '').trim(); if (t.length < 2) return [];
    const m = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (m) { let a = +m[1], b = +m[2], lat = a, lon = b; if (Math.abs(a) > 90) { lon = a; lat = b; } return [{ label: lat.toFixed(5) + ', ' + lon.toFixed(5), kind: 'coords', c: [lon, lat] }]; }
    const cs = COUNTIES.filter(c => c.toLowerCase().startsWith(t)).map(c => ({ label: c + ' County', name: c, kind: 'county', c: DATA.counties.find(x => x.name === c).label }));
    const ts = (DATA.places || []).filter(p => p[0].toLowerCase().startsWith(t)).slice(0, 4).map(p => ({ label: p[0] + ', TX', name: p[0], kind: 'town', c: [p[1], p[2]] }));
    return cs.concat(ts);
  }

  // ---------- results ----------
  function run(text) {
    q = text.trim(); clearB.hidden = !q; remote = [];
    if (!q) { close(); return; }
    hits = searchFilings(q); shown = Math.min(PAGE, hits.length); active = -1; render();
    clearTimeout(geoT); const my = ++seq;
    if (q.length >= 3 && !/^\s*-?\d+(\.\d+)?\s*[, ]/.test(q)) geoT = setTimeout(async () => {
      const g = await ctx.geocode(q); if (my !== seq) return;
      const have = new Set(localPlaces(q).map(p => p.label.toLowerCase()));
      remote = g.filter(x => !have.has((x.name || '').toLowerCase() + ', tx')).slice(0, 5).map(x => ({ label: x.t, name: x.name, kind: kindFromMaptiler(x.type), c: x.c, bbox: x.bbox }));
      render();
    }, 240);
  }
  function render() {
    const places = localPlaces(q).concat(remote).slice(0, 7);
    items = []; let h = '';
    if (places.length) { h += '<div class="ms-sec">Places</div>'; places.forEach(p => { items.push({ t: 'place', p }); h += btn(items.length - 1, '<b>' + esc(p.label) + '</b><i>' + esc(KIND_LABEL[p.kind] || 'Place') + '</i>'); }); }
    if (hits.length) {
      h += '<div class="ms-sec">Filings · ' + fmtN(hits.length) + ' match' + (hits.length > 1 ? 'es' : '') + '<button class="lnk" data-act="filter" type="button">Show all on map</button></div>';
      const vis = new Set(ctx.visible);
      hits.slice(0, shown).forEach(f => { items.push({ t: 'filing', f }); h += btn(items.length - 1, '<b>' + esc(f.name) + '</b><i>' + fmtM(f.cost) + '</i><span>' + esc([f.addr || f.city, f.owner].filter(Boolean).join(' · ')) + (vis.has(f) ? '' : ' · <em>hidden by filters</em>') + '</span>'); });
      if (hits.length > shown) h += '<button class="ms-more" data-act="more" type="button">Showing ' + shown + ' of ' + fmtN(hits.length) + ' · show ' + Math.min(PAGE, hits.length - shown) + ' more</button>';
    }
    if (!h) h = '<div class="ms-none">' + (q.length < 3 ? 'Keep typing…' : 'No filings or places match “' + esc(q) + '”.') + '</div>';
    const top = res.scrollTop; res.innerHTML = h; res.scrollTop = top; if (document.activeElement === input || res.contains(document.activeElement) || res.classList.contains('on')) open();
    res.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => pick(+b.dataset.i); b.onmouseenter = () => setActive(+b.dataset.i, false); });
    res.querySelector('[data-act=filter]')?.addEventListener('click', applyKeyword);
    res.querySelector('[data-act=more]')?.addEventListener('click', more);
  }
  const btn = (i, inner) => '<button type="button" role="option" class="ms-it' + (i === active ? ' on' : '') + '" data-i="' + i + '">' + inner + '</button>';
  function more() { if (shown >= hits.length) return; shown = Math.min(hits.length, shown + PAGE); render(); }
  res.addEventListener('scroll', () => { if (res.scrollTop + res.clientHeight > res.scrollHeight - 40) more(); });
  function setActive(i, scroll = true) { active = i; res.querySelectorAll('.ms-it').forEach(b => b.classList.toggle('on', +b.dataset.i === i)); if (scroll) res.querySelector('.ms-it.on')?.scrollIntoView({ block: 'nearest' }); }
  function open() { res.classList.add('on'); input.setAttribute('aria-expanded', 'true'); }
  function close() { res.classList.remove('on'); input.setAttribute('aria-expanded', 'false'); }
  function applyKeyword() { seq++; clearTimeout(geoT); ctx.state.q = q; ctx.applyFilters(); close(); ctx.setView('map'); ctx.fitToVisible(); ctx.toast('Filtered to ' + fmtN(ctx.visible.length) + ' filings matching “' + q + '”.'); }
  function pick(i) {
    const it = items[i]; if (!it) return; seq++; clearTimeout(geoT); close(); input.blur();
    if (it.t === 'filing') { ctx.setView('map'); ctx.select(it.f, true); return; }
    showPlace(it.p);
  }
  let it0 = 0;
  input.addEventListener('input', () => { clearTimeout(it0); it0 = setTimeout(() => run(input.value), 90); });
  input.addEventListener('focus', () => { if (q) render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (active >= items.length - 1 && shown < hits.length) more(); setActive(Math.min(items.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); else if (items[0]?.t === 'place' && !hits.length) pick(0); else if (hits.length) applyKeyword(); }
    else if (e.key === 'Escape') { close(); input.blur(); }
  });
  clearB.onclick = () => { input.value = ''; run(''); clearPlace(); if (ctx.state.q) { ctx.state.q = ''; ctx.applyFilters(); } input.focus(); };
  document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) close(); });
  // keep the box in step when the keyword filter changes elsewhere (reset, saved search, AI)
  ctx.onChange(() => { if (document.activeElement !== input && ctx.state.q && input.value !== ctx.state.q) { input.value = ctx.state.q; clearB.hidden = false; } else if (!ctx.state.q && document.activeElement !== input && !place) { input.value = ''; clearB.hidden = true; } });

  // ---------- place outlines ----------
  let place = null; // { label, kind, geom, c }
  ctx.onOverlays(() => {
    if (!map.getSource('place')) map.addSource('place', { type: 'geojson', data: ctx.fc([]) });
    const col = ctx.isDark() ? '#f0b429' : '#d48806';
    if (!map.getLayer('place-fill')) map.addLayer({ id: 'place-fill', type: 'fill', source: 'place', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': col, 'fill-opacity': .10 } });
    if (!map.getLayer('place-casing')) map.addLayer({ id: 'place-casing', type: 'line', source: 'place', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ctx.isDark() ? '#0b0d0c' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 16, 9], 'line-opacity': .9 } });
    if (!map.getLayer('place-line')) map.addLayer({ id: 'place-line', type: 'line', source: 'place', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': col, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.2, 16, 5] } });
    syncPlace();
  });
  const syncPlace = () => map.getSource && map.getSource('place')?.setData(ctx.fc(place?.geom ? [{ type: 'Feature', properties: {}, geometry: place.geom }] : []));
  function clearPlace() { place = null; syncPlace(); bar.classList.remove('on'); bar.innerHTML = ''; }
  ctx.clearPlace = clearPlace;

  const isArea = g => g && /Polygon/.test(g.type);
  const isLine = g => g && /LineString/.test(g.type);
  async function nominatim(text, extra = '') {
    const u = NOMINATIM + '?format=geojson&polygon_geojson=1&polygon_threshold=0.0002&limit=6&countrycodes=us&viewbox=' + TX_VIEWBOX + '&bounded=1' + extra + '&q=' + encodeURIComponent(text);
    try { const r = await fetch(u, { headers: { Accept: 'application/json' } }); if (!r.ok) return []; return (await r.json()).features || []; } catch (e) { return []; }
  }
  // the whole road: every OpenStreetMap way with that name within ~15 miles of the hit
  async function roadGeom(name, c) {
    if (!name) return null;
    const s = c[1] - .22, n = c[1] + .22, w = c[0] - .26, e = c[0] + .26, nm = name.replace(/["\\]/g, '');
    const body = '[out:json][timeout:25];way["highway"]["name"="' + nm + '"](' + [s, w, n, e].map(x => x.toFixed(4)).join(',') + ');out geom 2500;';
    try { const r = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(body), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); if (!r.ok) return null;
      const d = await r.json(), lines = (d.elements || []).filter(x => x.geometry?.length > 1).map(x => x.geometry.map(p => [p.lon, p.lat]));
      return lines.length ? { type: 'MultiLineString', coordinates: lines } : null; } catch (e) { return null; }
  }
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // planar bounds straight from the coordinates (d3.geoBounds reads counter-clockwise GeoJSON rings as "everything but")
  const bounds = g => { let x0 = 180, y0 = 90, x1 = -180, y1 = -90; const walk = a => { if (typeof a[0] === 'number') { if (a[0] < x0) x0 = a[0]; if (a[0] > x1) x1 = a[0]; if (a[1] < y0) y0 = a[1]; if (a[1] > y1) y1 = a[1]; } else a.forEach(walk); }; walk(g.coordinates); return [[x0, y0], [x1, y1]]; };
  const centerOf = g => { const b = bounds(g); return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]; };
  // pick the Nominatim feature that best matches: wanted geometry type, closest to the point we already have
  const best = (feats, c, want) => feats.filter(f => want(f.geometry)).sort((a, b) => (c ? near(centerOf(a.geometry), c) : 0) - (c ? near(centerOf(b.geometry), c) : 0))[0];

  async function showPlace(p) {
    ctx.setView('map'); ctx.closeCard?.();
    place = { label: p.label, kind: p.kind, c: p.c, geom: null };
    bar.innerHTML = '<div class="pb-k">' + esc(KIND_LABEL[p.kind] || 'Place') + '</div><div class="pb-t">' + esc(p.label) + '</div><div class="pb-s">Finding the outline…</div>'; bar.classList.add('on');
    let geom = null, note = '';
    if (p.kind === 'county') {
      const loaded = DATA.counties.find(x => x.name === p.name);
      if (loaded) geom = { type: 'MultiPolygon', coordinates: loaded.outline };
      else geom = best(await nominatim((p.name || p.label.replace(/ County.*/, '')) + ' County, Texas'), p.c, isArea)?.geometry || null;
    } else if (p.kind === 'road') {
      geom = await roadGeom(p.name || p.label.split(',')[0], p.c);
      if (!geom) { const n = best(await nominatim(p.label), p.c, isLine); geom = n?.geometry || null; }
    } else if (p.kind === 'coords') {
      geom = null;
    } else {
      const feats = await nominatim(p.kind === 'town' ? (p.name || p.label.split(',')[0]) + ', Texas' : p.label);
      const hit = best(feats, p.c, isArea);
      // a town search must land on that town, not a polygon miles away
      if (hit && (!p.c || near(centerOf(hit.geometry), p.c) < (p.kind === 'town' || p.kind === 'zip' ? .35 : .02))) geom = hit.geometry;
    }
    if (place?.label !== p.label) return; // a newer pick won
    place.geom = geom ? (isArea(geom) ? ctx.fixWinding(geom) : geom) : null; syncPlace();
    const pt = p.c || (geom && centerOf(geom));
    if (geom && isArea(geom) && /address|poi|building/.test(p.kind) || !geom && /address|poi|coords/.test(p.kind)) {
      // a single building: fly in close, then open the building panel (footprint highlight, parcel, businesses)
      map.flyTo({ center: pt, zoom: 18, pitch: 55, duration: ctx.reduceMotion ? 0 : 1600 });
      map.once('idle', () => { if (place?.label === p.label && !isArea(place.geom)) { const b = ctx.buildingAt?.(pt); if (b?.footprint) { place.geom = b.footprint; place.kind = 'building'; syncPlace(); placeCard(); } } });
    } else if (geom) ctx.fitGeom(geom);
    else if (pt) map.flyTo({ center: pt, zoom: p.kind === 'town' ? 12 : 14, duration: ctx.reduceMotion ? 0 : 1200 });
    if (!geom && !/address|poi|coords/.test(p.kind)) note = 'No outline found for this place in OpenStreetMap, so it is shown as a point.';
    placeCard(note);
    return place;
  }
  ctx.showPlace = showPlace;

  // filings inside an area, or within a quarter mile of a road or point
  function placeHits() {
    const list = ctx.filtered(), g = place.geom;
    if (isArea(g) && place.kind !== 'building') return { list: list.filter(f => d3.geoContains(g, [f.lon, f.lat])), how: 'inside' };
    const R = .25 / 3958.8, pt = place.c || (g && centerOf(g));
    if (isLine(g)) { const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates, b = bounds(g);
      return { list: list.filter(f => f.lon > b[0][0] - .01 && f.lon < b[1][0] + .01 && f.lat > b[0][1] - .01 && f.lat < b[1][1] + .01 && lines.some(l => l.some((p, i) => i && segDist([f.lon, f.lat], l[i - 1], p) < R))), how: 'within ¼ mile' }; }
    return { list: pt ? list.filter(f => d3.geoDistance(pt, [f.lon, f.lat]) < R) : [], how: 'within ¼ mile' };
  }
  function segDist(p, a, b) { // radians, small-distance approximation
    const k = Math.cos(p[1] * Math.PI / 180), ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + t * dx, ay + t * dy) * Math.PI / 180; }

  function placeCard(note = '') {
    if (!place) return;
    const { list, how } = placeHits(), v = list.reduce((s, f) => s + f.cost, 0), area = isArea(place.geom) && place.kind !== 'building';
    const inCmp = ctx.compare?.list().some(a => a.key === 'place:' + place.label);
    bar.innerHTML = '<button class="x" aria-label="Clear" id="pbX">×</button><div class="pb-k">' + esc(KIND_LABEL[place.kind] || 'Place') + '</div><div class="pb-t">' + esc(place.label) + '</div>' +
      '<div class="pb-s">' + fmtN(list.length) + ' filing' + (list.length === 1 ? '' : 's') + ' ' + how + ' · est. ' + fmtM(v) + (ctx.filterText() ? '<span> (current filters)</span>' : '') + '</div>' + (note ? '<div class="pb-n">' + esc(note) + '</div>' : '') +
      '<div class="pb-a">' + (area ? '<button class="btn primary" id="pbFilter">Filter to this area</button><button class="btn" id="pbCmp"' + (inCmp ? ' disabled' : '') + '>+ Compare</button>'
        : '<button class="btn primary" id="pbNear">Filings within ¼ mile</button>') + (list.length ? '<button class="btn" id="pbHl">Highlight ' + (list.length > 50 ? 'top 50' : 'them') + '</button>' : '') + '</div>';
    bar.classList.add('on');
    bar.querySelector('#pbX').onclick = clearPlace;
    bar.querySelector('#pbFilter')?.addEventListener('click', () => { const pl = place; ctx.setSelection('place', pl.label, pl.geom); clearPlace(); ctx.fitGeom(pl.geom); });
    bar.querySelector('#pbCmp')?.addEventListener('click', () => { if (ctx.compare.add({ key: 'place:' + place.label, label: place.label.split(',')[0], kind: place.kind, geom: place.geom })) placeCard(note); });
    bar.querySelector('#pbNear')?.addEventListener('click', () => { const pt = place.c || centerOf(place.geom); ctx.setMiles(.25, false, true); ctx.setRadiusCenter(pt, place.label, true); clearPlace(); });
    bar.querySelector('#pbHl')?.addEventListener('click', () => { ctx.highlight(list.slice().sort((a, b) => b.cost - a.cost).slice(0, 50), place.label); });
  }
  ctx.onChange(() => { if (place && bar.classList.contains('on') && place.geom !== undefined) placeCard(); });

  // for the assistant: find a place by name and outline it
  ctx.highlightPlace = async (text, kind) => {
    const k = kind && kind !== 'auto' ? kind : null, t = String(text).trim();
    const county = COUNTIES.find(c => t.toLowerCase().replace(/\s+county.*$/, '') === c.toLowerCase());
    if (county && (!k || k === 'county')) return showPlace({ label: county + ' County', name: county, kind: 'county', c: DATA.counties.find(x => x.name === county).label });
    const feats = await nominatim(t + (/texas|\btx\b/i.test(t) ? '' : ', Texas'));
    const f = feats.find(x => k === 'road' ? x.properties.category === 'highway' : k === 'county' ? x.properties.addresstype === 'county' : k === 'town' ? /city|town|village|hamlet|suburb/.test(x.properties.addresstype) : k === 'building' ? /building|amenity|leisure|shop|tourism|office/.test(x.properties.category) : true) || feats[0];
    if (!f) return null;
    const c = centerOf(f.geometry), pr = f.properties, at = pr.addresstype || pr.type;
    const kk = k || (pr.category === 'highway' ? 'road' : at === 'county' ? 'county' : /city|town|village|hamlet|municipality/.test(at) ? 'town' : /suburb|neighbourhood|quarter/.test(at) ? 'area' : at === 'postcode' ? 'zip' : 'poi');
    const parts = pr.display_name.split(',').map(x => x.trim()), name = pr.name || parts[0];
    const label = kk === 'county' ? (/county/i.test(name) ? name : name + ' County') : kk === 'town' ? name + ', TX' : [name, parts.find((x, i) => i && /^[A-Za-z .'-]+$/.test(x) && x !== name && !/county|texas|united states/i.test(x))].filter(Boolean).join(', ');
    return showPlace({ label, name: kk === 'county' ? name.replace(/\s+county$/i, '') : name, kind: kk, c });
  };
  ctx.placeSummary = () => { if (!place) return null; const { list, how } = placeHits(); return { place: place.label, kind: place.kind, outlined: !!place.geom, filings: list.length, how, total_value: list.reduce((s, f) => s + f.cost, 0) }; };
  ctx.currentPlace = () => place;
}
