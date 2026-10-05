// Google Maps Platform in the app (only when keys are set on the server; see api/google.js):
//   Base maps "Google" and "Google Satellite": Google's own map tiles (Map Tiles API), with the Google logo and the
//   map data credits shown while they're on.
//   "Google 3D" (Property & Site): Google's photorealistic 3D city model (Photorealistic 3D Tiles, drawn with deck.gl)
//   in place of the OpenStreetMap blocks; buildings still open their property card.
//   Google place search in the map search box, and a Google place card. Google's terms ask for Google content to be
//   shown on a Google map with attribution, so opening a Google place switches the base map to Google first.
import { esc, openCard, cardTop, fillCard } from './reportkit.js';

const LOGO = 'https://maps.gstatic.com/mapfiles/api-3/images/google_white5_hdpi.png', LOGO_DARK = 'https://maps.gstatic.com/mapfiles/api-3/images/google4_hdpi.png';
const OFM = 'https://tiles.openfreemap.org';
const DECK = 'https://cdn.jsdelivr.net/npm/deck.gl@9.1/dist.min.js';

export function initGoogle(ctx) {
  const { map } = ctx;
  const st = { places: false, key: null, d3: false };
  const brand = document.createElement('div'); brand.className = 'g-brand'; brand.hidden = true; map.getContainer().appendChild(brand);
  let tilesCredit = '', credits3d = [], cardOpen = false;
  const isGoogleBase = () => /^(google|gsat)$/.test(ctx.basemap?.() || '');
  function paintBrand() {
    const on = isGoogleBase() || st.d3 || cardOpen; brand.hidden = !on; if (!on) return;
    const sat = ctx.basemap?.() === 'gsat' || st.d3, credit = [st.d3 ? credits3d.join('; ') : '', isGoogleBase() ? tilesCredit : ''].filter(Boolean).join(' · ') || 'Map data ©' + new Date().getFullYear() + ' Google';
    brand.innerHTML = '<img alt="Google" src="' + (sat ? LOGO : LOGO_DARK) + '"><span>' + esc(credit) + '</span>';
  }

  // ---------- keys and availability ----------
  const ready = fetch('api/google?status=1').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => {
    st.places = !!d.places; st.key = d.tiles_key || null;
    document.querySelectorAll('#styleSeg [data-style=google], #styleSeg [data-style=gsat]').forEach(b => { b.hidden = !st.key; });
    const row = document.getElementById('lyG3dRow'); if (row) row.hidden = !st.key;
    return st;
  });

  // ---------- 2D base maps (Map Tiles API sessions last about two weeks; reused from this browser) ----------
  async function session(kind) {
    const scale = devicePixelRatio > 1 ? 'scaleFactor2x' : 'scaleFactor1x', k = 'fs-gsess-' + kind + '-' + scale;
    try { const c = JSON.parse(localStorage.getItem(k) || 'null'); if (c && c.key === st.key && c.expiry * 1000 > Date.now() + 864e5) return c.session; } catch (e) {}
    const body = kind === 'gsat' ? { mapType: 'satellite', layerTypes: ['layerRoadmap'], language: 'en-US', region: 'US', scale } : { mapType: 'roadmap', language: 'en-US', region: 'US', scale };
    const r = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(st.key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({})); if (!r.ok || !d.session) throw new Error('Google map tiles refused the key (' + (d.error?.message || r.status) + '). Check that the Map Tiles API is on and the key allows this site.');
    try { localStorage.setItem(k, JSON.stringify({ session: d.session, expiry: +d.expiry, key: st.key })); } catch (e) {}
    return d.session;
  }
  let sess = null;
  ctx.googleStyle = async s => {
    await ready; if (!st.key) throw new Error('Google maps aren’t set up on this site.');
    sess = { kind: s, id: await session(s) };
    return { version: 8, glyphs: OFM + '/fonts/{fontstack}/{range}.pbf',
      sources: { google: { type: 'raster', tiles: ['https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=' + sess.id + '&key=' + encodeURIComponent(st.key)], tileSize: 256, maxzoom: 22 },
        // OpenStreetMap buildings (vector, not drawn as a map layer) so 3D buildings and building clicks keep working
        openmaptiles: { type: 'vector', url: OFM + '/planet', attribution: '© OpenStreetMap contributors (buildings)' } },
      layers: [{ id: 'google', type: 'raster', source: 'google' }] };
  };
  // the credits for what's on screen (the Map Tiles API viewport endpoint)
  let credT = 0;
  async function credit() {
    if (!isGoogleBase() || !sess) { paintBrand(); return; }
    const b = map.getBounds(), p = new URLSearchParams({ session: sess.id, key: st.key, zoom: String(Math.round(map.getZoom())), north: b.getNorth().toFixed(4), south: b.getSouth().toFixed(4), east: b.getEast().toFixed(4), west: b.getWest().toFixed(4) });
    try { const r = await fetch('https://tile.googleapis.com/tile/v1/viewport?' + p), d = await r.json(); tilesCredit = d.copyright || ''; } catch (e) {}
    paintBrand();
  }
  map.on('moveend', () => { clearTimeout(credT); credT = setTimeout(credit, 400); });
  map.on('style.load', () => { credit(); if (st.d3) add3d(); });

  // ---------- Photorealistic 3D Tiles ----------
  let overlay = null, deckP = null;
  const loadDeck = () => deckP ||= new Promise((ok, no) => { if (window.deck?.MapboxOverlay) return ok(); const s = document.createElement('script'); s.src = DECK; s.onload = () => window.deck?.MapboxOverlay ? ok() : no(new Error('3D library didn’t load')); s.onerror = () => no(new Error('3D library didn’t load')); document.head.appendChild(s); });
  function bldgOpacity(v) { try { if (map.getLayer('fs-bldg')) map.setPaintProperty('fs-bldg', 'fill-extrusion-opacity', v); } catch (e) {} }
  let bldgWas = null;
  async function add3d() {
    try {
      await loadDeck(); if (!st.d3) return;
      if (overlay) { try { map.removeControl(overlay); } catch (e) {} overlay = null; }
      const { MapboxOverlay, Tile3DLayer } = window.deck;
      overlay = new MapboxOverlay({ interleaved: true, layers: [new Tile3DLayer({ id: 'google-3d', data: 'https://tile.googleapis.com/v1/3dtiles/root.json',
        loadOptions: { fetch: { headers: { 'X-GOOG-API-KEY': st.key } } }, beforeId: map.getLayer('fs-bldg') ? 'fs-bldg' : undefined,
        onTilesetLoad: ts => { ts.options.onTraversalComplete = sel => { const c = new Set(); for (const t of sel) for (const x of String(t.content?.gltf?.asset?.copyright || '').split(';')) if (x.trim()) c.add(x.trim()); credits3d = [...c]; paintBrand(); return sel; }; },
        onTileError: e => console.warn('google 3d tile', e?.message || e) })] });
      map.addControl(overlay);
      if (bldgWas == null) { try { bldgWas = map.getLayer('fs-bldg') ? map.getPaintProperty('fs-bldg', 'fill-extrusion-opacity') ?? 1 : 1; } catch (e) { bldgWas = 1; } }
      bldgOpacity(0); // the OpenStreetMap blocks stay (invisible) so a click still opens the building's card
    } catch (e) { ctx.toast?.(e.message); set3d(false); }
  }
  async function set3d(v) {
    await ready; const box = document.getElementById('lyG3d');
    if (v && !st.key) { ctx.toast?.('Google 3D isn’t set up on this site.'); v = false; }
    st.d3 = !!v; if (box) box.checked = st.d3;
    if (!st.d3) { if (overlay) { try { map.removeControl(overlay); } catch (e) {} overlay = null; } if (bldgWas != null) bldgOpacity(bldgWas); bldgWas = null; credits3d = []; paintBrand(); return; }
    paintBrand(); await add3d();
    if (map.getZoom() < 15) ctx.toast?.('Google 3D shows city detail from street zoom; tilt the map to see the buildings.');
    else if (map.getPitch() < 30) map.easeTo({ pitch: 55, duration: ctx.reduceMotion ? 0 : 800 });
  }
  const g3 = document.getElementById('lyG3d'); if (g3) g3.onchange = () => set3d(g3.checked);
  ctx.onOverlays?.(() => { if (st.d3) bldgOpacity(0); });

  // ---------- places (server key) ----------
  let token = null;
  const newToken = () => (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '');
  async function suggest(text, center) {
    await ready; if (!st.places) return [];
    token ||= newToken();
    const r = await fetch('api/google?' + new URLSearchParams({ ac: text, session: token, ...(center ? { near: center[1].toFixed(4) + ',' + center[0].toFixed(4) } : {}) }));
    const d = await r.json().catch(() => ({})); if (!r.ok) { if (d.capped) st.places = false; return []; } return d.suggestions || [];
  }
  async function open(id) {
    const tk = token; token = null; // a details call ends the search session
    ctx.closeCard?.();
    if (!isGoogleBase()) { const s = ctx.basemap?.() === 'sat' || ctx.basemap?.() === 'esri' ? 'gsat' : 'google'; ctx.setMapOptions?.({ basemap: s }); ctx.toast?.('Switched to the Google map to show a Google place.'); }
    const card = openCard(ctx, { kicker: 'Google place', title: 'Loading…', loading: 'Looking up the place on Google…' }); cardOpen = true; paintBrand();
    let p; try { const r = await fetch('api/google?' + new URLSearchParams({ place: id, ...(tk ? { session: tk } : {}) })), d = await r.json(); if (!r.ok) throw new Error(d.error || 'lookup failed'); p = d.place; }
    catch (e) { card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
    if (p.viewport?.every(Number.isFinite) && p.types?.some(t => /locality|neighborhood|postal_code|administrative|route/.test(t))) map.fitBounds([[p.viewport[0], p.viewport[1]], [p.viewport[2], p.viewport[3]]], { padding: 60, duration: ctx.reduceMotion ? 0 : 900 });
    else map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 17), duration: ctx.reduceMotion ? 0 : 1100 });
    ctx.setPlacePin?.([p.lon, p.lat], p.name);
    const stars = p.rating ? '★ ' + p.rating.toFixed(1) + (p.ratings ? ' (' + p.ratings.toLocaleString() + ')' : '') : '';
    fillCard(ctx, card, cardTop('Google place', p.name, esc([p.category, stars, p.status && p.status !== 'OPERATIONAL' ? p.status.replace(/_/g, ' ').toLowerCase() : ''].filter(Boolean).join(' · '))) +
      '<div class="bsec"><dl>' + (p.address ? '<dt>Address</dt><dd>' + esc(p.address) + '</dd>' : '') + (p.phone ? '<dt>Phone</dt><dd><a href="tel:' + esc(p.phone.replace(/[^\d+]/g, '')) + '">' + esc(p.phone) + '</a></dd>' : '') +
      (p.website ? '<dt>Website</dt><dd><a target="_blank" rel="noopener" href="' + esc(p.website) + '">' + esc(p.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)) + '</a></dd>' : '') + (p.open_now != null ? '<dt>Now</dt><dd>' + (p.open_now ? 'Open' : 'Closed') + '</dd>' : '') + '</dl>' +
      (p.hours?.length ? '<details class="raw"><summary>Hours</summary>' + p.hours.map(h => '<div class="pl"><span>' + esc(h) + '</span></div>').join('') + '</details>' : '') + '</div>' +
      '<div class="bacts"><button class="btn primary" type="button" id="gBldg">Building &amp; Parcel Here</button>' + (p.maps_url ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(p.maps_url) + '">Open in Google Maps</a>' : '') + '</div>' +
      '<div class="rnote bsec g-attr"><img alt="Google" src="' + LOGO_DARK + '"> Place details from Google Maps.</div>');
    card.querySelector('#gBldg').onclick = () => { const c = [p.lon, p.lat]; cardOpen = false; paintBrand(); if (!ctx.buildingAt?.(c)) ctx.openBuildingAt?.(c); };
  }
  ctx.onCardClose?.(() => { if (cardOpen) { cardOpen = false; paintBrand(); } });
  ctx.google = { ready, enabled: () => st.places, suggest, open, set3d, has3d: () => !!st.key };
}
