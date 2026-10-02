// Diagnostic: building heights from 3DEP lidar (Planetary Computer) for known buildings. Run in Actions ("Probe services", script=height).
import { lidarHeight, floorsFromHeight } from '../lib/height.mjs';
const box = (lon, lat, dx, dy) => ({ type: 'Polygon', coordinates: [[[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]]] });
const tests = [['JPMorgan Chase Tower (≈305 m, 75 fl)', -95.36338, 29.75993, .0003, .0003], ['Williams Tower (≈275 m, 64 fl)', -95.46155, 29.73727, .00025, .00025],
  ['Memorial Hermann Katy (hospital)', -95.80436, 29.78395, .0004, .0003], ['A Katy house', -95.79210, 29.80070, .00008, .00008], ['Waller county courthouse', -96.07763, 30.05665, .0002, .0002]];
const PC = 'https://planetarycomputer.microsoft.com/api';
for (const u of [PC + '/stac/v1/collections/3dep-lidar-hag', PC + '/stac/v1/collections/3dep-lidar-dsm']) {
  try { const r = await fetch(u); const d = await r.json(); console.log(u.split('/').pop(), r.status, d.title || d.detail, JSON.stringify(d.item_assets || {}).slice(0, 200)); } catch (e) { console.log(u, 'ERR', e.message); }
}
for (const [name, lon, lat, dx, dy] of tests) {
  const t = Date.now();
  try { const h = await lidarHeight(box(lon, lat, dx, dy), [lon, lat]); console.log(name, '→', JSON.stringify(h), '| floors ≈', floorsFromHeight(h.height_m), '|', Date.now() - t, 'ms'); }
  catch (e) { console.log(name, 'ERROR', e.message); }
}
for (const u of ['https://overpass-api.de/api/status', 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer?f=json']) {
  try { const r = await fetch(u); console.log(u, r.status, (await r.text()).slice(0, 120).replace(/\s+/g, ' ')); } catch (e) { console.log(u, 'ERR', e.message); }
}
