// One resolver for every MCP tool's location input (api/mcp.js):
//   { address } | { apn, county } | { lat, lon } | { county } | { bbox: [w, s, e, n] } | { geojson } , plus radius_mi with any
// -> { kind, label, center: [lon, lat], geometry (Polygon / MultiPolygon, or null for a bare point), radius_mi, geocode,
//      parcel, county: { name, fips }, state, home (inside the app's seven home counties), notes }
// Server-side geocoding is the US Census geocoder (free, public; api/crimeus already uses it), with the match quality;
// town names in the home region come from the app's own place list (data/geo.json). APN lookup asks the county appraisal
// district layers api/building.js reads where they answer attribute queries (Harris, Waller, Austin, Washington, Grimes);
// Fort Bend and Montgomery parcels come only from the statewide StratMap layer, which answers map clicks, not searches.
import { load } from '../../api/_lib/data.mjs';
import { CADS, normalizeCad, apnWheres } from '../../api/building.js';
export { apnWheres };
import { circle, cleanGeometry } from '../../api/crime.js';
import { locate } from '../../api/crimeus.js';
import { inGeom, centroid } from '../demographics.mjs';
import { areaSqMi, bbox as bboxOf } from '../fema.mjs';

const UA = { 'User-Agent': 'RealEstateIntelligence/1.0 (project app agents)' };
export const CENSUS_GEOCODER = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const TIGER_COUNTY = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
export class UserError extends Error {} // a sentence for the agent, not a crash

const num = v => v == null || v === '' ? NaN : Number(v);
export const r5 = v => Math.round(v * 1e5) / 1e5;
const tc = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

async function getJSON(url, ms = 10000, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(new URL(url).host + ' answered ' + r.status);
  const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d;
}

// ---------- the app's own county outlines and towns ----------
let geoP = null;
async function geo() {
  if (!geoP) geoP = Promise.all([load('geo.json'), load('regions.json')]).then(([g, rg]) => {
    const fips = Object.fromEntries((rg.counties || []).map(c => [c.name, c.fips]));
    const outline = c => ({ type: 'MultiPolygon', coordinates: c.outline });
    return { home: (g.counties || []).map(c => ({ name: c.name, fips: fips[c.name], geom: outline(c), home: true })),
      ring: (g.ring || []).map(c => ({ name: String(c.name).replace(/ County$/, ''), geom: outline(c), home: false })), places: g.places || [], homeNames: (rg.counties || []).map(c => c.name) };
  }).catch(e => { geoP = null; throw e; });
  return geoP;
}
export async function homeCounties() { return (await geo()).homeNames; }
// the county a point is in: the app's outlines first (no network), then the Census geocoder
export async function countyAt([lon, lat]) {
  const G = await geo(), hit = [...G.home, ...G.ring].find(c => inGeom([lon, lat], c.geom));
  if (hit) return { name: hit.name, fips: hit.fips || null, state: 'TX', home: hit.home };
  try { const w = await locate(r5(lon), r5(lat)); return w ? { name: w.county || null, fips: null, state: w.state || null, home: false } : null; }
  catch (e) { return null; }
}

// ---------- geocoding ----------
const HOUSE = /^\s*(\d{1,6})[A-Z]?\b/i;
// how good a Census match is: exact (one match, house number and ZIP agree), approximate, or none
export function matchQuality(input, matches) {
  if (!matches?.length) return 'none';
  const m = matches[0], num0 = (String(input).match(HOUSE) || [])[1], zip0 = (String(input).match(/\b(\d{5})(?:-\d{4})?\s*$/) || [])[1];
  const numM = (String(m.matchedAddress || '').match(HOUSE) || [])[1], zipM = (String(m.matchedAddress || '').match(/\b(\d{5})\s*$/) || [])[1] || m.addressComponents?.zip;
  return matches.length === 1 && num0 && num0 === numM && (!zip0 || zip0 === zipM) ? 'exact' : 'approximate';
}
export async function geocode(address, fetchImpl) {
  const q = new URLSearchParams({ address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: 'Counties,Incorporated Places,States', format: 'json' });
  const d = await getJSON(CENSUS_GEOCODER + '?' + q, 12000, fetchImpl), list = d?.result?.addressMatches || [];
  if (!list.length) return null;
  const m = list[0], g = m.geographies || {}, c = (g.Counties || [])[0], st = (g.States || [])[0], pl = (g['Incorporated Places'] || [])[0];
  return { lon: +m.coordinates.x, lat: +m.coordinates.y, matched: m.matchedAddress, quality: matchQuality(address, list), candidates: list.length,
    county: c ? { name: c.BASENAME || String(c.NAME || '').replace(/ County$/, ''), fips: c.GEOID || null } : null, state: st?.STUSAB || null, city: pl?.BASENAME || null, zip: m.addressComponents?.zip || null };
}
// a town in the home region by name ("Katy", "Fulshear, TX")
async function town(name) {
  const t = String(name).replace(/,?\s*(TX|Texas)\.?\s*(\d{5})?\s*$/i, '').trim().toLowerCase(); if (!t || /\d/.test(t)) return null;
  const p = (await geo()).places.find(x => String(x[0]).toLowerCase() === t);
  return p ? { name: p[0], lon: p[1], lat: p[2] } : null;
}

