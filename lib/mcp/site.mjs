// MCP tools about one property or site (api/mcp.js): find_property, site_facts, flood, terrain, environmental, utilities,
// traffic_counts. Each reads the same functions the website's endpoints use (no HTTP calls back into this app), every part
// fails on its own with a short note, and every answer names its sources, their dates and their coverage.
import { resolve, areaOf, areaLabel, whereLine, r5, UserError } from './resolve.mjs';
import { doc, kv, list, n0, n1, usd, usdM, pct, mi as miles, clip, failed, notCovered } from './text.mjs';
import { COVER } from './datasets.mjs';
import { load } from '../../api/_lib/data.mjs';
import { parcel as parcelAt } from '../../api/building.js';
import { site as siteFacts, placeAt, placesNear, floodInfo, SITE_SOURCES } from '../../api/site.js';
import { femaReport } from '../../api/fema.js';
import { envReport } from '../../api/env.js';
import { terrainFor } from '../../api/terrain.js';
import { utilitiesNear } from '../../api/utilities.js';
import { countsIn } from '../../api/traffic.js';
import { circle } from '../../api/crime.js';
import { summaryLines as utilityLines, SOURCES as UTIL_SOURCES } from '../utilities.mjs';
import { SOURCES as ENV_SOURCES, KINDS as ENV_KINDS } from '../env.mjs';
import { summary as groundSummary, sourceLine } from '../terrain.mjs';
import { frame } from '../siteplan.mjs';
import { inGeom } from '../demographics.mjs';
import { RISK_LABEL, geomRings } from '../fema.mjs';

export const today = () => new Date().toISOString().slice(0, 10);
const live = () => 'live, read ' + today();
export const inTexas = ([lon, lat]) => lon > -106.7 && lon < -93.4 && lat > 25.8 && lat < 36.6;
const settle = async (fn) => { try { return { ok: await fn() }; } catch (e) { return { err: e }; } };

// a location's own property: the parcel under a point (or the APN's parcel), its outline as the site
export async function propertyParcel(loc) {
  if (loc.parcel) return loc.parcel;
  if (!inTexas(loc.center) || !(loc.kind === 'point' || loc.kind === 'circle')) return null;
  return parcelAt(loc.center[1], loc.center[0]);
}
// the site a site tool works on: the given shape, else the parcel under the point, else a circle of mi
export async function siteOf(loc, mi) {
  if (loc.geometry) return { geometry: loc.geometry, label: loc.label, how: loc.kind === 'circle' ? 'circle' : loc.kind };
  const p = await propertyParcel(loc).catch(() => null);
  if (p?.geometry) return { geometry: p.geometry, label: 'Parcel at ' + (p.situs || loc.label) + (p.propId ? ' (APN ' + p.propId + ')' : ''), how: 'parcel', parcel: p };
  return { geometry: circle(loc.center[0], loc.center[1], mi), label: mi + ' mi around ' + loc.label, how: 'circle', note: 'No parcel outline found at the point, so a ' + mi + '-mile circle is used.' };
}

