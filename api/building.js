// Building lookup for the click-in panel: GET /api/building?lat=..&lon=..
//   parcel: Texas GIO StratMap land parcels (statewide county appraisal data, free ArcGIS service)
//   places: named businesses within ~80 m from OpenStreetMap (Overpass API, free)
//   photo:  nearest Mapillary street-level image (free; only when MAPILLARY_TOKEN is set)
// Every part is optional: a failing source returns an error string for that section, never a 500.
import { rateLimit } from './_lib/guard.mjs';

const PARCELS = process.env.PARCEL_SERVICE || 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0';
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (building panel)' };

async function getJSON(url, opts = {}, ms = 8000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { ...UA, ...(opts.headers || {}) } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'timed out' : e.message); }
  finally { clearTimeout(t); }
}

// StratMap field names vary a little by year; look them up case-insensitively.
const pick = (a, ...keys) => { for (const k of keys) { const hit = Object.keys(a).find(x => x.toLowerCase() === k.toLowerCase()); if (hit && a[hit] != null && String(a[hit]).trim() !== '' && String(a[hit]).trim() !== '0') return a[hit]; } return null; };
const num = v => { const n = Number(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
function fmtDate(v) {
  if (v == null) return null;
  if (typeof v === 'number' && v > 1e11) return new Date(v).toISOString().slice(0, 10); // epoch ms
  const s = String(v).trim(); if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6); return s.slice(0, 20);
}
export function normalizeParcel(attrs, geometry) {
  const a = attrs || {}, area = num(pick(a, 'GIS_AREA', 'LEGAL_AREA')), unit = pick(a, 'GIS_AREA_UNIT', 'LGL_AREA_UNIT');
  const mail = [pick(a, 'MAIL_LINE1', 'MAIL_ADDR'), pick(a, 'MAIL_LINE2'), [pick(a, 'MAIL_CITY'), pick(a, 'MAIL_STAT', 'MAIL_STATE'), pick(a, 'MAIL_ZIP')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const situs = pick(a, 'SITUS_ADDR') || [pick(a, 'SITUS_NUM'), pick(a, 'SITUS_STREET', 'SITUS_STRE', 'SITUS_ST_1')].filter(Boolean).join(' ');
  const raw = Object.fromEntries(Object.entries(a).filter(([k, v]) => v != null && String(v).trim() !== '' && !/^(objectid|shape|globalid)/i.test(k)).slice(0, 60).map(([k, v]) => [k, String(v).slice(0, 160)]));
  return {
    propId: pick(a, 'PROP_ID', 'GEO_ID'), owner: pick(a, 'OWNER_NAME'), mailing: mail || null,
    situs: situs ? [situs, pick(a, 'SITUS_CITY')].filter(Boolean).join(', ') : null, county: pick(a, 'COUNTY'),
    landUse: pick(a, 'LOC_LAND_USE', 'LAND_USE', 'STATE_CD'), marketValue: num(pick(a, 'MKT_VALUE')), landValue: num(pick(a, 'LAND_VALUE')),
    improvementValue: num(pick(a, 'IMP_VALUE')), yearBuilt: pick(a, 'YEAR_BUILT'), acquired: fmtDate(pick(a, 'DATE_ACQ', 'DEED_DATE')), taxYear: pick(a, 'TAX_YEAR'),
    area: area ? Math.round(area * 100) / 100 + (unit ? ' ' + String(unit).toLowerCase() : '') : null, raw,
    geometry: geometry?.rings ? { type: 'Polygon', coordinates: geometry.rings } : null
  };
}

async function parcel(lat, lon) {
  // the StratMap service refuses /query; map-click "identify" on the service is what it answers
  const q = new URLSearchParams({ geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:' + (PARCELS.match(/\/(\d+)$/) || [0, 0])[1], tolerance: '1',
    mapExtent: [lon - .002, lat - .002, lon + .002, lat + .002].join(','), imageDisplay: '400,400,96', returnGeometry: 'true', f: 'json' });
  const d = await getJSON(PARCELS.replace(/\/\d+$/, '') + '/identify?' + q);
  if (d.error) throw new Error(d.error.message || 'service error');
  const f = (d.results || [])[0];
  return f ? normalizeParcel(f.attributes, f.geometry) : null;
}

const KINDS = ['shop', 'amenity', 'office', 'healthcare', 'craft', 'leisure', 'tourism', 'club'];
async function places(lat, lon) {
  const ql = `[out:json][timeout:12];nwr(around:80,${lat},${lon})[name][~"^(${KINDS.join('|')})$"~"."];out tags center 40;`;
  const d = await getJSON(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: ql }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 13000);
  return (d.elements || []).map(e => {
    const t = e.tags || {}, k = KINDS.find(x => t[x]), c = e.center || e;
    return { name: String(t.name).slice(0, 120), kind: k ? (t[k] === 'yes' ? k : t[k].replace(/_/g, ' ')) : '', brand: t.brand || '', lat: c.lat, lon: c.lon };
  }).filter(p => p.lat != null);
}

async function photo(lat, lon) {
  const token = process.env.MAPILLARY_TOKEN; if (!token) return null;
  const d = 0.0008, q = new URLSearchParams({ access_token: token, fields: 'id,thumb_1024_url,captured_at,geometry', bbox: [lon - d, lat - d, lon + d, lat + d].join(','), limit: '25' });
  const r = await getJSON('https://graph.mapillary.com/images?' + q);
  const best = (r.data || []).filter(x => x.geometry?.coordinates).sort((a, b) => Math.hypot(a.geometry.coordinates[0] - lon, a.geometry.coordinates[1] - lat) - Math.hypot(b.geometry.coordinates[0] - lon, b.geometry.coordinates[1] - lat))[0];
  return best ? { thumb: best.thumb_1024_url, captured: best.captured_at ? new Date(best.captured_at).toISOString().slice(0, 10) : '', link: 'https://www.mapillary.com/app/?pKey=' + best.id } : null;
}

export default async function handler(req, res) {
  const lat = +req.query.lat, lon = +req.query.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 25 || lat > 37 || lon < -107 || lon > -93) return res.status(400).json({ error: 'lat/lon must be inside Texas' });
  if (!rateLimit(req, res, { perMinute: 30, perDay: 600 })) return;
  const r5 = v => Math.round(v * 1e5) / 1e5;
  const [p, pl, ph] = await Promise.allSettled([parcel(r5(lat), r5(lon)), places(r5(lat), r5(lon)), photo(r5(lat), r5(lon))]);
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.json({
    parcel: p.status === 'fulfilled' ? p.value : null, parcelError: p.status === 'rejected' ? p.reason.message : undefined,
    places: pl.status === 'fulfilled' ? pl.value : [], placesError: pl.status === 'rejected' ? pl.reason.message : undefined,
    photo: ph.status === 'fulfilled' ? ph.value : null
  });
}