// ---------- counties ----------
export async function countyShape(name, fetchImpl) {
  const n = String(name).replace(/\s+county\s*$/i, '').replace(/,?\s*(TX|Texas)$/i, '').trim(); if (!n) return null;
  const G = await geo(), own = [...G.home, ...G.ring].find(c => c.name.toLowerCase() === n.toLowerCase());
  if (own) return { name: own.name, fips: own.fips || null, geom: own.geom, home: own.home };
  const q = new URLSearchParams({ where: "STATE='48' AND UPPER(BASENAME)='" + n.toUpperCase().replace(/'/g, "''") + "'", outFields: 'GEOID,BASENAME', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.002', geometryPrecision: '4', f: 'geojson' });
  const d = await getJSON(TIGER_COUNTY + '?' + q, 15000, fetchImpl), f = (d.features || [])[0];
  return f ? { name: f.properties.BASENAME, fips: f.properties.GEOID, geom: f.geometry, home: false } : null;
}

// ---------- parcels by APN ----------
export async function parcelByApn(apn, county, fetchImpl) {
  const cad = CADS.find(c => c.county.toLowerCase() === String(county || '').replace(/\s+county$/i, '').trim().toLowerCase());
  if (!cad) throw new UserError('Parcel lookup by APN works for Harris, Waller, Austin, Washington and Grimes counties (their appraisal districts publish searchable parcel layers). ' +
    (county ? tc(county) + ' County' : 'That county') + ' isn’t searchable by APN here: give the address or coordinates instead.');
  let lastErr = null;
  for (const where of apnWheres(cad, apn)) {
    const q = new URLSearchParams({ f: 'json', where, outFields: '*', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', resultRecordCount: '5' });
    try { const d = await getJSON(cad.url + '/query?' + q, 12000, fetchImpl), f = (d.features || []).find(x => x.geometry?.rings);
      if (f) return normalizeCad(cad, f.attributes, f.geometry); }
    catch (e) { lastErr = e; } // a field this district doesn't have: try the next form
  }
  if (lastErr && !/field|column|invalid|400/i.test(lastErr.message)) throw new Error(cad.name + ' didn’t answer (' + lastErr.message + ')');
  throw new UserError('No parcel ' + apn + ' in the ' + cad.name + ' layer. Check the account number, or give the address.');
}

// ---------- the resolver ----------
const ringBox = ([w, s, e, n]) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
export const MAX_RADIUS_MI = 25;
export async function resolve(a = {}, { fetchImpl } = {}) {
  const notes = [], radius = a.radius_mi == null ? null : num(a.radius_mi);
  if (radius != null && !(radius > 0 && radius <= MAX_RADIUS_MI)) throw new UserError('radius_mi must be between 0 and ' + MAX_RADIUS_MI + ' miles.');
  let out = null;
  if (a.geojson) {
    const g = cleanGeometry(typeof a.geojson === 'string' ? (() => { try { return JSON.parse(a.geojson); } catch (e) { return null; } })() : a.geojson);
    if (!g) throw new UserError('geojson must be a GeoJSON Polygon or MultiPolygon (or a Feature holding one) in lon/lat.');
    out = { kind: 'area', label: a.label || 'Drawn area', geometry: g, center: centroid(g) };
  } else if (a.bbox) {
    const b = (Array.isArray(a.bbox) ? a.bbox : String(a.bbox).split(',')).map(Number);
    if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3] || b[2] - b[0] > 3 || b[3] - b[1] > 3) throw new UserError('bbox is [west, south, east, north] in degrees, at most 3° on a side.');
    out = { kind: 'area', label: a.label || 'Box ' + b.map(v => v.toFixed(3)).join(', '), geometry: ringBox(b), center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] };
  } else if (a.apn) {
    if (!a.county) throw new UserError('An APN needs its county too (apn + county).');
    const p = await parcelByApn(a.apn, a.county, fetchImpl), g = p.geometry;
    out = { kind: 'parcel', label: (p.situs || 'Parcel ' + p.propId) + ' (APN ' + p.propId + ')', geometry: g, center: centroid(g), parcel: p, geocode: { quality: 'parcel record', source: p.source } };
  } else if (a.lat != null || a.lon != null) {
    const lat = num(a.lat), lon = num(a.lon);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new UserError('lat and lon must be numbers (latitude, longitude in degrees).');
    out = { kind: 'point', label: a.label || r5(lat) + ', ' + r5(lon), center: [r5(lon), r5(lat)], geometry: null, geocode: { quality: 'coordinates given' } };
  } else if (a.address) {
    const addr = String(a.address).slice(0, 200);
    let g = null, err = null;
    if (/\d/.test(addr)) { try { g = await geocode(addr, fetchImpl); } catch (e) { err = e; } }
    if (g) out = { kind: 'point', label: g.matched || addr, center: [r5(g.lon), r5(g.lat)], geometry: null, geocode: { quality: g.quality, matched: g.matched, candidates: g.candidates, source: 'US Census Geocoder' }, censusCounty: g.county, state: g.state };
    else {
      const t = await town(addr);
      if (t) out = { kind: 'point', label: t.name + ', TX', center: [t.lon, t.lat], geometry: null, geocode: { quality: 'town center', source: 'the app’s town list' } };
      else if (err) throw new Error('The US Census geocoder didn’t answer (' + err.message + '). Try again, or give lat/lon.');
      else throw new UserError('The US Census geocoder found no match for “' + addr + '”. Give a full street address with city and state (or ZIP), or lat/lon.');
    }
  } else if (a.county) {
    const c = await countyShape(a.county, fetchImpl);
    if (!c) throw new UserError('No Texas county named “' + a.county + '”.');
    out = { kind: 'county', label: c.name + ' County', geometry: c.geom, center: centroid(c.geom), county: { name: c.name, fips: c.fips }, state: 'TX', home: c.home };
  } else throw new UserError('Give a location: address, apn + county, lat + lon, county, bbox or geojson (radius_mi with any of the first three).');

  if (radius != null) {
    if (out.kind === 'point' || out.kind === 'parcel') { out = { ...out, kind: 'circle', parcelGeometry: out.geometry, geometry: circle(out.center[0], out.center[1], radius), radius_mi: radius, label: radius + ' mi around ' + out.label }; }
    else notes.push('radius_mi is ignored for a county, box or drawn area.');
  }
  if (!out.county) {
    const c = await countyAt(out.center);
    if (c) { out.county = { name: c.name || out.censusCounty?.name || null, fips: c.fips || out.censusCounty?.fips || null }; out.state ||= c.state; out.home = c.home; }
    else if (out.censusCounty) { out.county = out.censusCounty; out.home = false; }
  }
  if (out.home == null) out.home = !!(out.county && (await homeCounties()).includes(out.county.name) && (out.state || 'TX') === 'TX');
  if (out.geometry) { out.area_sqmi = Math.round(areaSqMi(out.geometry) * 1000) / 1000; out.bbox = bboxOf(out.geometry); }
  out.notes = notes;
  return out;
}

// the area a tool works on: the location's own shape, else a circle of the tool's default radius around the point
export const areaOf = (loc, mi) => loc.geometry ? loc.geometry : circle(loc.center[0], loc.center[1], mi);
export const areaLabel = (loc, mi) => loc.geometry ? loc.label : mi + ' mi around ' + loc.label;
// one line that says where this is
export function whereLine(loc) {
  const g = loc.geocode, q = g?.quality && g.quality !== 'coordinates given' ? ' [' + g.quality + (g.candidates > 1 ? ', ' + g.candidates + ' candidates' : '') + (g.source ? ', ' + g.source : '') + ']' : '';
  return 'Location: ' + loc.label + q + ' · ' + loc.center[1].toFixed(5) + ', ' + loc.center[0].toFixed(5) + (loc.county?.name ? ' · ' + loc.county.name + ' County' + (loc.state && loc.state !== 'TX' ? ', ' + loc.state : '') : '') +
    (loc.area_sqmi ? ' · ' + (loc.area_sqmi < 0.1 ? Math.round(loc.area_sqmi * 640 * 10) / 10 + ' acres' : loc.area_sqmi + ' sq mi') : '');
}