// ---------- parcels and jurisdiction ----------
const acres = p => { const m = /^([\d.]+)\s*(acres?|ac)?/i.exec(p?.area || ''); return m && (!m[2] || /^ac/i.test(m[2])) ? +m[1] : null; };
// a parcel outline as compact GeoJSON (at most ~150 vertices)
export function outlineJson(g) {
  if (!g) return null;
  const thin = r => { const k = Math.max(1, Math.ceil(r.length / 150)); const o = r.filter((_, i) => i % k === 0); if (o[o.length - 1] !== r[r.length - 1]) o.push(r[r.length - 1]); return o.map(([x, y]) => [r5(x) * 1, r5(y) * 1].map(v => +v.toFixed(6))); };
  const coords = g.type === 'Polygon' ? g.coordinates.slice(0, 3).map(thin) : g.coordinates.slice(0, 3).map(p => p.slice(0, 2).map(thin));
  return JSON.stringify({ type: g.type, coordinates: coords });
}
export function parcelLines(p) {
  if (!p) return [];
  return kv([['Owner (appraisal roll)', p.owner], ['Situs address', p.situs], ['APN / account', p.propId], ['Land use (state class)', p.landUse], ['Area', p.area],
    ['Market value', p.marketValue ? usd(p.marketValue) : null], ['Land value', p.landValue ? usd(p.landValue) : null], ['Improvement value', p.improvementValue ? usd(p.improvementValue) : null],
    ['Tax year', p.taxYear], ['Year built', p.yearBuilt], ['Acquired', p.acquired], ['Building sq ft', p.buildingSqft ? n0(p.buildingSqft) : null], ['Legal description', p.legal ? clip(p.legal, 160) : null],
    ['Subdivision', p.subdivision], ['Units sharing this outline', p.shared], ['Parcel source', p.source || 'Texas GIO StratMap land parcels']]);
}
export const parcelSource = p => p?.source ? { name: p.source + ' parcel layer', asOf: live(), url: p.sourceUrl, coverage: 'that county' } : { name: 'Texas GIO StratMap land parcels (county appraisal data)', asOf: live() + '; each county’s latest roll', url: 'https://geographic.texas.gov/', coverage: COVER.cads };
// inside city limits, or outside them and within 0.5 mile of a city (a small Texas city's ETJ reaches that far)
export async function jurisdiction(center) {
  const [inside, near] = await Promise.all([settle(() => placeAt(center[0], center[1])), settle(() => placesNear(center[0], center[1]))]);
  if (inside.err && near.err) return { line: failed('City limits (Census TIGERweb)', inside.err) };
  const city = inside.ok, others = (near.ok || []).filter(x => !city || x.name !== city.name).slice(0, 6);
  const etj = others.length ? (city ? 'Also within 0.5 mi of: ' : 'Within 0.5 mi of: ') + others.map(x => x.full).join(', ') + ' (a city’s extraterritorial jurisdiction, ETJ, can reach that far: Local Government Code §42.021; confirm with the city).' : '';
  return { city, near: others, line: (city ? 'Inside the city limits of ' + city.full + '.' : 'Outside every city’s limits (unincorporated).') + (etj ? ' ' + etj : '') };
}

export async function findProperty(args, ctx) {
  const loc = await resolve(args);
  const tx = inTexas(loc.center), point = loc.kind === 'point' || loc.kind === 'circle' || loc.kind === 'parcel';
  const [pr, ju] = await Promise.all([tx && point ? settle(() => propertyParcel(loc)) : { ok: null }, tx ? jurisdiction(loc.center) : null]);
  const p = pr.ok, lines = [whereLine(loc), 'Home region (the app’s seven counties): ' + (loc.home ? 'yes' : 'no'), ju ? 'Jurisdiction: ' + ju.line : notCovered('City limits and parcels', COVER.texas)];
  if (point && tx) {
    lines.push('', '## Parcel');
    if (pr.err) lines.push(failed('The parcel lookup', pr.err));
    else if (!p) lines.push('No parcel found at this point (the appraisal layers have no parcel here, or the point is in a road or water).');
    else { lines.push(...parcelLines(p)); const a = acres(p); if (a) lines.push('Acreage: ' + n1(a) + ' acres'); const o = outlineJson(p.geometry); if (o) lines.push('Outline (GeoJSON, lon/lat): ' + o); }
  } else if (!point) lines.push('', 'This is an area (' + loc.kind + '), not one property: parcel details need an address, APN or point.');
  return doc('Property: ' + loc.label, lines, [
    { name: 'US Census Geocoder', asOf: live(), url: 'https://geocoding.geo.census.gov/geocoder/', coverage: COVER.us },
    ...(point && tx ? [parcelSource(p)] : []),
    { name: 'US Census TIGERweb incorporated places (city limits)', asOf: live(), url: 'https://tigerweb.geo.census.gov/', coverage: COVER.us }
  ], [...loc.notes, 'Appraisal values are the district’s certified or preliminary roll, not sale prices (Texas doesn’t disclose sale prices).']);
}

