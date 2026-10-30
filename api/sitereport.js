// One-click site reports for the parcel on the card (src/sitereports.js): the data gathered here, the page built by the plain
// report builders (lib/reports/parcelmap.mjs, topo.mjs, siteenv.mjs, rings.mjs) and rendered to a PDF (lib/pdf.mjs, unbranded).
//   POST { kind: 'parcel' | 'topo' | 'environmental' | 'area', parcels: [card parcel], center: [lon, lat], label } -> application/pdf
// card parcel: the appraisal record the building card shows (api/building.js normalizeParcel: propId, owner, mailing, situs,
// situsCity, situsZip, county, landUse, marketValue, landValue, improvementValue, yearBuilt, acquired, taxYear, area, legal,
// buildingSqft, geometry) or a Regrid record mapped to the same names. Each kind fetches only what it needs:
//   parcel        site facts at the centre (api/site.js: flood, traffic, districts, schools, city limits)
//   topo          USGS 3DEP ground over the site and a few hundred feet round it, wider than tall like the page (api/terrain.js)
//   environmental the environmental and FEMA reports for the parcel outline (api/env.js, api/fema.js) and the flood zone
//   area          the census tracts and TDLR filings already in the app (data/market.json, data/filings.json, data/area.json)
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { load } from './_lib/data.mjs';
import { render, resetBrowser } from '../lib/pdf.mjs';
import { parcelReport } from '../lib/reports/parcelmap.mjs';
import { topoReport } from '../lib/reports/topo.mjs';
import { siteEnvReport } from '../lib/reports/siteenv.mjs';
import { ringsReport } from '../lib/reports/rings.mjs';
import { pngDataUrl } from '../lib/reports/png.mjs';
import { frame } from '../lib/siteplan.mjs';
import { NWI, SDA, soilWkt, soilMapQuery, parseSoils, fieldVal } from '../lib/env.mjs';

export const KINDS = { parcel: 'Parcel Map', topo: 'Topography', environmental: 'Site Environmental', area: 'Area Report' };
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };
const outer = g => g?.type === 'Polygon' ? g.coordinates[0] : g?.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]).sort((a, b) => b.length - a.length)[0] : null;
// the card's parcel record in the report's names
export function toRecord(p) {
  const acres = num(String(p.area || '').match(/[\d.,]+/)?.[0]) ?? num(p.acres);
  return { id: p.propId || p.id || '—', owner: p.owner, mail: p.mailing || p.mail, situs: p.situsStreet || (p.situs || '').split(',')[0], city: p.situsCity || p.city, county: p.county, state: 'TX', zip: p.situsZip || p.zip,
    landUse: p.landUse, zoning: p.zoning, zoningDesc: p.zoningDesc, acres, sqft: acres ? Math.round(acres * 43560) : null, land: num(p.landValue ?? p.land), improv: num(p.improvementValue ?? p.improv), total: num(p.marketValue ?? p.total),
    valueType: p.marketValue != null ? 'Market value' : p.valueType, taxYear: p.taxYear, legal: p.legal, lastSale: p.acquired || p.lastSale, yearBuilt: p.yearBuilt, bldgSf: num(p.buildingSqft ?? p.bldgSf), subdivision: p.subdivision,
    geom: outer(p.geometry) || p.geom || [] };
}
const titleOf = (label, recs) => label || recs.map(r => r.situs).filter(Boolean)[0] || 'Selected parcel';
const areaOf = recs => [...new Set(recs.map(r => r.county).filter(Boolean))].map(c => /county/i.test(c) ? c : c + ' County').join(', ') + (recs.length ? ', TX' : '');
const today = () => new Date().toISOString().slice(0, 10);
const inRingFt = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };

// the site facts the parcel map shows
async function siteFacts([lon, lat]) {
  try { const { site } = await import('./site.js'), d = await site(lon, lat);
    const arr = v => Array.isArray(v) ? v : [];
    return { flood: d.flood && !d.flood.error ? d.flood : null, traffic: arr(d.traffic?.roads), schools: arr(d.districts?.schools), districts: arr(d.districts?.water).map(w => w.name || w), oz: d.districts?.opportunityZone === true,
      city: d.place && !d.place.error ? d.place.name : null, near: arr(d.near).map(n => n.name) };
  } catch (e) { return {}; }
}
// the ground round the site: the site's box grown to at least 300 ft each side and to the page's 720 x 560 shape
export function topoBox(ring) {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]); let x0 = Math.min(...xs) - 300, x1 = Math.max(...xs) + 300, y0 = Math.min(...ys) - 300, y1 = Math.max(...ys) + 300;
  const want = 720 / 560, w = x1 - x0, h = y1 - y0; if (w / h < want) { const d = (h * want - w) / 2; x0 -= d; x1 += d; } else { const d = (w / want - h) / 2; y0 -= d; y1 += d; }
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

