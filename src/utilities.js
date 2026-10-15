// Utilities: the "Utilities" row on a property card (nearest power lines and substation, the water and sewer service
// providers, public mains where published) and the "Power, Water & Sewer Lines" map layer. Data from api/utilities.
import { summaryLines, distText, sizeText } from './lib/utilities.mjs';
import { getJSON, errorBox, friendly, unavailable, layerFailed, layerOK } from './reportkit.js';

export function initUtilities(ctx) {
  const { map, esc } = ctx, cache = new Map();
  // utilities near a parcel (from its edge) or a point; cached while the app is open
  ctx.utilitiesAt = (center, geometry) => {
    const k = geometry ? JSON.stringify(geometry).slice(0, 2000) : center[0].toFixed(5) + ',' + center[1].toFixed(5);
    if (!cache.has(k)) {
      const p = geometry ? getJSON('api/utilities', { what: 'Utility data', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ geometry }) }) : getJSON('api/utilities?lat=' + center[1].toFixed(5) + '&lon=' + center[0].toFixed(5), { what: 'Utility data' });
      p.catch(() => cache.delete(k)); cache.set(k, p);
    }
    return cache.get(k);
  };
  ctx.utilityFacts = d => summaryLines(d);

  // the card row: filled in when the answer comes back, so the rest of the Site section isn't held up
  ctx.renderUtilities = async (slot, center, parcel) => {
    if (!slot) return;
    slot.innerHTML = '<span class="sc">Checking power, water and sewer…</span>';
    let d; try { d = await ctx.utilitiesAt(center, parcel?.geometry || null); } catch (e) { if (slot.isConnected) { slot.replaceChildren(errorBox(e, () => ctx.renderUtilities(slot, center, parcel), 'Utility data')); } return; }
    if (!slot.isConnected) return;
    const p = d.power || {}, n = p.nearest || {}, out = [];
    const line = (l, what) => '<b>' + esc(distText(l.ft)) + '</b> ' + esc(what) + (l.kvText ? ' <span class="sc">' + esc(l.kvText) + '</span>' : '') + (l.operator ? ' <span class="sc">' + esc(l.operator) + '</span>' : '');
    if (p.error) out.push('<span class="sc">' + esc(unavailable('Power line data')) + '</span>');
    else {
      if (n.transmission) out.push('Power: ' + line(n.transmission, 'to a transmission line'));
      if (n.distribution) out.push((n.transmission ? '' : 'Power: ') + line(n.distribution, 'to a distribution line'));
      if (n.cable && !n.distribution) out.push(line(n.cable, 'to an underground power cable'));
      if (!n.transmission && !n.distribution && !n.cable) out.push('Power: <span class="sc">no lines mapped within ' + esc(distText(p.searchedFt || 2640)) + ' (street lines are often unmapped)</span>');
      const s = p.substations?.[0]; if (s) out.push('Substation: <b>' + esc(distText(s.ft)) + '</b> ' + esc(s.name) + (s.operator ? ' <span class="sc">' + esc(s.operator) + '</span>' : ''));
    }
    const prov = (x, w) => x?.error ? '<span class="sc">' + w + ' provider: unavailable</span>' : (x?.ccn || []).filter(c => c.utility || c.ccn).length ? w + ': ' + x.ccn.filter(c => c.utility || c.ccn).map(c => esc(c.utility || 'CCN') + (c.ccn ? ' <span class="sc">CCN ' + esc(c.ccn) + '</span>' : '')).join(', ') : w + ': <span class="sc">no CCN here (often a city or MUD)</span>';
    out.push(prov(d.water, 'Water'), prov(d.sewer, 'Sewer'));
    const main = (m, w) => '<b>' + esc(distText(m.ft)) + '</b> to a public ' + w + ' main' + (m.size || m.material ? ' <span class="sc">' + esc([sizeText(m.size), m.material].filter(Boolean).join(' ')) + '</span>' : '') + (m.owner ? ' <span class="sc">' + esc(m.owner) + '</span>' : '');
    if (d.water?.mains?.[0]) out.push(main(d.water.mains[0], 'water')); else if (d.water?.lines?.[0]) out.push('<b>' + esc(distText(d.water.lines[0].ft)) + '</b> to a mapped water utility line <span class="sc">CCN facility line</span>');
    if (d.sewer?.mains?.[0]) out.push(main(d.sewer.mains[0], 'sewer'));
    else if (d.sewer?.mainsNote === 'outside Houston') out.push('<span class="sc">Sewer and water mains: ask the city or MUD engineer (published for Houston only)</span>');
    slot.innerHTML = out.join('<br>');
  };

  // ---------- map layer ----------
  const SRC = 'util-lines', box = document.getElementById('lyUtil'), note = document.getElementById('lyUtilNote');
  let on = false; try { on = localStorage.getItem('fs-util') === '1'; } catch (e) {}
  let data = { type: 'FeatureCollection', features: [] }, lastKey = '', seq = 0, ctl = null;
  const say = t => { if (note) { note.hidden = !on; note.textContent = t; } };
  const IDS = ['util-sewer', 'util-water', 'util-dist', 'util-cable', 'util-tx', 'util-kv', 'util-sub'];
  function addLayers() {
    if (!on || !map.getStyle()) return;
    try {
      if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data, attribution: 'Power: © OpenStreetMap contributors · Mains: City of Houston' });
      const k = v => ['==', ['get', 'k'], v], add = l => { if (!map.getLayer(l.id)) map.addLayer({ source: SRC, ...l }); };
      add({ id: 'util-sewer', type: 'line', filter: k('sewer'), minzoom: 15, paint: { 'line-color': '#8d5a2b', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.2, 19, 3], 'line-opacity': .85 } });
      add({ id: 'util-water', type: 'line', filter: k('water'), minzoom: 15, paint: { 'line-color': '#1c7ed6', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.2, 19, 3], 'line-opacity': .85 } });
      add({ id: 'util-dist', type: 'line', filter: k('distribution'), paint: { 'line-color': '#f08c00', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, .8, 19, 2.2], 'line-opacity': .9 } });
      add({ id: 'util-cable', type: 'line', filter: k('cable'), paint: { 'line-color': '#f08c00', 'line-width': 1.4, 'line-dasharray': [2, 2] } });
      add({ id: 'util-tx', type: 'line', filter: k('transmission'), paint: { 'line-color': '#d9480f', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, ['case', ['>=', ['coalesce', ['get', 'kv'], 0], 300], 3, 2], 19, ['case', ['>=', ['coalesce', ['get', 'kv'], 0], 300], 6, 4]] } });
      add({ id: 'util-kv', type: 'symbol', filter: ['all', k('transmission'), ['has', 'kv']], minzoom: 15, layout: { 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'kv']], ' kV'], 'text-font': ['Noto Sans Bold'], 'text-size': 10 }, paint: { 'text-color': '#d9480f', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } });
      add({ id: 'util-sub', type: 'circle', filter: k('substation'), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 19, 9], 'circle-color': '#c92a2a', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
    } catch (e) { /* style loading */ }
  }
  const removeLayers = () => { try { for (const id of IDS) if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(SRC)) map.removeSource(SRC); } catch (e) {} };
  async function load() {
    if (!on) return; const z = map.getZoom(), my = ++seq;
    if (z < 14) { say('Zoom in to see power lines (and, in Houston, sewer and water mains at street zoom).'); return; }
    const b = map.getBounds(), r = v => Math.round(v * 100) / 100, zz = z >= 15 ? 15 : 14;
    const bb = [r(b.getWest()) - .01, r(b.getSouth()) - .01, r(b.getEast()) + .01, r(b.getNorth()) + .01].map(v => +v.toFixed(2));
    if ((bb[2] - bb[0]) * (bb[3] - bb[1]) > 0.004) { say('Zoom in a little to see utility lines.'); return; }
    const key = bb.join(',') + '&z=' + zz; if (key === lastKey) return;
    ctl?.abort(); ctl = new AbortController(); say('Loading utility lines…');
    try {
      const d = await getJSON('api/utilities?box=' + key, { what: 'Utility line data', signal: ctl.signal });
      if (my !== seq) return; lastKey = key; data = d; addLayers(); map.getSource(SRC)?.setData(d);
      const c = {}; for (const f of d.features) c[f.properties.k] = (c[f.properties.k] || 0) + 1;
      say(['Red: transmission lines (kV on the line)' + (c.transmission ? '' : ', none here'), 'orange: distribution lines' + (c.distribution ? '' : ', none mapped here'), 'dots: substations'].join('; ') +
        (zz >= 15 && (c.sewer || c.water) ? '; brown: public sewer mains' + (c.water ? ', blue: water mains' : '') + ' (City of Houston)' : zz < 15 ? '. Zoom in more for Houston sewer and water mains.' : '') +
        '. Power lines from OpenStreetMap: street lines are often unmapped.' + (d.errors?.length ? ' Some sources didn’t answer: ' + d.errors.join('; ') + '.' : ''));
    } catch (e) { if (e.name !== 'AbortError') layerFailed(ctx, e, { what: 'Utility line data', off: () => set(false), note }); }
  }
  function set(v) {
    on = !!v; try { localStorage.setItem('fs-util', on ? '1' : '0'); } catch (e) {}
    if (box) box.checked = on; if (note) note.hidden = !on; if (on) layerOK(note);
    if (!on) { removeLayers(); lastKey = ''; return; }
    addLayers(); load();
  }
  if (box) { box.checked = on; box.onchange = () => set(box.checked); }
  if (note) note.hidden = !on;
  ctx.onOverlays?.(() => { if (on) { removeLayers(); addLayers(); map.getSource(SRC)?.setData(data); } });
  map.on('moveend', () => { if (on) load(); });
  if (on) map.once('load', () => set(true));
  ctx.setUtilitiesLayer = set;
}