// ---------- the combined look (api/site.js + the census tract) ----------
export async function tractAt(center) {
  const m = await load('market.json'); const t = (m.tracts || []).find(x => x.geom && inGeom(center, x.geom));
  return t ? { t, year: m.year, base: m.baseYear, jobsBase: m.jobsBaseYear } : null;
}
export const tractLines = ({ t, year, base, jobsBase }) => kv([['Census tract', t.g], ['Population', n0(t.pop)], ['Population growth since ' + base, pct(t.gr)], ['Median household income', usd(t.inc)], ['Median home value', usd(t.val)],
  ['Median gross rent', usd(t.rent)], ['Vacancy', t.vacr != null ? n1(t.vacr) + '%' : null], ['Median age', t.age], ['Jobs located in the tract (LODES)', t.jobs != null ? n0(t.jobs) + (t.jgr != null ? ' (' + pct(t.jgr) + ' since ' + jobsBase + ')' : '') : null],
  ['Consumer spending per household (est.)', t.sph ? usd(t.sph) : null]]).concat(['(ACS 5-year ending ' + year + '.)']);
const siteAddr = (loc, p) => { const m = /^(.*?),\s*[^,]+,\s*TX,?\s*(\d{5})/i.exec(loc.geocode?.matched || ''); if (m) return { addr: m[1], zip: m[2] }; return p?.situsStreet ? { addr: p.situsStreet, zip: p.situsZip } : {}; };

export async function siteFactsTool(args, ctx) {
  const loc = await resolve(args), c = loc.center;
  if (!inTexas(c)) return doc('Site facts: ' + loc.label, [whereLine(loc), notCovered('Site facts', COVER.texas)]);
  const pr = await settle(() => propertyParcel(loc)), p = pr.ok, a = siteAddr(loc, p);
  const [d, tr, ju] = await Promise.all([siteFacts(c[0], c[1], a), loc.home ? settle(() => tractAt(c)) : { ok: null }, jurisdiction(c)]);
  const L = [whereLine(loc), 'Jurisdiction: ' + ju.line, '', '## Parcel', ...(pr.err ? [failed('The parcel lookup', pr.err)] : p ? parcelLines(p).slice(0, 8) : ['No parcel found at this point.'])];
  L.push('', '## Flood (FEMA, at the point)'); const f = d.flood;
  L.push(f?.error ? failed('FEMA', { message: f.error }) : f.zone ? 'Zone ' + f.zone + (f.subtype ? ' (' + f.subtype.toLowerCase() + ')' : '') + ': ' + f.risk + ' risk. ' + f.note + (f.bfe ? ' Base flood elevation ' + f.bfe + ' ft.' : '') : f.note);
  L.push('', '## Traffic (TxDOT AADT, roads within ~300 m)'); const tf = d.traffic;
  L.push(...(tf?.error ? [failed('TxDOT', { message: tf.error })] : tf.roads.length ? tf.roads.map(r => r.road + ': ' + n0(r.aadt) + ' vehicles/day (' + r.system + ')') : ['No counted road within about 300 m.']));
  L.push('', '## Districts'); const ds = d.districts;
  L.push(...kv([['Water / utility districts', ds.water?.error ? failed('TCEQ', { message: ds.water.error }) : (ds.water || []).map(w => w.name + ' (' + w.type + ')').join('; ') || 'none (likely a city system)'],
    ['Opportunity Zone', ds.opportunityZone?.error ? 'unknown (' + clip(ds.opportunityZone.error, 60) + ')' : ds.opportunityZone ? 'yes' : 'no'],
    ['TIRZ (Houston)', Array.isArray(ds.tirz) ? ds.tirz.join('; ') || 'none' : 'unknown'], ['School district', Array.isArray(ds.schools) ? ds.schools.join('; ') : 'unknown'],
    ['METRO bus stops within 400 m', d.transit ? (d.transit.error ? 'unknown' : n0(d.transit.stops)) : null]]));
  L.push('', '## Environmental flags (EPA ECHO, ¼ mile)'); const e = d.environment;
  L.push(e?.error ? failed('EPA ECHO', { message: e.error }) : n0(e.total ?? e.count) + ' regulated facilities; ' + n0(e.flaggedCount) + ' flagged' + (e.flagged?.length ? ': ' + e.flagged.slice(0, 5).map(x => x.name + ' (' + x.flags.join(', ') + ')').join('; ') : '') + '. A screening flag, not a Phase I.');
  L.push('', '## Crime (Houston Police NIBRS, ½ mile, last 12 months)'); const cr = d.crime;
  L.push(cr == null || (ju.city ? ju.city.name !== 'Houston' : !ju.line.startsWith('City limits')) ? notCovered('Street-level crime', COVER.houston) + ' Use crime_by_agency for city and county rates anywhere in the US.' : cr.error ? failed('The crime database', { message: cr.error }) :
    n0(cr.last12.total) + ' incidents (' + n0(cr.last12.v) + ' violent, ' + n0(cr.last12.p) + ' property) through ' + cr.latest + '; ' + pct(cr.change.total) + ' vs the 12 months before.');
  if (d.bars?.length) L.push('', '## Alcohol sales at the address (last 12 months)', ...d.bars.slice(0, 4).map(b => b.name + ': ' + usd(b.total) + ' over ' + b.months + ' months'));
  L.push('', '## Census tract');
  L.push(...(!loc.home ? [notCovered('Tract figures', COVER.home)] : tr.err ? [failed('The tract data', tr.err)] : tr.ok ? tractLines(tr.ok) : ['No tract found at this point.']));
  return doc('Site facts: ' + loc.label, L, [
    parcelSource(p), { name: 'FEMA National Flood Hazard Layer', asOf: live(), url: SITE_SOURCES.flood, coverage: COVER.us },
    { name: 'TxDOT AADT', asOf: 'current TxDOT count year', url: SITE_SOURCES.aadt, coverage: COVER.texas },
    { name: 'TCEQ water districts; CDFI Opportunity Zones; Census TIGERweb schools and places; City of Houston TIRZ and METRO stops', asOf: live(), url: SITE_SOURCES.water, coverage: COVER.texas + ' (TIRZ and METRO: Houston)' },
    { name: 'EPA ECHO', asOf: live(), url: 'https://echo.epa.gov/', coverage: COVER.us },
    { name: 'Houston Police NIBRS (loaded nightly)', asOf: cr?.latest ? 'incidents through ' + cr.latest : null, url: 'https://www.houstontx.gov/police/cs/', coverage: COVER.houston },
    { name: 'Texas Comptroller mixed beverage receipts', asOf: live(), url: 'https://data.texas.gov/d/naix-2893', coverage: COVER.texas },
    { name: 'US Census ACS 5-year, LEHD LODES, BLS CE (modeled spending)', asOf: tr.ok ? 'ACS ending ' + tr.ok.year : null, url: 'https://www.census.gov/programs-surveys/acs', coverage: COVER.home }
  ], loc.notes);
}

