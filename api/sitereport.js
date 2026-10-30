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
    const [env, fema] = await Promise.all([envReport(geometry, { label: title }).catch(e => ({ kinds: {}, error: e.message })), femaReport(geometry, { label: title }).catch(() => ({}))]);
    return siteEnvReport({ title, area, date, env, fema, flood: facts.flood, parcelLabel: recs.length > 1 ? recs.length + ' parcels · searched from their outlines' : 'Parcel ' + recs[0].id + ' · searched from its outline' });
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST { kind, parcels, center, label }' });
  const b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const kind = String(b.kind || ''), center = Array.isArray(b.center) && b.center.length === 2 && b.center.every(Number.isFinite) ? b.center.map(Number) : null;
  const parcels = Array.isArray(b.parcels) ? b.parcels.slice(0, 20).filter(p => p && (p.geometry || p.geom)) : [];
  if (!KINDS[kind]) return res.status(400).json({ error: 'kind is one of ' + Object.keys(KINDS).join(', ') + '.' });
  if (!center || !parcels.length) return res.status(400).json({ error: 'Open a parcel with an outline first: the report is drawn from it.' });
  try {
    const html = await buildHtml(kind, { parcels, center, label: String(b.label || '').slice(0, 160) });
    const pdf = await render(html, { title: KINDS[kind], brand: false });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    console.error('sitereport', kind, e.message); if (!e.status) resetBrowser();
    return res.status(e.status || 502).json({ error: 'The ' + KINDS[kind] + ' couldn’t be made: ' + e.message.slice(0, 240) });
  }
}
