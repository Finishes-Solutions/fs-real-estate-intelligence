// High-resolution site imagery catalogs, used by api/imagery.js (catalog for a spot + same-origin tile proxy).
//   Esri World Imagery Wayback: every archived version of Esri's sub-metre basemap since 2014. Only the versions in
//     which the imagery at this spot actually changed are listed (Wayback's tilemap tells which release a tile comes
//     from), with the capture date from that version's metadata service when it answers.
//   USDA NAIP aerial photos (~0.6 m, Texas flown about every two years) from Microsoft Planetary Computer.
// Both are free and keyless. Every lookup fails soft: a source that doesn't answer is just left out.
const WAYBACK_CONFIG = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
export const WAYBACK = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery';
const PC = globalThis.process?.env?.PC_API || 'https://planetarycomputer.microsoft.com/api';
export const NAIP_Q = 'collection=naip&assets=image&asset_bidx=image%7C1%2C2%2C3';

async function j(url, opts = {}, fetchImpl = globalThis.fetch, ms = 8000) {
  const r = await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// web-mercator tile holding a point
export function tileOf([lon, lat], z) {
  const n = 2 ** z, s = Math.sin(lat * Math.PI / 180);
  return { z, x: Math.floor((lon + 180) / 360 * n), y: Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n) };
}
const toMerc = ([lon, lat]) => [lon * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];

// [{ r: release number, date: 'YYYY-MM-DD', meta: metadata service url }], newest first
export async function waybackReleases(fetchImpl) {
  const cfg = await j(WAYBACK_CONFIG, {}, fetchImpl);
  return Object.entries(cfg).map(([r, v]) => ({ r: +r, date: (String(v.itemTitle).match(/(\d{4}-\d\d-\d\d)/) || [])[1], meta: v.metadataLayerUrl }))
    .filter(x => x.date && x.r).sort((a, b) => b.date.localeCompare(a.date));
}

// Walk back from the newest release: the tilemap names the release this spot's tile really comes from ("select"),
// which is the last time the imagery here changed; then continue from the release before that one.
export async function waybackChanges(c, releases, { z = 17, max = 8, fetchImpl } = {}) {
  const t = tileOf(c, z), byR = new Map(releases.map((x, i) => [x.r, i])), out = [];
  let i = 0, calls = 0;
  while (i < releases.length && out.length < max && calls < max * 3) {
    calls++;
    let d; try { d = await j(WAYBACK + '/MapServer/tilemap/' + releases[i].r + '/' + t.z + '/' + t.y + '/' + t.x, {}, fetchImpl, 5000); } catch (e) { break; }
    if (!d || !Array.isArray(d.data) || !d.data[0]) break; // no imagery here at this release or older
    const sel = +(d.select?.[0] ?? releases[i].r), at = byR.has(sel) ? byR.get(sel) : i;
    out.push(releases[at]); i = Math.max(at, i) + 1;
  }
  if (out.length) return out;
  // tilemap unavailable: one version a year so the list still spans time (some may look alike)
  const seen = new Set(); return releases.filter(x => { const y = x.date.slice(0, 4); if (seen.has(y)) return false; seen.add(y); return true; }).slice(0, Math.min(max, 6)).map(x => ({ ...x, guessed: true }));
}