// ---------- flood ----------
const NFHL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28';
async function arc(url, params, ms = 15000) {
  const r = await fetch(url + '/query', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'RealEstateIntelligence/1.0 (project app agents)' }, body: new URLSearchParams({ f: 'json', inSR: '4326', outSR: '4326', ...params }), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('FEMA map service ' + r.status); const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d;
}
// planar miles from a point to a polygon's edge (0 inside)
const MI = 69.17;
export function distToRings(p, rings) {
  const k = Math.cos(p[1] * Math.PI / 180), xy = q => [(q[0] - p[0]) * MI * k, (q[1] - p[1]) * MI];
  let best = Infinity, inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = xy(r[j]), [bx, by] = xy(r[i]);
    if ((ay > 0) !== (by > 0) && 0 < (bx - ax) * (0 - ay) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax, dy = by - ay, t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return inside ? 0 : best;
}
export async function nearestHighRisk(center, searchMi = 1) {
  const d = await arc(NFHL, { geometry: center.join(','), geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects', distance: String(searchMi), units: 'esriSRUnit_StatuteMile',
    where: "SFHA_TF = 'T'", outFields: 'FLD_ZONE', returnGeometry: 'true', maxAllowableOffset: '0.0001', geometryPrecision: '5', resultRecordCount: '200' });
  let best = null; for (const f of d.features || []) { const m = distToRings(center, f.geometry?.rings || []); if (best == null || m < best.mi) best = { mi: m, zone: f.attributes?.FLD_ZONE }; }
  return best;
}
export async function floodTool(args, ctx) {
  const loc = await resolve(args), c = loc.center;
  const s = await siteOf(loc, 0.25), deadline = Date.now() + 150000;
  const [pt, near, rep] = await Promise.all([settle(async () => floodInfo((await arc(NFHL, { geometry: c.join(','), geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects', outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE', returnGeometry: 'false' })).features.map(f => f.attributes))),
    settle(() => nearestHighRisk(c, 1)), settle(() => femaReport(s.geometry, { label: s.label, deadline }))]);
  const L = [whereLine(loc), 'Area measured: ' + s.label + (s.note ? ' (' + s.note + ')' : ''), '', '## At the point'];
  L.push(pt.err ? failed('FEMA’s flood map', pt.err) : pt.ok.zone ? 'Zone ' + pt.ok.zone + (pt.ok.subtype ? ' (' + pt.ok.subtype.toLowerCase() + ')' : '') + ': ' + pt.ok.risk + ' risk. ' + pt.ok.note + (pt.ok.bfe ? ' Base flood elevation: ' + pt.ok.bfe + ' ft.' : ' No base flood elevation published at the point.') : pt.ok.note);
  L.push(near.err ? failed('The nearest high-risk zone search', near.err) : near.ok == null ? 'Nearest high-risk (100-year) zone: none within 1 mile.' : near.ok.mi === 0 ? 'The point is inside a high-risk (100-year) zone (' + near.ok.zone + ').' : 'Nearest high-risk (100-year) zone: ' + miles(near.ok.mi) + ' away (zone ' + near.ok.zone + ').');
  if (rep.err) L.push('', failed('The FEMA area report', rep.err));
  else {
    const r = rep.ok, z = r.flood_zones;
    L.push('', '## Flood zones across the area (' + (r.area_sqmi < 0.1 ? n1(r.area_sqmi * 640) + ' acres' : n1(r.area_sqmi) + ' sq mi') + ')');
    if (z?.error) L.push(failed('FEMA’s flood zones', { message: z.error }));
    else { L.push(...Object.entries(z.shares || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => '- ' + (RISK_LABEL[k] || k) + ': ' + v + '%'));
      if (z.zones?.length) L.push('Zones: ' + z.zones.slice(0, 8).map(x => x.zone + ' ' + x.pct + '%').join(', ')); if (z.floodway) L.push('A regulatory floodway crosses the area.');
      if (z.bfe) L.push('Base flood elevations published: ' + z.bfe.min + (z.bfe.max !== z.bfe.min ? '–' + z.bfe.max : '') + ' ft.'); if (z.truncated) L.push('(FEMA returned part of the zones; shares are approximate.)'); }
    const cl = r.nfip_claims; L.push('', '## NFIP flood insurance claims (census tracts touching the area)');
    if (cl?.error) L.push(failed('OpenFEMA claims', { message: cl.error }));
    else if (!cl.claims) L.push(cl.note || 'No NFIP claims paid in these tracts.');
    else { L.push(n0(cl.claims) + ' claims, ' + usdM(cl.paid) + ' paid (avg ' + usd(cl.avg_paid) + '); ' + n0(cl.last_10_years) + ' in the last 10 years; latest loss ' + cl.latest_loss + '; ' + cl.in_high_risk_zone_pct + '% in high-risk zones.');
      if (cl.top_events?.length) L.push('By storm: ' + cl.top_events.slice(0, 6).map(e => e.event + ' ' + n0(e.claims) + ' (' + usdM(e.paid) + ')').join('; '));
      const yrs = (cl.by_year || []).slice(-10); if (yrs.length) L.push('By year (last 10 with claims): ' + yrs.map(y => y.year + ': ' + y.claims).join(', '));
      if (cl.tracts_skipped) L.push('(' + cl.tracts_skipped + ' tracts didn’t answer in time and are left out.)'); }
    const ds = r.disasters; L.push('', '## Federal disaster declarations for its counties (since 2000)');
    L.push(ds?.error ? failed('OpenFEMA declarations', { message: ds.error }) : n0(ds.count) + ' declaration' + (ds.count === 1 ? '' : 's') + ' (' + n0(ds.major) + ' major disaster' + (ds.major === 1 ? '' : 's') + '): ' + Object.entries(ds.by_type || {}).map(([k, v]) => k + ' ' + v).join(', ') + '. Latest: ' + (ds.list || []).slice(0, 5).map(x => x.date + ' ' + x.title).join('; '));
    const ri = r.risk_index; L.push('', '## FEMA National Risk Index (its census tracts)');
    L.push(...(ri?.error ? [failed('The National Risk Index', { message: ri.error })] : !ri ? ['No risk index tracts found.'] : [
      'Overall: ' + ri.risk_rating + ' (score ' + ri.risk_score + '); expected annual loss ' + usdM(ri.expected_annual_loss) + '; social vulnerability ' + ri.social_vulnerability.rating + '; community resilience ' + ri.community_resilience.rating + '.',
      'Top hazards by expected annual loss: ' + ri.hazards.slice(0, 6).map(h => h.hazard + ' ' + usdM(h.eal) + (h.rating ? ' (' + h.rating + ')' : '')).join('; ')]));
  }
  return doc('Flood and hazard: ' + loc.label, L, [
    { name: 'FEMA National Flood Hazard Layer', asOf: live(), url: 'https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS', coverage: COVER.us },
    { name: 'OpenFEMA NFIP Redacted Claims v3 and Disaster Declarations Summaries', asOf: live(), url: 'https://www.fema.gov/about/openfema/data-sets', coverage: COVER.us },
    { name: 'FEMA National Risk Index (census tracts)', asOf: live(), url: 'https://hazards.fema.gov/nri/', coverage: COVER.us }
  ], [...loc.notes, 'Claims are a neighborhood measure: FEMA redacts addresses to the census block group. The flood map is FEMA’s effective map, not a survey or an elevation certificate.']);
}

// ---------- terrain ----------
// share of the site in slope bands from the grid (per cell, central differences), inside the boundary only
export const SLOPE_BANDS = [[0, 2], [2, 5], [5, 10], [10, 15], [15, Infinity]];
export function slopeBands(T, ring) {
  const { nx, ny, cell, z } = T, at = (i, j) => z[j * nx + i], counts = SLOPE_BANDS.map(() => 0); let n = 0;
  const inRing = (p) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!inRing([T.x0 + i * cell, T.y0 + j * cell]) || at(i, j) == null) continue;
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
    const dzx = (at(i1, j) - at(i0, j)) / ((i1 - i0) * cell || 1), dzy = (at(i, j1) - at(i, j0)) / ((j1 - j0) * cell || 1), s = Math.hypot(dzx, dzy) * 100;
    if (!Number.isFinite(s)) continue; counts[SLOPE_BANDS.findIndex(([a, b]) => s >= a && s < b)]++; n++;
  }
  return n ? SLOPE_BANDS.map(([a, b], k) => ({ band: b === Infinity ? '>' + a + '%' : a + '–' + b + '%', pct: Math.round(counts[k] / n * 1000) / 10 })) : null;
}
export async function terrainTool(args, ctx) {
  const loc = await resolve(args);
  if (!(Math.abs(loc.center[1]) < 50 && loc.center[0] < -60 && loc.center[0] > -170)) return doc('Terrain: ' + loc.label, [whereLine(loc), notCovered('Elevation', COVER.us)]);
  const s = await siteOf(loc, 0.05), ring0 = geomRings(s.geometry)[0], origin = loc.center, F = frame(origin), k = Math.max(1, Math.ceil(ring0.length / 1000)), ring = ring0.slice(0, -1).filter((_, i) => i % k === 0).map(p => F.toFt(p));
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  if (Math.max(...xs) - Math.min(...xs) > 26400 || Math.max(...ys) - Math.min(...ys) > 26400) throw new UserError('Terrain works on a site up to 5 miles across; this one is larger.');
  const T = await terrainFor(origin, ring, Date.now(), { meteo: false }), g = groundSummary(T, ring), bands = slopeBands(T, ring);
  const L = [whereLine(loc), 'Site measured: ' + s.label + (s.note ? ' (' + s.note + ')' : ''), '',
    ...kv([['Elevation (NAVD 88, bare ground)', n1(g.min) + ' to ' + n1(g.max) + ' ft, mean ' + n1(g.mean) + ' ft'], ['Relief', n1(g.relief) + ' ft (most of the ground ' + n1(g.lo) + '–' + n1(g.hi) + ' ft, 5th–95th percentile)'],
      ['General drainage', g.flat ? 'nearly flat (under 2 ft of fall): drainage will be graded in' : 'falls about ' + n1(g.fall) + ' ft toward the ' + (g.toward || 'low side') + ' (' + g.slope.toFixed(2) + '% average over the best-fit plane)'],
      ['Low channel or pond', g.dip != null ? 'yes, down to ' + n1(g.dip) + ' ft (check for a floodway or drainage easement)' : null], ['Uneven ground', g.rough && !g.flat && g.dip == null ? 'yes (a ditch, ridge or pond?)' : null]]),
    'Share of the site by slope: ' + (bands ? bands.map(b => b.band + ' ' + b.pct + '%').join(', ') : 'not enough points'),
    'Data: ' + sourceLine(T) + (T.resM ? ', model cell about ' + T.resM + ' m' : '') + '; sampled every ' + T.cell + ' ft (' + n0(T.nx * T.ny) + ' points)' + (T.coarse ? '; coarse: good for which way the land falls, not for contours' : '') + '.'];
  return doc('Terrain: ' + loc.label, L, [{ name: 'USGS 3DEP elevation (The National Map image service; point query service as fallback)', asOf: live() + '; lidar flown in different years by area', url: 'https://www.usgs.gov/3d-elevation-program', coverage: COVER.us }],
    [...loc.notes, 'Planning numbers from a public elevation model, not a survey. Slopes are measured over ' + T.cell + '-ft cells, so curbs and small ditches are smoothed out.']);
}