// WKT polygons (lon lat) -> [[ring in ft, …]] (each polygon's outer ring and holes together)
export function wktPolys(wkt, F) {
  const body = String(wkt || '').trim(); if (!/^(MULTI)?POLYGON/i.test(body)) return [];
  const polys = body.replace(/^MULTIPOLYGON\s*\(|^POLYGON\s*/i, '').split(/\)\s*\)\s*,\s*\(\s*\(/);
  return polys.map(pg => pg.replace(/[()]+$|^[()]+/g, '').split(/\)\s*,\s*\(/).map(r => r.replace(/[()]/g, '').split(',').map(pt => { const [x, y] = pt.trim().split(/\s+/).map(Number); return F.toFt([x, y]); }).filter(p => p.every(Number.isFinite))).filter(r => r.length > 2));
}
// the layers the environmental report draws, over the same box as the topography (the parcel plus 300 ft or more, the
// page's shape): FEMA flood zones, NWI wetlands, soil map units and lidar. Each is best effort: a failure is named, not hidden.
export async function envLayers(center, recs, { terrain = true } = {}) {
  const F = frame(center), box4 = topoBox(recs.flatMap(r => r.geom).map(p => F.toFt(p))), ll = box4.map(p => F.toLL(p)), env = { xmin: ll[0][0], ymin: ll[0][1], xmax: ll[2][0], ymax: ll[2][1], spatialReference: { wkid: 4326 } }, errors = {};
  const arc = async (url, outFields) => { const r = await fetch(url + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'RealEstateIntelligence/1.0 (site environmental)' }, signal: AbortSignal.timeout(25000),
    body: new URLSearchParams({ f: 'json', geometry: JSON.stringify(env), geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'true', maxAllowableOffset: '0.00002', geometryPrecision: '6' }) });
    if (!r.ok) throw new Error(new URL(url).host + ' ' + r.status); const d = await r.json(); if (d.error) throw new Error(d.error.message || 'service error'); return (d.features || []).filter(f => f.geometry?.rings?.length); };
  const rings = f => f.geometry.rings.map(r => r.map(p => F.toFt(p)));
  const tryAgain = async fn => { try { return await fn(); } catch (e) { return await fn(); } }; // (these services fail now and then; once more)
  const [flood, wetlands, soils, T] = await Promise.allSettled([
    (async () => { const { NFHL } = await import('./fema.js'); return (await tryAgain(() => arc(NFHL + '/28', 'FLD_ZONE,ZONE_SUBTY,SFHA_TF'))).map(f => ({ zone: f.attributes.FLD_ZONE, sub: f.attributes.ZONE_SUBTY, sfha: f.attributes.SFHA_TF, rings: rings(f) })); })(),
    (async () => (await tryAgain(() => arc(NWI + '/0', '*'))).map(f => ({ type: fieldVal(f.attributes, 'WETLAND_TYPE'), code: fieldVal(f.attributes, 'ATTRIBUTE'), acres: +fieldVal(f.attributes, 'ACRES') || undefined, rings: rings(f) })))(),
    (async () => { const wkt = soilWkt({ type: 'Polygon', coordinates: [ll.concat([ll[0]])] }); const r = await tryAgain(async () => { const x = await fetch(SDA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ format: 'JSON+COLUMNNAME', query: soilMapQuery(wkt) }) }); if (!x.ok) throw new Error('USDA soil data ' + x.status); return x.json(); });
      const t = r?.Table || [], h = t[0] || [], wi = h.indexOf('wkt'), info = new Map(parseSoils(r).map(x => [x.name, x]));
      return t.slice(1).map(row => { const name = row[h.indexOf('muname')]; return { mukey: row[h.indexOf('mukey')], name, info: info.get(name), rings: wktPolys(row[wi], F).flat() }; }).filter(x => x.rings.length); })(),
    terrain ? (async () => { const { terrainFor } = await import('./terrain.js'); return terrainFor(center, box4, Date.now(), { meteo: false }); })() : Promise.resolve(null)]);
  for (const [k, v] of Object.entries({ flood, wetlands, soils, terrain: T })) if (v.status === 'rejected') errors[k] = v.reason?.message || 'failed';
  const val = v => v.status === 'fulfilled' ? v.value : null;
  return { F, box: [box4[0], box4[2]], flood: val(flood) || [], wetlands: val(wetlands) || [], soils: val(soils) || [], terrain: val(T), errors };
}