// Capture date and resolution of the imagery at a point in one Wayback release: the metadata service has one layer
// per scale band; pick the band that covers zoom z, then ask it what source covers the point.
const metaLayers = new Map();
export async function waybackCapture(c, rel, { z = 17, fetchImpl } = {}) {
  if (!rel.meta) return null;
  try {
    let layers = metaLayers.get(rel.meta);
    if (!layers) { layers = (await j(rel.meta + '?f=json', {}, fetchImpl, 5000)).layers || []; metaLayers.set(rel.meta, layers); }
    const scale = 591657527.591555 / 2 ** z;
    const L = layers.find(l => (!l.minScale || scale <= l.minScale) && (!l.maxScale || scale >= l.maxScale)) || layers[0]; if (!L) return null;
    const [x, y] = toMerc(c);
    const q = new URLSearchParams({ f: 'json', where: '1=1', outFields: '*', returnGeometry: 'false', geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects', inSR: '3857', geometry: JSON.stringify({ x, y, spatialReference: { wkid: 3857 } }) });
    const a = (await j(rel.meta + '/' + L.id + '/query?' + q, {}, fetchImpl, 5000)).features?.[0]?.attributes; if (!a) return null;
    const k = n => Object.keys(a).find(x => x.toUpperCase() === n);
    const t = a[k('SRC_DATE2')] ?? a[k('SRC_DATE')], date = typeof t === 'number' ? new Date(t).toISOString().slice(0, 10) : /^\d{8}$/.test(String(t)) ? String(t).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') : null;
    const res = +(a[k('SAMP_RES')] ?? a[k('SRC_RES')]); return { captured: date, res_m: res > 0 ? res : null, provider: a[k('NICE_DESC')] || a[k('SRC_DESC')] || null };
  } catch (e) { return null; }
}

// NAIP items covering the point, newest first: [{ id, date, gsd }]
export async function naipItems(c, fetchImpl) {
  const d = await j(PC + '/stac/v1/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collections: ['naip'], intersects: { type: 'Point', coordinates: c }, limit: 20 }) }, fetchImpl);
  const by = new Map();
  for (const f of d.features || []) {
    const date = String(f.properties?.datetime || '').slice(0, 10), yr = date.slice(0, 4); if (!yr) continue;
    // one per year; prefer the photo whose footprint has the point furthest from its edge
    const b = f.bbox, edge = b ? Math.min(c[0] - b[0], b[2] - c[0], c[1] - b[1], b[3] - c[1]) : 0, o = by.get(yr);
    if (!o || edge > o.edge) by.set(yr, { id: f.id, date, gsd: f.properties?.gsd || null, edge });
  }
  return [...by.values()].sort((a, b) => b.date.localeCompare(a.date)).map(({ edge, ...x }) => x);
}
// The data API's tile path changed between titiler versions; ask its tilejson which one this deployment serves.
let naipStyle = null;
export async function naipTileStyle(item, fetchImpl) {
  if (naipStyle) return naipStyle;
  for (const [style, path] of [['tms', '/data/v1/item/WebMercatorQuad/tilejson.json'], ['xyz', '/data/v1/item/tilejson.json']]) {
    try { const d = await j(PC + path + '?' + NAIP_Q + '&item=' + encodeURIComponent(item), {}, fetchImpl, 5000); if (d.tiles?.length) return naipStyle = style; } catch (e) {}
  }
  return 'tms';
}
export function naipTileUrl(item, style, z, x, y) {
  const q = NAIP_Q + '&item=' + encodeURIComponent(item);
  return style === 'xyz' ? PC + '/data/v1/item/tiles/' + z + '/' + x + '/' + y + '@1x.png?' + q : PC + '/data/v1/item/tiles/WebMercatorQuad/' + z + '/' + x + '/' + y + '@1x.png?' + q;
}
export const waybackTileUrl = (r, z, x, y) => WAYBACK + '/WMTS/1.0.0/default028mm/MapServer/tile/' + r + '/' + z + '/' + y + '/' + x;

// everything the site imagery panel needs for one spot
export async function imageryCatalog(c, fetchImpl = globalThis.fetch) {
  const [wb, naip] = await Promise.all([
    waybackReleases(fetchImpl).then(rel => waybackChanges(c, rel, { fetchImpl })).then(list => Promise.all(list.map(async x => ({ ...x, ...(await waybackCapture(c, x, { fetchImpl }) || {}) })))).catch(() => []),
    naipItems(c, fetchImpl).then(async list => list.length ? { list: list.slice(0, 4), style: await naipTileStyle(list[0].id, fetchImpl) } : { list: [], style: null }).catch(() => ({ list: [], style: null }))
  ]);
  return {
    wayback: wb.map(x => ({ release: x.r, published: x.date, captured: x.captured || null, res_m: x.res_m || null, provider: x.provider || null, ...(x.guessed ? { guessed: true } : {}) })),
    naip: naip.list.map(x => ({ item: x.id, date: x.date, gsd: x.gsd, style: naip.style }))
  };
}