// ---------- environmental ----------
export async function environmentalTool(args, ctx) {
  const loc = await resolve(args);
  if (!inTexas(loc.center)) return doc('Environmental screen: ' + loc.label, [whereLine(loc), notCovered('The environmental screen', COVER.texas)]);
  const s = await siteOf(loc, 0.1), r = await envReport(s.geometry, { label: s.label, deadline: Date.now() + 100000 });
  const L = [whereLine(loc), 'Site: ' + s.label + (s.note ? ' (' + s.note + ')' : '') + '. Each kind is searched within its own distance of the site’s edge (Phase I style).', ''];
  const kinds = Object.values(r.kinds), hits = kinds.filter(k => !k.error && k.count), none = kinds.filter(k => !k.error && !k.count), bad = kinds.filter(k => k.error);
  for (const k of hits.sort((a, b) => (b.onsite || 0) - (a.onsite || 0) || b.count - a.count)) {
    L.push('## ' + k.label + ' (within ' + k.search_mi + ' mi): ' + n0(k.count) + (k.onsite ? ', ' + n0(k.onsite) + ' on the site' : ''));
    if (k.by_type?.length) L.push('By type: ' + k.by_type.slice(0, 6).map(t => t.type + ' ' + t.n + (t.acres ? ' (' + t.acres + ' ac)' : '')).join(', '));
    L.push(...(k.nearest || []).slice(0, 4).map(x => '- ' + x.name + (x.addr ? ', ' + x.addr : '') + (x.city ? ', ' + x.city : '') + ': ' + (x.mi === 0 ? 'on site' : n1(x.mi) + ' mi ' + (x.dir || '')) + (x.id ? ' [' + x.id + ']' : '') + (x.commodity ? ' ' + x.commodity : '')));
  }
  if (none.length) L.push('', 'None found: ' + none.map(k => k.label + ' (' + k.search_mi + ' mi)').join('; ') + '.');
  if (bad.length) L.push('', ...bad.map(k => failed(k.label, { message: k.error })));
  const so = r.soils; if (so) L.push('', '## Soils under the site', ...(so.error ? [failed('USDA soils', { message: so.error })] : (so.list || []).slice(0, 6).map(x => '- ' + [x.name, x.pct != null ? x.pct + '% of the site' : null, x.drainage, x.hydrologic_group ? 'hydrologic group ' + x.hydrologic_group : null, x.flooding ? 'flooding ' + x.flooding.toLowerCase() : null, x.small_commercial ? 'small commercial buildings: ' + x.small_commercial.toLowerCase() : null, x.water_table_cm != null ? 'water table ' + x.water_table_cm + ' cm' : null].filter(Boolean).join(', '))));
  return doc('Environmental screen: ' + loc.label, L, [{ name: ENV_SOURCES, asOf: live(), url: 'https://www.tceq.texas.gov/gis/download-tceq-gis-data', coverage: COVER.texas + ' (EPA, wetlands and soils: US)' }],
    [...loc.notes, 'A screening of public records, not a Phase I environmental site assessment.']);
}

