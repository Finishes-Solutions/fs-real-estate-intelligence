// Results of "what's the nearest …" (assistant tool nearby_places): purple markers with names and distances,
// plus a ring on the point they were measured from.
export function initNearby(ctx) {
  const { map, fc } = ctx;
  let data = fc([]), origin = fc([]);
  ctx.onOverlays(() => {
    if (!map.getSource('nearby')) map.addSource('nearby', { type: 'geojson', data });
    if (!map.getSource('nearby-o')) map.addSource('nearby-o', { type: 'geojson', data: origin });
    const lab = ctx.isDark() ? '#e9d8fd' : '#44337a', halo = ctx.isDark() ? '#16191a' : '#ffffff';
    if (!map.getLayer('nearby-o')) map.addLayer({ id: 'nearby-o', type: 'circle', source: 'nearby-o', paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#6b46c1', 'circle-stroke-width': 2.5 } });
    if (!map.getLayer('nearby-pt')) map.addLayer({ id: 'nearby-pt', type: 'circle', source: 'nearby', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 8], 'circle-color': '#6b46c1', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    if (!map.getLayer('nearby-n')) map.addLayer({ id: 'nearby-n', type: 'symbol', source: 'nearby', layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
    if (!map.getLayer('nearby-l')) map.addLayer({ id: 'nearby-l', type: 'symbol', source: 'nearby', layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11.5, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 14, 'text-optional': true }, paint: { 'text-color': lab, 'text-halo-color': halo, 'text-halo-width': 1.6 } });
  });
  const sync = () => { map.getSource('nearby')?.setData(data); map.getSource('nearby-o')?.setData(origin); };
  ctx.showNearby = (places, o) => {
    data = fc(places.map((p, i) => ({ type: 'Feature', properties: { n: String(i + 1), label: p.name + ' · ' + (p.miles < 10 ? p.miles.toFixed(1) : Math.round(p.miles)) + ' mi' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })));
    origin = fc(o ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: o } }] : []); sync();
    const pts = places.map(p => [p.lon, p.lat]).concat(o ? [o] : []); if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = .004;
    try { map.fitBounds([[Math.min(...xs) - pad, Math.min(...ys) - pad], [Math.max(...xs) + pad, Math.max(...ys) + pad]], { padding: { top: 140, bottom: 60, left: 60, right: document.getElementById('card')?.classList.contains('open') && innerWidth > 700 ? 460 : 60 }, maxZoom: 15.5, duration: ctx.reduceMotion ? 0 : 900 }); } catch (e) { map.flyTo({ center: o || pts[0], zoom: 12 }); }
  };
  ctx.clearNearby = () => { data = fc([]); origin = fc([]); sync(); };
  map.on('click', 'nearby-pt', e => { const f = e.features[0]; ctx.toast(f.properties.label); });
}
