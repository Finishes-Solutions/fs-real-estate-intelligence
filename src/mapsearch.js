import { pickPlace, districtFor, splitWithin, applyPlaceAlias, mentions, extentMeters, BIG_PLACE_M } from './lib/assist-logic.mjs';
import { BY_KEY, DEFAULT_KPIS } from './metrics.js';
import { mergeBusinesses } from './lib/nearby.mjs';
import { contains as inArea } from './lib/geomatch.mjs';
// Map search (under the map tools): real street addresses, places (counties, towns, neighborhoods, landmarks, roads),
// projects by name, companies and people (owners, developers, architects, contractors) and filings at matching addresses. Results appear while typing, 10 at a time, with more loading as you
// scroll. Picking a place outlines it on the map: city / county / neighborhood boundaries and building footprints
// from OpenStreetMap (Nominatim), whole roads from OpenStreetMap (Overpass). The place card can filter to the area
// or add it to Compare.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const TX_VIEWBOX = '-106.7,36.5,-93.5,25.8';
const PAGE = 10;
const KIND_LABEL = { business: 'Business', county: 'County', town: 'City / town', address: 'Address', poi: 'Place', road: 'Road', area: 'Neighborhood', zip: 'ZIP code', building: 'Building', coords: 'Coordinates' };
// "lat, lon" typed into the box: only this skips the address lookup ("1004 Priya Ln" starts with a number but is an address)
const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
// street-type and direction abbreviations, so "Priya Ln" finds "Priya Lane" (and the other way round)
const ABBR = { ln: 'lane', dr: 'drive', st: 'street', rd: 'road', ave: 'avenue', av: 'avenue', blvd: 'boulevard', pkwy: 'parkway', hwy: 'highway', fwy: 'freeway',
  ct: 'court', cir: 'circle', pl: 'place', trl: 'trail', ter: 'terrace', sq: 'square', expy: 'expressway', cv: 'cove', xing: 'crossing', mdw: 'meadow', mdws: 'meadows',
  pt: 'point', ste: 'suite', nw: 'northwest', ne: 'northeast', sw: 'southwest', se: 'southeast' };
const expandAbbr = q => q.replace(/[A-Za-z]+\.?/g, w => { const k = w.replace('.', '').toLowerCase(), v = ABBR[k]; return v ? (w[0] === w[0].toUpperCase() ? v.replace(/\b\w/g, c => c.toUpperCase()) : v) : w; });
const kindFromMaptiler = t => ({ address: 'address', poi: 'poi', street: 'road', road: 'road', neighbourhood: 'area', locality: 'area', postal_code: 'zip', county: 'county', municipality: 'town', place: 'town', municipal_district: 'town' }[t] || 'town');