// ---------- utilities ----------
export async function utilitiesTool(args, ctx) {
  const loc = await resolve(args);
  if (!inTexas(loc.center)) return doc('Utilities: ' + loc.label, [whereLine(loc), notCovered('Utilities', COVER.texas)]);
  const s = loc.geometry && loc.kind !== 'circle' ? { geometry: loc.geometry } : await siteOf(loc, 0.02).catch(() => ({}));
  const d = await utilitiesNear(loc.center, s.how === 'circle' ? null : s.geometry || null);
  const L = [whereLine(loc), s.how === 'parcel' ? 'Distances from the parcel edge.' : 'Distances from the point.', '', ...utilityLines(d)];
  for (const [k, w] of [['power', 'Power lines'], ['water', 'Water'], ['sewer', 'Sewer']]) if (d[k]?.error) L.push(failed(w, { message: d[k].error }));
  if (d.power?.lines?.length) L.push('', 'Mapped power lines nearby: ' + d.power.lines.slice(0, 5).map(l => (l.kvText ? l.kvText + ' ' : '') + l.label.toLowerCase() + ' ' + miles(l.ft / 5280)).join('; '));
  if (d.water?.mainsNote) L.push('Water mains: ' + d.water.mainsNote + '.'); if (d.sewer?.mainsNote) L.push('Sewer mains: ' + d.sewer.mainsNote + '.');
  return doc('Utilities: ' + loc.label, L, [{ name: UTIL_SOURCES, asOf: live(), url: 'https://www.openstreetmap.org/copyright', coverage: COVER.texas + ' (public mains: City of Houston only)' }],
    [...loc.notes, 'Power lines: © OpenStreetMap contributors (ODbL); street-level distribution lines are often unmapped. Confirm capacity and service with each utility.']);
}

