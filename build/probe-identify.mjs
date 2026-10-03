// Diagnostic: the building card's parcel lookup (api/building.js identify on TxGIO StratMap) at a few known spots.
const BASE = 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer';
const PTS = [['Downtown Houston (909 Fannin)', 29.75795, -95.36305], ['Waller city', 30.05652, -95.92707], ['Katy Mills', 29.7726, -95.8053], ['Austin capitol', 30.2747, -97.7404]];
const j = async u => { const t = Date.now(); try { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); const x = await r.text(); return { s: r.status, ms: Date.now() - t, x }; } catch (e) { return { s: 'ERR ' + e.message, ms: Date.now() - t, x: '' }; } };
const meta = await j(BASE + '?f=json'); console.log('service', meta.s, meta.ms + 'ms', meta.x.slice(0, 300));
for (const [n, lat, lon] of PTS) {
  for (const tol of [1, 3]) {
    const q = new URLSearchParams({ geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:0', tolerance: String(tol), mapExtent: [lon - .002, lat - .002, lon + .002, lat + .002].join(','), imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' });
    const r = await j(BASE + '/identify?' + q); let d = {}; try { d = JSON.parse(r.x); } catch (e) {}
    console.log(n.padEnd(30), 'tol', tol, r.s, r.ms + 'ms', d.error ? 'ERROR ' + JSON.stringify(d.error).slice(0, 200) : 'results ' + (d.results || []).length, (d.results || [])[0] ? JSON.stringify(d.results[0].attributes).slice(0, 300) : r.x.slice(0, 160));
  }
}