export function initMapSearch(ctx) {
  const { map, esc, fmtM, fmtN, F, COUNTIES, DATA } = ctx;
  const wrap = document.getElementById('msearch'), input = document.getElementById('msq'), res = document.getElementById('msres'), clearB = document.getElementById('msx');
  const bar = document.getElementById('placebar');
  let items = [], shown = 0, active = -1, q = '', geoT = 0, seq = 0, remote = [], pending = false, enterWait = false;

  // ---------- mount: under the tools (tablet/desktop) or in the floating top bar (phone) ----------
  const phoneMQ = window.matchMedia('(max-width:700px)');
  const mount = () => { const host = phoneMQ.matches ? document.getElementById('mSearchSlot') : document.getElementById('mapleft'); if (host && wrap.parentElement !== host) host.insertBefore(wrap, phoneMQ.matches ? null : document.getElementById('placebar')); };
  phoneMQ.addEventListener('change', mount); mount();

  // ---------- placeholder: the longest wording that fits, so it never shows cut off when the box narrows ----------
  // (assistant drawer open, list panel widened, small window)
  const HINTS = ['Search addresses, places, projects, owners, developers…', 'Search addresses, places, projects, owners', 'Search addresses, places, projects', 'Search places & projects', 'Search'];
  const meas = document.createElement('canvas').getContext('2d');
  function fitHint() {
    const w = input.clientWidth; if (!w) return;
    const cs = getComputedStyle(input); meas.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const room = w - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 4;
    const hint = HINTS.find(h => meas.measureText(h).width <= room) || HINTS[HINTS.length - 1];
    if (input.placeholder !== hint) input.placeholder = hint;
  }
  new ResizeObserver(fitHint).observe(input); document.fonts?.ready.then(fitHint);

  // ---------- local search ----------
  const low = v => (v || '').toLowerCase();
  // a typed token matches as written or spelled out ("ln" also matches "lane"); haystacks carry both spellings too
  const matches = (h, toks) => toks.every(x => h.includes(x) || (ABBR[x] && h.includes(ABBR[x])));
  const hayOf = s => { const l = low(s); return l + ' ' + low(expandAbbr(l)); };
  // projects whose name matches, then filings that match only by address / city / TABS number / tenant
  function searchFilings(text) {
    const t = low(text), toks = t.replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean); if (!toks.length) return { names: [], addrs: [] };
    const vis = new Set(ctx.visible), names = [], addrs = [];
    for (const f of F) {
      const nm = low(f.name);
      if (matches(nm, toks)) names.push({ f, s: (nm.startsWith(t) ? 4 : nm.includes(t) ? 2 : 0) + (vis.has(f) ? 1 : 0) });
      else if (matches(f._ah ||= hayOf([f.addr, f.city, f.id, f.ten].filter(Boolean).join(' · ')), toks)) addrs.push({ f, s: (low(f.addr).startsWith(t) ? 2 : 0) + (vis.has(f) ? 1 : 0) });
    }
    const by = (a, b) => b.s - a.s || b.f.cost - a.f.cost;
    return { names: names.sort(by).map(x => x.f), addrs: addrs.sort(by).map(x => x.f) };
  }
  // owners, developers, architects and contractors, LLC/Inc. variants merged
  const ROLE = { owner: 'Owner', dev: 'Developer', arch: 'Architect', gc: 'Contractor' };
  let ENT = null;
  function entities() {
    if (ENT) return ENT; const m = new Map();
    for (const f of F) for (const [r, raw] of [['owner', f.owner], ['dev', f.dev], ['arch', f.arch], ['gc', f.gc]]) {
      const k = ctx.entityKey(raw); if (!k) continue;
      let e = m.get(k); if (!e) m.set(k, e = { k, names: {}, roles: new Set(), ids: new Set(), v: 0, hay: '' });
      e.names[raw] = (e.names[raw] || 0) + 1; e.roles.add(r); if (!e.ids.has(f.id)) { e.ids.add(f.id); e.v += f.cost; }
    }
    ENT = [...m.values()].map(e => ({ ...e, label: Object.entries(e.names).sort((a, b) => b[1] - a[1])[0][0], hay: low(Object.keys(e.names).join(' · ') + ' ' + e.k) }));
    return ENT;
  }
  function searchEntities(text) {
    const toks = low(text).split(/\s+/).filter(x => x.length > 1); if (!toks.length || text.trim().length < 3) return [];
    return entities().filter(e => matches(e.hay, toks)).sort((a, b) => b.v - a.v).slice(0, 8);
  }
  function localPlaces(text) {
    const t = low(text).replace(/\s+county$/, '').trim(); if (t.length < 2) return [];
    const m = text.match(COORDS);
    if (m) { let a = +m[1], b = +m[2], lat = a, lon = b; if (Math.abs(a) > 90) { lon = a; lat = b; } return [{ label: lat.toFixed(5) + ', ' + lon.toFixed(5), kind: 'coords', c: [lon, lat] }]; }
    const cs = COUNTIES.filter(c => low(c).startsWith(t)).map(c => ({ label: c + ' County', name: c, kind: 'county', c: DATA.counties.find(x => x.name === c).label }));
    const ts = (DATA.places || []).filter(p => low(p[0]).startsWith(t)).slice(0, 4).map(p => ({ label: p[0] + ', TX', name: p[0], kind: 'town', c: [p[1], p[2]] }));
    return cs.concat(ts);
  }

  // ---------- results: Addresses · Places · Projects · Companies & people · Filings at matching addresses ----------
  let names = [], addrs = [], ents = [], shownA = 0;
  // ---------- businesses by name: Overture / Foursquare places and OpenStreetMap near the map center + Texas Comptroller sales-tax permits in nearby towns ----------
  let biz = [], bizPending = false, bizT = 0; const bizCache = new Map();
  // Google place suggestions (only when the site has a Google key; src/google.js)
  let gs = [], gsT = 0;
  const bizWorthy = t => t.length >= 3 && !COORDS.test(t) && !/^\d/.test(t) && !/^\d{5}$/.test(t);
  async function businesses(text, near) {
    const c = near ? { lng: near[0], lat: near[1] } : map.getCenter(), lat = +c.lat.toFixed(2), lon = +c.lng.toFixed(2), key = low(text) + '|' + lat + ',' + lon;
    if (bizCache.has(key)) return bizCache.get(key);
    const towns = (DATA.places || []).map(p => [p[0], (p[1] - lon) ** 2 + (p[2] - lat) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 25).map(p => p[0]);
    const get = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
    // Overture / Foursquare places first (fast, complete in the suburbs), then OpenStreetMap, then the Comptroller
    const [p, o, t] = await Promise.all([get('api/places?' + new URLSearchParams({ q: text, near: lat + ',' + lon, n: '8' })), get('api/nearby?' + new URLSearchParams({ mode: 'business', name: text, lat, lon, limit: '8' })), get('api/tenants?' + new URLSearchParams({ name: text, cities: towns.join(',') }))]);
    const open = (p?.places || []).map(x => ({ src: 'places', name: x.name, kind: x.cat || '', address: [x.addr, x.city].filter(Boolean).join(', '), lat: x.lat, lon: x.lon, miles: x.km != null ? +(x.km * 0.6214).toFixed(2) : undefined }));
    const out = mergeBusinesses([...open, ...(o?.places || [])], t?.tenants || [], 8); if (p || o || t) bizCache.set(key, out); return out;
  }
  function run(text) {
    q = text.trim(); clearB.hidden = !q; remote = []; enterWait = false; biz = []; clearTimeout(bizT); gs = []; clearTimeout(gsT);
    if (q.length >= 3 && !COORDS.test(q) && ctx.google?.enabled()) { const my0 = seq + 1, c = map.getCenter(); gsT = setTimeout(async () => { const g = await ctx.google.suggest(q, [c.lng, c.lat]).catch(() => []); if (my0 !== seq) return; gs = g.slice(0, 5); render(); }, 380); }
    bizPending = !!q && bizWorthy(q);
    if (bizPending) { const my0 = seq + 1; bizT = setTimeout(async () => { const b = await businesses(q); if (my0 !== seq) return; biz = b; bizPending = false; render(); }, 450); }
    if (!q) { pending = false; close(); return; }
    ({ names, addrs } = searchFilings(q)); ents = searchEntities(q);
    clearTimeout(geoT); const my = ++seq;
    pending = q.length >= 3 && !COORDS.test(q);
    shown = Math.min(PAGE, names.length); shownA = Math.min(names.length ? 3 : PAGE, addrs.length); active = -1; render();
    if (pending) geoT = setTimeout(async () => {
      let g = await ctx.geocode(q, { limit: 10 }); if (my !== seq) return;
      // nothing back for an abbreviated street ("1004 Priya Ln")? ask again with it spelled out
      const full = expandAbbr(q);
      if (!g.some(x => x.type === 'address') && full !== q) { const g2 = await ctx.geocode(full, { limit: 10 }); if (my !== seq) return; if (g2.length) g = g2.concat(g.filter(x => !g2.some(y => y.t === x.t))); }
      const have = new Set(localPlaces(q).map(p => low(p.label)));
      remote = g.filter(x => !have.has(low(x.name) + ', tx')).map(x => ({ label: x.t, name: x.name, kind: kindFromMaptiler(x.type), c: x.c, bbox: x.bbox }));
      pending = false; render();
      if (enterWait) { enterWait = false; if (items.length) pick(0); else if (names.length || addrs.length) applyKeyword(); }
    }, 220);
  }
  const sec = (title, extra = '') => '<div class="ms-sec"><span>' + title + '</span>' + extra + '</div>';
  function render() {
    const addresses = remote.filter(p => p.kind === 'address').slice(0, 5);
    const places = localPlaces(q).concat(remote.filter(p => p.kind !== 'address')).slice(0, 6);
    const vis = new Set(ctx.visible), filingRow = f => '<b>' + esc(f.name) + '</b><i>' + fmtM(f.cost) + '</i><span>' + esc([f.addr || f.city, f.owner].filter(Boolean).join(' · ')) + (f.approx ? ' · <em>approx. location</em>' : '') + (vis.has(f) ? '' : ' · <em>hidden by filters</em>') + '</span>';
    items = []; let h = '';
    const push = (it, inner) => { items.push(it); h += btn(items.length - 1, inner); };
    if (addresses.length) { h += sec('Addresses'); addresses.forEach(p => push({ t: 'place', p }, '<b>' + esc(p.label) + '</b><i>Address</i>')); }
    if (places.length) { h += sec('Places'); places.forEach(p => push({ t: 'place', p }, '<b>' + esc(p.label) + '</b><i>' + esc(KIND_LABEL[p.kind] || 'Place') + '</i>')); }
    if (biz.length) { h += sec('Businesses');
      biz.forEach(b => push({ t: 'biz', b }, '<b>' + esc(b.name) + '</b><i>' + (b.miles != null ? (+b.miles).toFixed(1) + ' mi' : 'Business') + '</i><span>' + esc([b.kind && b.kind[0].toUpperCase() + b.kind.slice(1), b.address].filter(Boolean).join(' · ') || (b.src === 'osm' ? 'OpenStreetMap' : 'Texas Comptroller')) + '</span>')); }
    else if (bizPending && q.length >= 3) h += sec('Businesses') + '<div class="ms-none sm">Looking up businesses…</div>';
    if (gs.length) { h += sec('Google', '<span class="g-pow">powered by Google</span>'); gs.forEach(g => push({ t: 'google', g }, '<b>' + esc(g.main) + '</b><i>Google</i><span>' + esc(g.secondary) + '</span>')); }
    if (names.length) {
      h += sec('Projects · ' + fmtN(names.length), '<button class="lnk" data-act="filter" type="button">Show All on Map</button>');
      names.slice(0, shown).forEach(f => push({ t: 'filing', f }, filingRow(f)));
      if (names.length > shown) h += '<button class="ms-more" data-act="more" type="button">Showing ' + shown + ' of ' + fmtN(names.length) + ' · show ' + Math.min(PAGE, names.length - shown) + ' more</button>';
    }
    if (ents.length) { h += sec('Companies & people');
      ents.forEach(e => push({ t: 'entity', e }, '<b>' + esc(e.label) + '</b><i>' + fmtN(e.ids.size) + ' project' + (e.ids.size > 1 ? 's' : '') + '</i><span>' + [...e.roles].map(r => ROLE[r]).join(' · ') + ' · est. ' + fmtM(e.v) + '</span>')); }
    if (addrs.length) {
      h += sec('Filings at matching addresses · ' + fmtN(addrs.length), names.length ? '' : '<button class="lnk" data-act="filter" type="button">Show All on Map</button>');
      addrs.slice(0, shownA).forEach(f => push({ t: 'filing', f }, filingRow(f)));
      if (addrs.length > shownA) h += '<button class="ms-more" data-act="moreA" type="button">Showing ' + shownA + ' of ' + fmtN(addrs.length) + ' · show more</button>';
    }
    if (pending) h = '<div class="ms-none">Searching addresses and places…</div>' + h;
    else if (!h) h = '<div class="ms-none">' + (q.length < 3 ? 'Keep typing…' : 'Nothing matches “' + esc(q) + '”. Try the street name without the number, or a ZIP code.') + '</div>';
    const top = res.scrollTop; res.innerHTML = h; res.scrollTop = top; if (document.activeElement === input || res.contains(document.activeElement) || res.classList.contains('on')) open();
    res.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => pick(+b.dataset.i); b.onmouseenter = () => setActive(+b.dataset.i, false); });
    res.querySelectorAll('[data-act=filter]').forEach(b => b.addEventListener('click', applyKeyword));
    res.querySelector('[data-act=more]')?.addEventListener('click', more);
    res.querySelector('[data-act=moreA]')?.addEventListener('click', moreA);
  }
  const btn = (i, inner) => '<button type="button" role="option" class="ms-it' + (i === active ? ' on' : '') + '" data-i="' + i + '">' + inner + '</button>';
  function more() { if (shown < names.length) { shown = Math.min(names.length, shown + PAGE); render(); } else moreA(); }
  function moreA() { if (shownA >= addrs.length) return; shownA = Math.min(addrs.length, shownA + PAGE); render(); }
  res.addEventListener('scroll', () => { if (res.scrollTop + res.clientHeight > res.scrollHeight - 40) more(); });
  function setActive(i, scroll = true) { active = i; res.querySelectorAll('.ms-it').forEach(b => b.classList.toggle('on', +b.dataset.i === i)); if (scroll) res.querySelector('.ms-it.on')?.scrollIntoView({ block: 'nearest' }); }
  function open() { res.classList.add('on'); input.setAttribute('aria-expanded', 'true'); }
  function close() { res.classList.remove('on'); input.setAttribute('aria-expanded', 'false'); }
  function applyKeyword() { seq++; clearTimeout(geoT); ctx.state.q = q; ctx.applyFilters(); close(); ctx.setView('map'); ctx.fitToVisible(); ctx.toast('Filtered to ' + fmtN(ctx.visible.length) + ' filings matching “' + q + '”.'); }
  // a company or person: the Activity filter when it covers all their projects, otherwise a keyword search on the name
  function showEntity(e) {
    ctx.setView('map'); ctx.state.q = '';
    const pick = ['dev', 'arch', 'gc'].map(k => ({ k, n: F.filter(f => ctx.entityKey(k === 'dev' ? (f.dev || f.owner) : f[k]) === e.k).length })).sort((a, b) => b.n - a.n)[0];
    if (pick.n >= e.ids.size) ctx.state.who = { k: pick.k, v: e.k, label: e.label };
    else { ctx.state.who = null; ctx.state.q = e.label; }
    ctx.applyFilters(); ctx.fitToVisible(); input.value = e.label; clearB.hidden = false;
    ctx.toast('Showing ' + fmtN(ctx.visible.length) + ' filings for ' + e.label + (ctx.visible.length < e.ids.size ? ' (some are outside the current date or type filters)' : '') + '.');
  }
  function pick(i) {
    const it = items[i]; if (!it) return; seq++; clearTimeout(geoT); close(); input.blur();
    if (it.t === 'filing') { ctx.setView('map'); ctx.select(it.f, true); return; }
    if (it.t === 'entity') { showEntity(it.e); return; }
    if (it.t === 'biz') { showBusiness(it.b); return; }
    if (it.t === 'google') { ctx.setView('map'); ctx.google.open(it.g.id); return; }
    showPlace(it.p);
  }
  // ⌘K (Mac) or Ctrl+K: jump to the map search from anywhere
  const MOD = /Mac|iPhone|iPad|iPod/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
  input.setAttribute('aria-keyshortcuts', MOD === '⌘' ? 'Meta+K' : 'Control+K');
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || (e.key || '').toLowerCase() !== 'k') return;
    e.preventDefault(); if (ctx.view !== 'map') ctx.setView('map');
    document.querySelector('.app')?.classList.contains('ai-open') && innerWidth <= 700 && document.getElementById('aiClose')?.click();
    input.focus(); input.select(); if (q) render();
  });
  let it0 = 0;
  input.addEventListener('input', () => { clearTimeout(it0); it0 = setTimeout(() => run(input.value), 90); });
  input.addEventListener('focus', () => { if (q) render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (active >= items.length - 1) more(); setActive(Math.min(items.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pick(active); else if (items.length) pick(0); else if (names.length || addrs.length) applyKeyword(); else { if (input.value.trim() !== q) { clearTimeout(it0); run(input.value); } enterWait = pending; } } // address lookup still running: pick its first hit when it lands
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
  const syncPlace = () => { map.getSource && map.getSource('place')?.setData(ctx.fc(place?.geom ? [{ type: 'Feature', properties: {}, geometry: place.geom }] : [])); ctx.syncClear?.(); };
  ctx.hasPlace = () => !!place;
  // the location marker: an amber pin with the place name, at the address / landmark or the middle of an outline
  let pin = null;
  function setPlacePin(c, label) {
    if (!c) { pin?.remove(); pin = null; return; }
    if (!pin) { const el = document.createElement('div'); el.className = 'ppin';
      el.innerHTML = '<svg width="30" height="40" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 33C13 33 2 20.5 2 12.5a11 11 0 0 1 22 0C24 20.5 13 33 13 33z" fill="#d48806" stroke="#fff" stroke-width="2"/><circle cx="13" cy="12.5" r="4.2" fill="#fff"/></svg><span></span>';
      pin = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(c).addTo(map); }
    else pin.setLngLat(c);
    pin.getElement().querySelector('span').textContent = String(label || '').split(',')[0];
  }
  ctx.setPlacePin = setPlacePin;
  function clearPlace() { place = null; syncPlace(); setPlacePin(null); bar.classList.remove('on'); bar.innerHTML = ''; }
  ctx.clearPlace = clearPlace;

  const isArea = g => g && /Polygon/.test(g.type);
  const isLine = g => g && /LineString/.test(g.type);
  async function nominatim(text, extra = '', world = false) {
    const u = NOMINATIM + '?format=geojson&polygon_geojson=1&polygon_threshold=0.0002&limit=6' + (world ? '' : '&countrycodes=us&viewbox=' + TX_VIEWBOX + '&bounded=1') + extra + '&q=' + encodeURIComponent(text);
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
  const flat = b => [b[0][0], b[0][1], b[1][0], b[1][1]]; // [[w,s],[e,n]] -> [w,s,e,n]
  // pick the Nominatim feature that best matches: wanted geometry type, closest to the point we already have
  const best = (feats, c, want) => feats.filter(f => want(f.geometry)).sort((a, b) => (c ? near(centerOf(a.geometry), c) : 0) - (c ? near(centerOf(b.geometry), c) : 0))[0];

  async function showPlace(p) {
    ctx.setView('map'); ctx.closeCard?.();
    place = { label: p.label, kind: p.kind, c: p.c, geom: null, ...(p.via ? { via: p.via, approx: !!p.approx } : {}), ...(p.within ? { within: p.within } : {}) }; setPlacePin(p.c, p.label);
    bar.innerHTML = '<div class="pb-k">' + esc(KIND_LABEL[p.kind] || 'Place') + '</div><div class="pb-t">' + esc(p.label) + '</div><div class="pb-s">Finding the outline…</div>'; bar.classList.add('on');
    let geom = null, note = '';
    if (p.geom) geom = p.geom;
    else if (p.kind === 'county') {
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
      if (hit && (!p.c || near(centerOf(hit.geometry), p.c) < (p.kind === 'town' || p.kind === 'zip' ? .35 : p.kind === 'area' ? .1 : .02))) geom = hit.geometry;
    }
    if (place?.label !== p.label) return; // a newer pick won
    if (!geom && p.bbox && /area|town|zip|county/.test(p.kind)) { const [w, s2, e, n] = p.bbox; geom = { type: 'Polygon', coordinates: [[[w, s2], [e, s2], [e, n], [w, n], [w, s2]]] }; note = 'Approximate outline (the area’s bounding box): OpenStreetMap has no boundary for it.'; }
    place.geom = geom ? (isArea(geom) ? ctx.fixWinding(geom) : geom) : null; syncPlace();
    const pt = p.c || (geom && centerOf(geom)); setPlacePin(pt, p.label);
    // an airport, campus, mall or park is bigger than one building: frame all of it (clear of the chat panel and card)
    const box = geom ? flat(bounds(geom)) : p.bbox, big = extentMeters(box) > BIG_PLACE_M;
    if (!big && (geom && isArea(geom) && /address|poi|building|business/.test(p.kind) || !geom && /address|poi|coords|business/.test(p.kind))) {
      // a single building: fly in close, then open the building panel (footprint highlight, parcel, businesses)
      map.flyTo({ center: pt, zoom: 18, pitch: 55, duration: ctx.reduceMotion ? 0 : 1600 });
      map.once('idle', () => { if (place?.label === p.label && !isArea(place.geom)) { const b = ctx.buildingAt?.(pt); if (b?.footprint) { place.geom = b.footprint; place.kind = 'building'; syncPlace(); placeCard(); } } });
    } else if (geom || big) ctx.fitBox([[box[0], box[1]], [box[2], box[3]]], { maxZoom: 17.5 });
    else if (pt) map.flyTo({ center: pt, zoom: p.kind === 'town' ? 12 : 14, duration: ctx.reduceMotion ? 0 : 1200 });
    if (p.via === 'web') note = [note, 'Found with a web search' + (p.approx ? '; the spot is approximate (OpenStreetMap has no outline for it).' : ' and matched in OpenStreetMap.')].filter(Boolean).join(' ');
    if (!geom && !/address|poi|coords|business/.test(p.kind)) note = 'No outline found for this place in OpenStreetMap, so it is shown as a point.';
    placeCard(note);
    return place;
  }
  ctx.showPlace = showPlace;
  // a business: OpenStreetMap ones have a point; Comptroller ones only an address, so geocode it first
  async function showBusiness(b) {
    let c = b.lat != null ? [b.lon, b.lat] : null;
    if (!c) { const g = await ctx.geocode(b.address + (b.zip ? ' ' + b.zip : '') + ', Texas', { exact: true }); const hit = g.find(x => x.type === 'address') || g[0]; if (hit) c = hit.c; }
    if (!c) { ctx.toast('Couldn’t place ' + b.name + ' on the map (' + b.address + ').'); return; }
    input.value = b.name; clearB.hidden = false;
    return showPlace({ label: b.name + (b.address ? ', ' + b.address : ''), name: b.name, kind: 'business', c });
  }

  // filings inside an area, or within a quarter mile of a road or point
  function placeHits() {
    const list = ctx.filtered(), g = place.geom;
    if (isArea(g) && !/building|business/.test(place.kind)) return { list: list.filter(f => inArea(g, [f.lon, f.lat])), how: 'inside' };
    const R = .25 / 3958.8, pt = place.c || (g && centerOf(g));
    if (isLine(g)) { const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates, b = bounds(g);
      return { list: list.filter(f => f.lon > b[0][0] - .01 && f.lon < b[1][0] + .01 && f.lat > b[0][1] - .01 && f.lat < b[1][1] + .01 && lines.some(l => l.some((p, i) => i && segDist([f.lon, f.lat], l[i - 1], p) < R))), how: 'within 0.25 mile' }; }
    return { list: pt ? list.filter(f => d3.geoDistance(pt, [f.lon, f.lat]) < R) : [], how: 'within 0.25 mile' };
  }
  function segDist(p, a, b) { // radians, small-distance approximation
    const k = Math.cos(p[1] * Math.PI / 180), ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(ax + t * dx, ay + t * dy) * Math.PI / 180; }

  function placeCard(note = '') {
    if (!place) return;
    const { list, how } = placeHits(), v = list.reduce((s, f) => s + f.cost, 0), area = isArea(place.geom) && !/building|business/.test(place.kind);
    const inCmp = ctx.compare?.list().some(a => a.key === 'place:' + place.label);
    bar.innerHTML = '<button class="x" aria-label="Clear" id="pbX">×</button><div class="pb-k">' + esc(KIND_LABEL[place.kind] || 'Place') + '</div><div class="pb-t">' + esc(place.label) + '</div>' +
      '<div class="pb-s">' + fmtN(list.length) + ' filing' + (list.length === 1 ? '' : 's') + ' ' + how + ' · est. ' + fmtM(v) + (ctx.filterText() ? '<span> (current filters)</span>' : '') + '</div>' + (note ? '<div class="pb-n">' + esc(note) + '</div>' : '') +
      '<div class="pb-a"><button class="btn primary" id="pbInfo">More Information</button>' + (area ? '<button class="btn" id="pbFilter">Filter to This Area</button><button class="btn" id="pbCmp"' + (inCmp ? ' disabled' : '') + '>+ Compare</button>' : '') +
        (list.length ? '<button class="btn" id="pbHl">Highlight ' + (list.length > 50 ? 'Top 50' : 'Them') + '</button>' : '') + '</div>';
    bar.classList.add('on');
    bar.querySelector('#pbX').onclick = clearPlace;
    bar.querySelector('#pbFilter')?.addEventListener('click', () => { const pl = place; ctx.setSelection('place', pl.label, pl.geom); clearPlace(); ctx.fitGeom(pl.geom); });
    bar.querySelector('#pbCmp')?.addEventListener('click', () => { if (ctx.compare.add({ key: 'place:' + place.label, label: place.label.split(',')[0], kind: place.kind, geom: place.geom })) placeCard(note); });
    bar.querySelector('#pbInfo').addEventListener('click', () => area ? areaCard() : pointInfo());
    bar.querySelector('#pbHl')?.addEventListener('click', () => { ctx.highlight(list.slice().sort((a, b) => b.cost - a.cost).slice(0, 50), place.label); });
  }
  ctx.onChange(() => { if (place && bar.classList.contains('on') && place.geom !== undefined) placeCard(); });

  // "More Information" on an address, landmark, building or coordinates: the location card (parcel, size, lidar height,
  // filings, businesses, Drive Time, Weather, Site Imagery, News), using the building footprint under the point when there is one
  function pointInfo() {
    const pt = place.c || centerOf(place.geom);
    const fp = /building|business/.test(place.kind) && isArea(place.geom) ? place.geom : ctx.buildingAt?.(pt)?.footprint || null;
    ctx.openBuildingAt(pt, fp);
  }
  // "More Information" on a town, county, neighborhood or ZIP: an area summary card with the headline metrics,
  // top uses and the largest projects inside it
  function areaCard() {
    const pl = place, card = ctx.card, { list } = placeHits(), keys = ctx.kpiKeys?.() || DEFAULT_KPIS;
    const uses = new Map(); list.forEach(f => { const k = f.use || 'Unclassified', u = uses.get(k) || [k, 0, 0]; u[1]++; u[2] += f.cost; uses.set(k, u); });
    const topUses = [...uses.values()].sort((a, b) => b[2] - a[2]).slice(0, 6), top = list.slice().sort((a, b) => b.cost - a.cost).slice(0, 5), tot = list.reduce((s, f) => s + f.cost, 0) || 1;
    const inCmp = ctx.compare?.list().some(a => a.key === 'place:' + pl.label);
    ctx.closeCard();
    card.innerHTML = '<div class="top"><div><div class="kicker">' + esc(KIND_LABEL[pl.kind] || 'Area') + ' summary</div><h2>' + esc(pl.label) + '</h2><div class="bsub">' + fmtN(list.length) + ' filing' + (list.length === 1 ? '' : 's') + ' inside' + (ctx.filterText() ? ' (current filters)' : '') + '</div></div>' +
      '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>' +
      '<div class="bacts"><button class="btn primary" id="acFilter">Filter to This Area</button><button class="btn" id="acCmp"' + (inCmp ? ' disabled' : '') + '>+ Compare</button></div>' +
      '<div class="acm">' + keys.map(k => { const m = BY_KEY.get(k); if (!m) return ''; const v = m.fmt(m.fn(list)); return '<div><b title="' + esc(v) + '">' + esc(v) + '</b><span>' + esc(m.short || m.label) + '</span></div>'; }).join('') + '</div>' +
      (topUses.length ? '<div class="bsec"><div class="lt">Top uses by value</div>' + topUses.map(u => '<div class="acu"><span>' + esc(u[0]) + '</span><i style="width:' + Math.max(2, Math.round(u[2] / tot * 100)) + '%"></i><b>' + fmtN(u[1]) + ' · ' + fmtM(u[2]) + '</b></div>').join('') + '</div>' : '') +
      (top.length ? '<div class="bsec"><div class="lt">Largest projects</div>' + top.map((f, i) => '<button class="acp" data-i="' + i + '"><b>' + esc(f.name) + '</b><span>' + esc([f.use || ctx.TYPE_LABEL?.[f.type], f.city, f.reg].filter(Boolean).join(' · ')) + '</span><em>' + fmtM(f.cost) + '</em></button>').join('') + '</div>'
        : '<div class="bsec"><div class="rnote">No filings inside this area match the current filters.</div></div>');
    card.classList.add('open');
    card.querySelector('.x').onclick = () => ctx.closeCard();
    card.querySelectorAll('.acp').forEach(b => b.onclick = () => ctx.select(top[+b.dataset.i], true));
    card.querySelector('#acFilter').onclick = () => { ctx.closeCard(); ctx.setSelection('place', pl.label, pl.geom); clearPlace(); ctx.fitGeom(pl.geom); };
    card.querySelector('#acCmp').onclick = e => { if (ctx.compare.add({ key: 'place:' + pl.label, label: pl.label.split(',')[0], kind: pl.kind, geom: pl.geom })) { e.currentTarget.disabled = true; if (place === pl) placeCard(); } };
  }

  // one name as OpenStreetMap or the geocoder knows it -> the place to show (or null)
  async function findWhole(t, k) {
    const d = (!k || /area|town/.test(k)) && districtFor(t);
    if (d) return { label: d.name, name: d.name, kind: 'area', c: d.c, geom: d.geom };
    const county = COUNTIES.find(c => t.toLowerCase().replace(/\s+county.*$/, '') === c.toLowerCase());
    if (county && (!k || k === 'county')) return { label: county + ' County', name: county, kind: 'county', c: DATA.counties.find(x => x.name === county).label };
    // "Lyon, France", "Bavaria, Germany": outline it wherever it is; otherwise Texas
    const ctxPart = t.split(',').slice(1).join(',').trim(), far = !!ctxPart && !/\b(tx|texas|usa|us|united states)\b/i.test(ctxPart) && !(DATA.places || []).some(p => p[0].toLowerCase() === ctxPart.toLowerCase());
    const q = far || /texas|\btx\b/i.test(t) ? t : t + ', Texas', areaish = !k || /area|town|county|zip|road/.test(k);
    // "Downtown Houston" must not resolve to a skyscraper in it: area-type asks search places and streets only
    let feats = await nominatim(q, areaish && k !== null ? '&layer=address' : '', far);
    const AT = { area: /suburb|neighbourhood|quarter|city_district|borough|district/, town: /city|town|village|hamlet|municipality/, county: /^county$/, zip: /postcode/ };
    const type = x => x.properties.addresstype || x.properties.type || '';
    const want = x => k === 'road' ? x.properties.category === 'highway' : k === 'building' ? /building|amenity|leisure|shop|tourism|office|man_made/.test(x.properties.category) : AT[k] ? AT[k].test(type(x)) : true;
    const rank = x => (want(x) ? 0 : 2) + (isArea(x.geometry) || isLine(x.geometry) ? 0 : 1);
    let f = feats.slice().sort((a2, b2) => rank(a2) - rank(b2))[0];
    if (!f || (areaish && k !== 'road' && !isArea(f.geometry))) {
      // no outline in OpenStreetMap: let the geocoder place it (its bounding box becomes an approximate outline)
      const g = pickPlace(t, await ctx.geocode(q, far ? { world: true } : { exact: true }));
      if (!g.error && (!f || /area|town|zip|county/.test(g.kind))) return { label: g.label.replace(/, United States$/, ''), name: g.label.split(',')[0], kind: g.kind, c: g.c, bbox: g.bbox };
      if (!f) return null;
    }
    const c = centerOf(f.geometry), pr = f.properties, at = type(f);
    const kk = pr.category === 'highway' ? 'road' : at === 'county' ? 'county' : AT.town.test(at) ? 'town' : AT.area.test(at) ? 'area' : at === 'postcode' ? 'zip' : /building|amenity|shop|office|tourism|leisure/.test(pr.category) ? 'poi' : (k || 'poi');
    const parts = pr.display_name.split(',').map(x => x.trim()), name = pr.name || parts[0];
    const label = far ? [name, parts[parts.length - 1]].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') : kk === 'county' ? (/county/i.test(name) ? name : name + ' County') : kk === 'town' ? name + ', TX' : [name, parts.find((x, i) => i && /^[A-Za-z .'-]+$/.test(x) && x !== name && !/county|texas|united states/i.test(x))].filter(Boolean).join(', ');
    return { label, name: kk === 'county' ? name.replace(/\s+county$/i, '') : name, kind: kk, c, ...(isArea(f.geometry) ? { geom: f.geometry } : {}) };
  }

  // OpenStreetMap features named like `part` inside a bounding box [w,s,e,n] (or within `around` metres of a point),
  // best first: the exact name, then outlines over lines over points
  async function overpassNamed(part, box, around) {
    // regex characters become "any character" (no escaping through Overpass's string rules)
    const re = part.replace(/^the\s+/i, '').replace(/[\\.*+?^${}()|[\]"']/g, '.'), area = around ? '(around:' + around.m + ',' + around.c[1] + ',' + around.c[0] + ')' : '(' + [box[1], box[0], box[3], box[2]].map(x => x.toFixed(5)).join(',') + ')';
    const body = '[out:json][timeout:20];nwr[~"^(name|alt_name|official_name|short_name)$"~"' + re + '",i]' + area + ';out geom 40;';
    let els = [];
    try { const r = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(body), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(22000) }); if (r.ok) els = (await r.json()).elements || []; } catch (e) { return []; }
    const low = x => String(x || '').toLowerCase().replace(/^the\s+/, '').trim(), want = low(part);
    return els.map(el => { const t = el.tags || {}, name = t.name || t.official_name || t.alt_name || t.short_name || '';
      const ring = l => l.map(p => [p.lon, p.lat]), closed = l => l.length > 3 && l[0].lat === l[l.length - 1].lat && l[0].lon === l[l.length - 1].lon;
      let geom = null;
      if (el.type === 'way' && el.geometry?.length > 1) geom = closed(el.geometry) ? { type: 'Polygon', coordinates: [ring(el.geometry)] } : { type: 'LineString', coordinates: ring(el.geometry) };
      else if (el.type === 'relation') { const outer = (el.members || []).filter(m => m.role === 'outer' && m.geometry && closed(m.geometry)); if (outer.length) geom = { type: 'MultiPolygon', coordinates: outer.map(m => [ring(m.geometry)]) }; }
      const c = geom ? centerOf(geom) : el.lat != null ? [el.lon, el.lat] : el.center ? [el.center.lon, el.center.lat] : null;
      const exact = [t.name, t.official_name, t.alt_name, t.short_name].some(n => low(n) === want);
      return c && { name, c, geom: geom && isArea(geom) ? ctx.fixWinding(geom) : geom, kindTag: t.aeroway || t.building || t.amenity || t.shop || t.leisure || '', score: (exact ? 0 : 4) + (geom && isArea(geom) ? 0 : geom ? 1 : 2) };
    }).filter(Boolean).sort((a, b) => a.score - b.score);
  }
  // "Terminal B" inside "George Bush Intercontinental Airport": find the bigger place's outline, then the part inside it
  async function findWithin(part, within) {
    const far = !!within.split(',')[1] && !/\b(tx|texas|usa|us|united states)\b/i.test(within.split(',').slice(1).join(','));
    const host = (await findWhole(applyPlaceAlias(within), null)); if (!host) return null;
    let hostGeom = host.geom || null;
    if (!hostGeom) { const feats = await nominatim(far ? within : applyPlaceAlias(within) + ', Texas', '', far); hostGeom = best(feats, host.c, isArea)?.geometry || null; }
    const box = hostGeom ? flat(bounds(hostGeom)) : host.bbox || (host.c && [host.c[0] - .03, host.c[1] - .03, host.c[0] + .03, host.c[1] + .03]); if (!box) return null;
    const inHost = c => !hostGeom || !isArea(hostGeom) || inArea(hostGeom, c);
    const hostName = host.label.split(',')[0];
    let hit = (await overpassNamed(part, box)).find(x => inHost(x.c));
    if (!hit) { // the geocoder, held to the bigger place's box
      const f = (await nominatim(part, '&viewbox=' + [box[0], box[3], box[2], box[1]].join(',') + '&bounded=1', true)).find(x => inHost(centerOf(x.geometry)));
      if (f) hit = { name: f.properties.name || part, c: centerOf(f.geometry), geom: isArea(f.geometry) ? f.geometry : null };
    }
    if (!hit) return null;
    const big = hit.geom && extentMeters(flat(bounds(hit.geom))) > BIG_PLACE_M;
    return { label: (hit.name || part) + ', ' + hostName, name: hit.name || part, kind: hit.geom && !big ? 'building' : 'poi', c: hit.c, geom: hit.geom, within: hostName };
  }
  // last resort: a web search for the official name, the bigger place it's part of, the address and roughly where it is,
  // then checked against OpenStreetMap; raw coordinates from the search are only used when nothing there matches
  async function locateWeb(text, k) {
    let w = null;
    try { const r = await fetch('api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'locate', query: text }) }); if (r.ok) w = await r.json(); } catch (e) {}
    if (!w || (!w.name && w.lat == null)) return null;
    const pt = isFinite(w.lat) && isFinite(w.lon) && w.lat !== null ? [+w.lon, +w.lat] : null, name = w.name || text;
    let s = w.within ? await findWithin(name, w.within) : null;
    if (!s && pt) { const hit = (await overpassNamed(name, null, { c: pt, m: 1500 }))[0]; if (hit) s = { label: hit.name + (w.city ? ', ' + w.city : ''), name: hit.name, kind: hit.geom && isArea(hit.geom) && extentMeters(flat(bounds(hit.geom))) <= BIG_PLACE_M ? 'building' : 'poi', c: hit.c, geom: hit.geom }; }
    if (!s) { const g = await findWhole(applyPlaceAlias(name + (w.city ? ', ' + w.city : '')), k); if (g && mentions(g.label + ' ' + (g.name || ''), name)) s = g; }
    if (!s && w.address) { const g = pickPlace(w.address, await ctx.geocode(w.address + (/texas|\btx\b/i.test(w.address) ? '' : ', Texas'), { exact: true })); if (!g.error) s = { label: name + ', ' + g.label, name, kind: 'poi', c: g.c }; }
    if (!s && pt) s = { label: name + (w.city ? ', ' + w.city : ''), name, kind: 'poi', c: pt, approx: true };
    return s && { ...s, via: 'web', ...(w.official ? { official: w.official } : {}) };
  }
  // for the assistant: the whole name first ("The Grove at Katy" is a place), then a part of a bigger place ("Terminal B
  // at George Bush airport", or `within` given), then the web. A whole-name hit that skips the part ("George Bush
  // Intercontinental Airport" for "Terminal B at …") doesn't count.
  ctx.findPlace = async (text, kind, within, web = true) => {
    const k = kind && kind !== 'auto' ? kind : null, t = String(text || '').trim(); if (!t) return null;
    const sp = within ? { part: t, within: String(within).trim() } : splitWithin(t);
    if (!within) { const s = await findWhole(applyPlaceAlias(t), k); if (s && (!sp.within || mentions(s.label + ' ' + (s.name || ''), sp.part))) return s; }
    if (sp.within) { const s = await findWithin(sp.part, sp.within); if (s) return s; }
    return web ? locateWeb(within ? t + ' at ' + within : t, k) : null;
  };
  // for the assistant's find tool: everything the search box looks through, as plain rows with coordinates. Addresses
  // and places (MapTiler, the loaded towns and counties), businesses by name around `near` (Overture / Foursquare,
  // OpenStreetMap, Comptroller permits), construction projects (by name, address, TABS number or tenant), and owners,
  // developers, architects and contractors from the filings.
  ctx.searchEverything = async (text, { near = null, limit = 6 } = {}) => {
    const t = String(text || '').trim(); if (!t) return { error: 'Say what to look for.' };
    const c = near || [map.getCenter().lng, map.getCenter().lat];
    const geo = t.length >= 3 && !COORDS.test(t) ? ctx.geocode(t, { limit: 8 }).then(async g => { const full = expandAbbr(t); if (!g.some(x => x.type === 'address') && full !== t) { const g2 = await ctx.geocode(full, { limit: 8 }); if (g2.length) return g2.concat(g); } return g; }).catch(() => []) : Promise.resolve([]);
    const [g, b] = await Promise.all([geo, bizWorthy(t) ? businesses(t, c).catch(() => []) : Promise.resolve([])]);
    const { names, addrs } = searchFilings(t), round = v => v == null ? null : +(+v).toFixed(6);
    const placeRows = localPlaces(t).map(p => ({ name: p.label, kind: KIND_LABEL[p.kind] || 'Place', lat: round(p.c[1]), lon: round(p.c[0]) }))
      .concat(g.map(x => ({ name: x.t, kind: KIND_LABEL[kindFromMaptiler(x.type)] || 'Place', lat: round(x.c[1]), lon: round(x.c[0]) })));
    const seen = new Set(), uniq = rows => rows.filter(r => { const k = r.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const projects = names.concat(addrs).slice(0, limit).map(f => ({ name: f.name, kind: 'Construction project', id: f.id, address: f.addr || f.city, value: f.cost, owner: f.owner || null, lat: round(f.lat), lon: round(f.lon), approx_location: !!f.approx }));
    const companies = searchEntities(t).slice(0, limit).map(e => ({ name: e.label, kind: 'Company in the filings (' + [...e.roles].map(r => ROLE[r]).join(', ') + ')', filings: e.ids.size, total_value: e.v, filing_ids: [...e.ids].slice(0, 8) }));
    return {
      addresses: uniq(placeRows.filter(r => r.kind === 'Address')).slice(0, limit), places: uniq(placeRows.filter(r => r.kind !== 'Address')).slice(0, limit),
      businesses: b.slice(0, limit).map(x => ({ name: x.name, kind: x.kind || 'Business', address: x.address || null, lat: round(x.lat), lon: round(x.lon), miles_from_search_point: x.miles ?? null })),
      projects, companies
    };
  };
  ctx.highlightPlace = async (text, kind, within) => { const p = await ctx.findPlace(text, kind, within); return p ? showPlace(p) : null; };
  ctx.placeSummary = () => { if (!place) return null; const { list, how } = placeHits(); return { place: place.label, kind: place.kind, outlined: !!place.geom, filings: list.length, how, total_value: list.reduce((s, f) => s + f.cost, 0) }; };
  ctx.currentPlace = () => place;
  // the location card's "Filings Within 0.25 Mile": the radius tool takes over from the searched place
  ctx.nearHere = (pt, label) => { clearPlace(); ctx.setMiles(.25, false, true); ctx.setRadiusCenter(pt, label, true); };
}