// ---------- traffic counts ----------
export async function trafficTool(args, ctx) {
  const loc = await resolve(args);
  if (!inTexas(loc.center)) return doc('Traffic counts: ' + loc.label, [whereLine(loc), notCovered('TxDOT traffic counts', COVER.texas)]);
  const mi0 = loc.kind === 'point' ? 0.5 : null, g = areaOf(loc, mi0), d = await countsIn(g);
  const L = [whereLine(loc), 'Area: ' + areaLabel(loc, mi0), '', '## Busiest roads (average vehicles a day, both directions)', ...list(d.roads || [], 15, r => r.road + ': ' + n0(r.aadt) + (r.segments > 1 ? ' (busiest of ' + r.segments + ' counted segments, average ' + n0(r.avg) + ')' : '') + ' · ' + r.type),
    '', '## By road type', ...(d.types || []).map(t => '- ' + t.label + ': average ' + n0(t.avg) + ', busiest ' + n0(t.max) + ' (' + n0(t.segments) + ' segments)')];
  if (!d.roads?.length) L.push('No TxDOT count segments in this area.');
  if (d.segments_capped) L.push('(The area has more than 1,000 counted segments; the busiest 1,000 are summarized.)');
  return doc('Traffic counts: ' + loc.label, L, [{ name: 'TxDOT annual average daily traffic (AADT) count segments', asOf: d.as_of ? 'TxDOT file of ' + String(d.as_of).slice(0, 10) : 'current TxDOT count year', url: 'https://gis-txdot.opendata.arcgis.com/', coverage: COVER.texas }],
    [...loc.notes, 'TxDOT keeps only the current year’s counts in this layer: it shows how busy roads are, not growth. Uncounted neighborhood streets carry a flat estimate and are left off the top list.']);
}
