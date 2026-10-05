// Businesses & places (api/places: Overture Maps Places and Foursquare Open Source Places, merged, loaded monthly):
//   Map layer "Businesses & Places": every mapped business at street zoom, colored by group, with a group picker.
//   Place card: name, category, address, phone, website and the sources that list it.
//   ctx.placesNear(lat, lon, m) for the building card ("Businesses on the Block").
import { GROUPS, sourceText } from './lib/places.mjs';
import { esc, fmt, openCard, cardTop, fillCard } from './reportkit.js';

const SRC = 'places', MINZ = 14;

export function initPlaces(ctx) {
  const { map } = ctx, box = document.getElementById('lyPlaces'), note = document.getElementById('lyPlacesNote'), sel = document.getElementById('lyPlacesGrp');
  let on = false, grp = '', seq = 0, ctl = null, lastKey = '';
  try { on = localStorage.getItem('fs-places') === '1'; grp = localStorage.getItem('fs-places-grp') || ''; } catch (e) {}
  if (sel) { sel.innerHTML = '<option value="">All businesses &amp; places</option>' + Object.entries(GROUPS).map(([k, g]) => '<option value="' + k + '">' + esc(g.label) + '</option>').join(''); sel.value = GROUPS[grp] ? grp : ''; }

  const say = t => { if (note) note.textContent = t; };
  async function load() {
    if (!on) return; const my = ++seq, z = map.getZoom();
    if (z < MINZ - 0.5) { setData([]); lastKey = ''; say('Zoom in to street level to see businesses and places.'); return; }
    const b = map.getBounds(), r = v => Math.round(v * 500) / 500, pad = .004;
    const bb = [r(b.getWest()) - pad, r(b.getSouth()) - pad, r(b.getEast()) + pad, r(b.getNorth()) + pad].map(v => +v.toFixed(3));
    if ((bb[2] - bb[0]) * (bb[3] - bb[1]) > 0.03) { say('Zoom in a little to see businesses and places.'); return; }
    const key = bb.join(',') + (grp ? '&groups=' + grp : ''); if (key === lastKey && map.getSource(SRC)) return;
    ctl?.abort(); ctl = new AbortController();
    try {
      const res = await fetch('api/places?box=' + key, { signal: ctl.signal }), d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Places are unavailable right now.'); if (my !== seq) return; lastKey = key;
      setData(d.places || []);
      say(fmt((d.places || []).length) + (grp ? ' ' + GROUPS[grp].label.toLowerCase() : ' businesses and places') + ' in view' + (d.capped ? ' (the best-known ones; zoom in for all)' : '') + '. Click one for details.');
    } catch (e) { if (e.name !== 'AbortError') say(e.message); }
  }
  const color = ['match', ['get', 'g'], ...Object.entries(GROUPS).flatMap(([k, g]) => [k, g.color]), GROUPS.other.color];
  function setData(list) {
    const fc = { type: 'FeatureCollection', features: list.map(p => ({ type: 'Feature', properties: { id: p[0], name: p[1], g: p[2] }, geometry: { type: 'Point', coordinates: [p[3], p[4]] } })) };
    try {
      const s = map.getSource(SRC); if (s) { s.setData(fc); return; }
      map.addSource(SRC, { type: 'geojson', data: fc });
      const dark = ctx.isDark?.();
      map.addLayer({ id: SRC, type: 'circle', source: SRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.6, 16, 5, 19, 8], 'circle-color': color,
        'circle-stroke-color': dark ? '#111' : '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, .6, 17, 1.4] } });
      map.addLayer({ id: SRC + '-lbl', type: 'symbol', source: SRC, minzoom: 16.5, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5, 'text-offset': [0, .9], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true },
        paint: { 'text-color': dark ? '#e5e7eb' : '#1f2937', 'text-halo-color': dark ? '#111' : '#fff', 'text-halo-width': 1.4 } });
    } catch (e) { /* style loading */ }
  }
  function legend() {
    const used = grp ? [grp] : Object.keys(GROUPS).filter(k => k !== 'other');
    ctx.setLegend?.('places', '<div class="t">Businesses &amp; places</div><div class="lg2">' + used.map(k => '<div class="li" title="' + esc(GROUPS[k].label) + '"><i style="background:' + GROUPS[k].color + '"></i>' + esc(grp ? GROUPS[k].label : GROUPS[k].short) + '</div>').join('') + '</div>');
  }
  function setOn(v) {
    on = !!v; if (box) box.checked = on; if (note) note.hidden = !on; if (sel) sel.hidden = !on;
    try { localStorage.setItem('fs-places', on ? '1' : '0'); } catch (e) {}
    if (!on) { ctl?.abort(); lastKey = ''; try { for (const id of [SRC + '-lbl', SRC]) if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(SRC)) map.removeSource(SRC); } catch (e) {} ctx.setLegend?.('places', ''); return; }
    legend(); load();
    if (map.getZoom() < MINZ - 0.5) ctx.toast?.('Businesses show from street zoom: zoom in to see them.');
  }
  if (box) { box.checked = on; box.onchange = () => setOn(box.checked); }
  if (sel) { sel.hidden = !on; sel.onchange = () => { grp = sel.value; try { localStorage.setItem('fs-places-grp', grp); } catch (e) {} lastKey = ''; if (on) { legend(); load(); } else setOn(true); }; }
  if (note) note.hidden = !on;
  let moveT = 0; map.on('moveend', () => { if (on) { clearTimeout(moveT); moveT = setTimeout(load, 300); } });
  ctx.onOverlays?.(() => { if (on) { lastKey = ''; legend(); load(); } });
  ctx.placesLayer = (v, g) => { if (g !== undefined) { grp = GROUPS[g] ? g : ''; if (sel) sel.value = grp; lastKey = ''; } setOn(v !== false); };

  ctx.clickLayers?.push(SRC); // the map's own click doesn't also open the building under the dot
  map.on('click', SRC, e => { const f = e.features?.[0]; if (!f) return; ctx.tabs?.arm?.(e); show(f.properties.id); });
  map.on('mouseenter', SRC, e => { map.getCanvas().style.cursor = 'var(--cur-pointer)'; const f = e.features?.[0]; if (f && ctx.tip) { ctx.tip.textContent = f.properties.name; ctx.tip.style.opacity = 1; ctx.tip.style.left = (e.point.x + 12) + 'px'; ctx.tip.style.top = (e.point.y + 12) + 'px'; } });
  map.on('mouseleave', SRC, () => { map.getCanvas().style.cursor = ''; if (ctx.tip) ctx.tip.style.opacity = 0; });

  // ---------- place card ----------
  async function show(id) {
    const card = openCard(ctx, { kicker: 'Business / place', title: 'Loading…', loading: 'Looking up the place…' }), tid = 'p:' + id;
    ctx.tabs?.track?.({ id: tid, kind: 'place', label: 'Place', reopen: () => show(id) });
    const gone = () => ctx.tabs && ctx.tabs.active?.()?.id !== tid;
    let p; try { const r = await fetch('api/places?id=' + encodeURIComponent(id)); p = await r.json(); if (!r.ok) throw new Error(p.error || 'lookup failed'); }
    catch (e) { if (!gone()) card.querySelector('.bsec').innerHTML = '<div class="rnote err">' + esc(e.message) + '</div>'; return; }
    if (gone()) return;
    const g = GROUPS[p.grp] || GROUPS.other, addr = [p.addr, p.city, p.zip].filter(Boolean).join(', ');
    const gmaps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([p.name, addr].filter(Boolean).join(', ') || p.lat + ',' + p.lon);
    fillCard(ctx, card, cardTop('Business / place', p.name, '<span class="pl-dot" style="background:' + g.color + '"></span>' + esc([p.cat, g.label].filter(Boolean).join(' · '))) +
      '<div class="bsec"><dl>' + (addr ? '<dt>Address</dt><dd>' + esc(addr) + '</dd>' : '') + (p.phone ? '<dt>Phone</dt><dd><a href="tel:' + esc(p.phone.replace(/[^\d+]/g, '')) + '">' + esc(p.phone) + '</a></dd>' : '') +
      (p.web ? '<dt>Website</dt><dd><a target="_blank" rel="noopener" href="' + esc(p.web) + '">' + esc(p.web.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)) + '</a></dd>' : '') + (p.brand && p.brand !== p.name ? '<dt>Brand</dt><dd>' + esc(p.brand) + '</dd>' : '') + '</dl></div>' +
      '<div class="bacts"><button class="btn primary" type="button" id="plBldg">Building &amp; Parcel Here</button><a class="btn" target="_blank" rel="noopener" href="' + esc(gmaps) + '">Open in Google Maps</a></div>' +
      '<div class="rnote bsec src">Listed by ' + esc(sourceText(p.src)) + '. Open map data: hours, closures and exact positions can be out of date.</div>');
    ctx.tabs?.mount?.(); ctx.tabs?.label?.(tid, p.name);
    card.querySelector('#plBldg').onclick = () => { const c = [p.lon, p.lat]; if (!ctx.buildingAt?.(c)) ctx.openBuildingAt?.(c); };
  }
  ctx.showPlace = show;
  ctx.placesNear = async (lat, lon, m = 150) => { const r = await fetch('api/places?near=' + (+lat).toFixed(6) + ',' + (+lon).toFixed(6) + '&m=' + m); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'places unavailable'); return d.places || []; };
}