export async function buildHtml(kind, { parcels, center, label }) {
  const recs = parcels.map(toRecord), title = titleOf(label, recs), area = areaOf(recs), date = today(), geometry = { type: 'MultiPolygon', coordinates: recs.filter(r => r.geom.length > 2).map(r => [r.geom]) };
  if (kind === 'parcel') return parcelReport({ title, area, date, parcels: recs, site: await siteFacts(center), source: parcels[0]?.source || 'County appraisal district' });
  if (kind === 'topo') {
    const { terrainFor } = await import('./terrain.js'), F = frame(center), ring = recs[0].geom.slice(0, recs[0].geom.length > 3 && recs[0].geom[0][0] === recs[0].geom.at(-1)[0] ? -1 : undefined).map(p => F.toFt(p));
    const box = topoBox(recs.flatMap(r => r.geom).map(p => F.toFt(p))), T = await terrainFor(center, box, Date.now(), { meteo: false });
    return topoReport({ title, area, date, terrain: T, ring, origin: center, png: pngDataUrl });
  }
  if (kind === 'environmental') {
    const [{ envReport }, { femaReport }, facts] = await Promise.all([import('./env.js'), import('./fema.js'), siteFacts(center)]);
    const [env, fema, layers] = await Promise.all([envReport(geometry, { label: title }).catch(e => ({ kinds: {}, error: e.message })), femaReport(geometry, { label: title }).catch(() => ({})), envLayers(center, recs).catch(e => ({ errors: { all: e.message } }))]);
    // the wetlands search in the records came back empty-handed but the map has them: the map's answer stands for both
    if (env.kinds?.wetlands?.error && layers.wetlands && !layers.errors?.wetlands) { const F = layers.F, on = layers.wetlands.filter(w => recs.some(r => r.geom.some(p => w.rings.some(rg => inRingFt(F.toFt(p), rg)))));
      env.kinds.wetlands = { ...env.kinds.wetlands, error: undefined, count: layers.wetlands.length, onsite: on.length, nearest: on.slice(0, 5).map(w => ({ name: w.type || 'Wetland', addr: w.code, mi: 0 })), note: 'from the map area round the parcel' }; }
    const F = layers.F || frame(center), ring = recs[0].geom.slice(0, recs[0].geom.length > 3 && recs[0].geom[0][0] === recs[0].geom.at(-1)[0] ? -1 : undefined).map(p => F.toFt(p));
    const soilInfo = (env.soils?.list || []).concat((layers.soils || []).map(s => s.info).filter(Boolean)).filter((x, i, a) => a.findIndex(y => y.name === x.name) === i);
    return siteEnvReport({ title, area, date, env: { ...env, soils: { ...(env.soils || {}), list: soilInfo } }, fema, flood: facts.flood, parcelLabel: recs.length > 1 ? recs.length + ' parcels · searched from their outlines' : 'Parcel ' + recs[0].id + ' · searched from its outline',
      maps: layers.box ? { ring, origin: center, F, layers, png: pngDataUrl } : null });
  }
  if (kind === 'area') {
    const [m, f, a] = await Promise.all([load('market.json'), load('filings.json'), load('area.json').catch(() => null)]), zip = recs[0].zip;
    const un = a?.unemployment?.counties ? Object.values(a.unemployment.counties).find(c => recs[0].county && String(c.name).toLowerCase() === String(recs[0].county).replace(/ county/i, '').toLowerCase()) : null;
    return ringsReport({ title, area, date, center, site: recs[0].geom, tracts: m.tracts, filings: f.filings, period: f.period, zip, zipRent: zip ? a?.rents?.zips?.[zip] : null, unemployment: un, acsYear: m.year ? (m.year - 4) + '–' + m.year : '' });
  }
  throw Object.assign(new Error('Unknown report: ' + kind), { status: 400 });
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 10, perDay: 300 })) return;
  // GET ?kind=&lat=&lon=[&format=html]: the same report for the parcel at a point (its appraisal record looked up here), for
  // a link or a check of a deployment; html returns the page instead of the PDF
  let b;
  if (req.method === 'GET') { const q = req.query || {}, lat = +q.lat, lon = +q.lon; if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'GET ?kind=&lat=&lon=' });
    const { parcel } = await import('./building.js'), p = await parcel(lat, lon).catch(() => null); if (!p?.geometry) return res.status(404).json({ error: 'No parcel outline at that point.' });
    b = { kind: q.kind, parcels: [p], center: [lon, lat], label: p.situs || '', html: q.format === 'html' }; }
  else if (req.method !== 'POST') return res.status(405).json({ error: 'POST { kind, parcels, center, label }' });
  else b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const kind = String(b.kind || ''), center = Array.isArray(b.center) && b.center.length === 2 && b.center.every(Number.isFinite) ? b.center.map(Number) : null;
  const parcels = Array.isArray(b.parcels) ? b.parcels.slice(0, 20).filter(p => p && (p.geometry || p.geom)) : [];
  if (!KINDS[kind]) return res.status(400).json({ error: 'kind is one of ' + Object.keys(KINDS).join(', ') + '.' });
  if (!center || !parcels.length) return res.status(400).json({ error: 'Open a parcel with an outline first: the report is drawn from it.' });
  try {
    const html = await buildHtml(kind, { parcels, center, label: String(b.label || '').slice(0, 160) });
    if (b.html === true) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.status(200).send(html); }
    const pdf = await render(html, { title: KINDS[kind], brand: false });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    console.error('sitereport', kind, e.message); if (!e.status) resetBrowser();
    return res.status(e.status || 502).json({ error: 'The ' + KINDS[kind] + ' couldn’t be made: ' + e.message.slice(0, 240) });
  }
}
