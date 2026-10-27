// MCP site_plan tool (api/mcp.js): a concept site plan for a parcel (or several, or a drawn outline), laid out by the app's
// own layout engine (lib/sitelayout.mjs) the way the Site plan panel's Build with AI does it (src/siteplan.js build()):
//   the site: the parcel outline(s), merged as the app merges them; the front and side streets from road lines beside it
//     (US Census TIGERweb roads: the browser reads the map's tiles); the ground (USGS 3DEP) so the pond goes on the low side
//   the facts: flood zone, districts, roads and traffic, EPA records, utilities, the ground, the jurisdiction (the Waller
//     guardrails apply inside Waller's limits or ETJ, as in the app)
//   what to build: the request, or with none, the AI's best-use ideas for the site (api/siteplan.js bestuse) and the best one
//   the program: the AI reads the request (api/siteplan.js program), at Medium and High after planning the site (strategy)
//   the layouts: the engine's options, then at Medium and High the AI's review of their drawings and numbers (High may
//     revise the program once), and the pick (lib/planpick.mjs recommended: the AI's, else the engine's best that passes)
//   the result: a summary, the conceptual site plan sheet as a PDF (lib/sitesheet.mjs, the app's Site Plan PDF) and, when
//     asked, the layout as GeoJSON (lon/lat); the picked layout is saved (lib/mcp/store.mjs) and its plan_id given, so
//     plan_set and site_renderings can carry on from exactly this plan
// The AI never draws: the geometry is the engine's, measured. Without an AI key the request is read directly (Low).
// Everything has a time budget: past it, the AI steps not yet run are skipped and the answer says so.
import * as SP from '../siteplan.mjs';
import * as PARC from '../siteparcels.mjs';
import { layoutOptions } from '../sitelayout.mjs';
import { sheetHTML, planSVG } from '../sitesheet.mjs';
import * as G from '../guardrails.mjs';
import * as K from '../planpick.mjs';
import * as RUN from '../planruns.mjs';
import * as ASK from '../planask.mjs';
import * as BR from '../planbrief.mjs';
import * as TR from '../terrain.mjs';
import * as PJ from '../project.mjs';
import { areaPiece } from '../sitetools.mjs';
import { summaryLines as utilityLines } from '../utilities.mjs';
import { render as chromium, snapshots as chromiumShots } from '../pdf.mjs';
import { site as siteAt } from '../../api/site.js';
import { utilitiesNear } from '../../api/utilities.js';
import { terrainFor } from '../../api/terrain.js';
import { siteAI as appAI } from '../../api/siteplan.js';
import { load } from '../../api/_lib/data.mjs';
import { resolve, parcelByApn, whereLine, UserError } from './resolve.mjs';
import { propertyParcel, tractAt } from './site.mjs';
import { db } from './area.mjs';
import { doc, n0, n1, clip } from './text.mjs';
import { serverKit, pages, PDF_LIMIT } from './reports.mjs';
import { slug } from '../../src/reportkit.js';
import { auditPlan, auditLines } from '../planaudit.mjs';
import { store, putJSON, newId } from './store.mjs';

export const EFFORTS = ['low', 'medium', 'high'];
export const MAX_ACRES = 300, MAX_PARCELS = 20;
const BUDGET_MS = 265000, RESERVE_MS = 30000; // the whole tool, inside the function's 300 s (vercel.json); the last 30 s kept for the sheet PDF
// tests: stand-ins for the AI, the renderer, the snapshots and the clock
export const hooks = { ai: null, render: null, snapshots: null, now: null, budgetMs: null };
const now = () => (hooks.now || Date.now)();
const ai = b => (hooks.ai || appAI)({ ...b, ...aiChoice() });
// which AI answers: the app's default for site plans (OpenAI's model), or Claude when MCP_SITEPLAN_PROVIDER=anthropic
const aiChoice = () => process.env.MCP_SITEPLAN_PROVIDER === 'anthropic' ? { provider: 'anthropic', ...(process.env.MCP_SITEPLAN_MODEL ? { model: process.env.MCP_SITEPLAN_MODEL } : {}) } : {};
const within = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res(null), Math.max(0, ms)))]);
const f0 = v => Math.round(+v || 0).toLocaleString('en-US');

// ---------- roads beside the site (US Census TIGERweb) ----------
// The layer ids are read from the service by name once (they change between TIGER vintages): primary roads (interstates,
// rank 3 like a motorway), secondary (US and state highways, 2.5) and local streets (1), the classes the app counts as streets.
export const TIGER_ROADS = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer';
const ROAD_KINDS = [[/^primary roads?$/i, 3], [/^secondary roads?$/i, 2.5], [/^local roads?$/i, 1]];
let layersP = null;
async function getJSON(url, ms = 12000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json(); if (d?.error) throw new Error(d.error.message || 'service error'); return d;
}
async function roadLayers() {
  layersP ||= getJSON(TIGER_ROADS + '?f=json').then(d => (d.layers || []).map(l => ({ id: l.id, rank: ROAD_KINDS.find(([re]) => re.test(String(l.name || '').trim()))?.[1] })).filter(l => l.rank)).catch(e => { layersP = null; throw e; });
  return layersP;
}
// road lines in lon/lat around a box [w, s, e, n] (padded ~600 ft): [{ coords, rank, name }]
export async function roadsNear(box) {
  const pad = 0.002, env = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad].map(v => v.toFixed(6)).join(','), out = [];
  for (const l of await roadLayers()) {
    const q = new URLSearchParams({ geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json' });
    const d = await getJSON(TIGER_ROADS + '/' + l.id + '/query?' + q);
    for (const f of d.features || []) { const a = f.attributes || {}, name = a.NAME || a.FULLNAME || a.BASENAME || null; for (const p of f.geometry?.paths || []) if (p.length > 1) out.push({ coords: p, rank: l.rank, name: name ? String(name).slice(0, 40) : null }); }
  }
  return out;
}
const boxOf = geoms => { let w = 180, s = 90, e = -180, n = -90; for (const g of geoms) for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [w, s, e, n]; };

// ---------- the site ----------
const acresOf = g => { const b = SP.boundaryFrom(g); return b ? +(SP.ringArea(b.ring) / 43560).toFixed(3) : null; };
const recOf = (p, center) => ({ label: p.situs || p.owner || 'Parcel', owner: p.owner || '', propId: p.propId || null, acres: p.geometry ? acresOf(p.geometry) : null, geometry: p.geometry, center, source: p.source || null, situs: p.situs || '', zip: p.situsZip || null });
// the parcels (or the drawn outline) the site is made of, as the property card hands them to the Site plan panel
export async function parcelsFor(args) {
  if (Array.isArray(args.apns) && args.apns.length) {
    if (!args.county) throw new UserError('apns need their county (all of them in one county).');
    const list = [...new Set(args.apns.map(a => String(a).trim()).filter(Boolean))].slice(0, MAX_PARCELS + 1);
    if (list.length > MAX_PARCELS) throw new UserError('At most ' + MAX_PARCELS + ' parcels make one site.');
    const got = await Promise.all(list.map(a => parcelByApn(a, args.county).then(p => ({ p }), e => ({ e, a }))));
    const bad = got.filter(x => x.e); if (bad.length) throw new UserError(bad.map(x => x.e instanceof UserError ? x.e.message : 'APN ' + x.a + ': ' + x.e.message).join(' '));
    const recs = got.map(x => recOf(x.p, null)).filter(r => r.geometry); if (!recs.length) throw new UserError('None of those parcels has an outline to lay out on.');
    return { recs, label: recs.length > 1 ? recs.length + ' parcels · ' + recs[0].label : recs[0].label, loc: null, source: recs.length > 1 ? recs.length + ' county appraisal district parcel outlines, merged' : 'the county appraisal district parcel outline' };
  }
  const loc = await resolve(args);
  if (loc.kind === 'county') throw new UserError('A site plan needs one site: an address, an APN (with county), a point on the parcel, or the outline as geojson, not a whole county.');
  if (loc.kind === 'circle') throw new UserError('A site plan lays out a parcel or a drawn outline, not a circle: leave out radius_mi.');
  if (args.bbox) throw new UserError('A site plan lays out a parcel or a drawn outline (geojson), not a box.');
  if (loc.geocode?.quality === 'town center') throw new UserError(loc.label + ' is a town, not a site: give the street address, the APN (with county) or the site outline.');
  if (loc.kind === 'area') { // a drawn outline; a MultiPolygon's pieces are merged as one site, like parcels picked together
    const g = loc.geometry, parts = g.type === 'MultiPolygon' ? g.coordinates.map(c => ({ type: 'Polygon', coordinates: c })) : [g];
    if (parts.length > MAX_PARCELS) throw new UserError('At most ' + MAX_PARCELS + ' pieces make one site.');
    const recs = parts.map((x, i) => ({ label: parts.length > 1 ? loc.label + ' · piece ' + (i + 1) : loc.label, owner: '', propId: null, acres: acresOf(x), geometry: x, center: null }));
    return { recs, label: loc.label, loc, source: parts.length > 1 ? 'a drawn boundary of ' + parts.length + ' pieces, merged' : 'a boundary drawn on the map' }; }
  const p = loc.parcel?.geometry ? loc.parcel : await propertyParcel(loc).catch(() => null);
  if (!p?.geometry) throw new UserError('No parcel outline was found at ' + loc.label + '. Give the APN (with county) or the site outline as geojson.');
  const rec = recOf(p, loc.center);
  return { recs: [rec], label: rec.situs || loc.label, loc, source: 'the county appraisal district parcel outline' };
}
// the plan the engine lays out on: the boundary in feet from its middle, the front and side streets, setbacks, no-build
// road strips between parcels, the ground
export async function planFor(recs, roads, frontRoad = '') {
  const geoms = recs.map(r => r.geometry);
  let b, strips = [];
  if (geoms.length < 2) b = SP.boundaryFrom(geoms[0], recs[0].center || undefined);
  else { const br = SP.bridgeParcels(geoms, { roads: roads.map(r => r.coords) }), u = SP.unionParcels(br.geoms); b = u; strips = br.strips || []; }
  if (!b?.ring || b.ring.length < 3) throw new UserError('The parcel outline couldn’t be read as one site.');
  const acres = SP.ringArea(b.ring) / 43560;
  if (acres > MAX_ACRES) throw new UserError('This site is ' + n1(acres) + ' acres; site plans here go up to ' + MAX_ACRES + ' acres. Lay out part of it (geojson).');
  if (acres < 0.1) throw new UserError('This site is under a tenth of an acre: too small to lay out.');
  const F = SP.frame(b.origin), lines = [];
  for (const r of roads) { const ft = r.coords.map(F.toFt); if (ft.some((q, i) => i && SP.segDist([0, 0], ft[i - 1], q) < 2500)) { ft.rank = r.rank; ft.nm = r.name; lines.push(ft); } } // (by segment: a TIGER line can be one long straight piece)
  let front = SP.frontFromRoads(b.ring, lines), guessed = front == null, frontNote = ''; if (guessed) front = SP.longestEdge(b.ring);
  let bySitus = false; if (!frontRoad) { const m = /^\s*\d+[a-z]?\s+([^,]+?)\s*(?:,|$)/i.exec(String(recs[0]?.situs || recs[0]?.label || '')); if (m && recs.length === 1) { frontRoad = m[1]; bySitus = true; } } // (no street named: the parcel's own address street, when the road lines have it: "1 Ralston Rd" fronts Ralston Rd, not the FM at its corner)
  if (frontRoad) { // the street the agent says the site faces: the edge nearest that road's line (its name as TIGER has it, loosely)
    const want = String(frontRoad).toLowerCase().replace(/\b(road|rd|street|st|lane|ln|drive|dr|avenue|ave|highway|hwy|farm to market|fm)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(), same = nm => { const n = String(nm || '').toLowerCase().replace(/\b(road|rd|street|st|lane|ln|drive|dr|avenue|ave|highway|hwy|farm to market|fm)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); return want && n && (n.includes(want) || want.includes(n)); };
    const named = lines.filter(x => same(x.nm)); let best = null;
    for (let k = 0; k < b.ring.length; k++) { const a = b.ring[k], c = b.ring[(k + 1) % b.ring.length], m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, t = [(c[0] - a[0]) / L, (c[1] - a[1]) / L];
      for (const x of named) for (let i = 1; i < x.length; i++) { const p0 = x[i - 1], p1 = x[i], sl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1; if (Math.abs(((p1[0] - p0[0]) * t[0] + (p1[1] - p0[1]) * t[1]) / sl) < 0.7) continue; // (the road running along the edge, not past its end)
        const d = SP.segDist(m, p0, p1), sc = d - Math.min(L, 1500) * 0.1; if (d < 400 && (!best || sc < best.sc)) best = { d, sc, k }; } } // (the long edge along the road over a short one the road also passes)
    if (best && bySitus && SP.edgeLen(b.ring, best.k) < 100) best = null; // (a sliver along the address street: the lines' pick stands)
    if (best) { front = best.k; guessed = false; frontNote = bySitus ? '' : 'Front on ' + frontRoad + ', as asked.'; } else if (!bySitus) frontNote = 'No road named "' + frontRoad + '" was found beside the site, so the front is ' + (guessed ? 'its longest side (a guess)' : 'the road the lines show') + '.'; }
  const streets = guessed ? [] : SP.streetsFromRoads(b.ring, lines, front), streetNames = {};
  for (const k of [front, ...streets]) { const a = b.ring[k], c = b.ring[(k + 1) % b.ring.length], m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; let best = null;
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, t = [(c[0] - a[0]) / L, (c[1] - a[1]) / L]; // a road running along the side, not one crossing it
    for (const x of lines) if (x.nm) for (let i = 1; i < x.length; i++) { const p0 = x[i - 1], p1 = x[i], sl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1; if (Math.abs(((p1[0] - p0[0]) * t[0] + (p1[1] - p0[1]) * t[1]) / sl) < 0.8) continue;
      const d = SP.segDist(m, p0, p1); if (d < 150 && (!best || d < best.d)) best = { d, nm: x.nm }; }
    if (best) streetNames[k] = best.nm; }
  const plan = { id: 'mcp', name: 'A', origin: b.origin, ring: b.ring, src: recs.length > 1 ? 'cad' : recs[0].propId ? 'cad' : 'drawn', front, frontGuess: false, streets, ...(Object.keys(streetNames).length ? { streetNames } : {}), setbacks: { ...SP.SETBACKS }, program: { use: 'retail' }, zoning: null, elements: [] };
  for (const s of strips.filter(s => s.road)) { const pts = s.ll.slice(0, -1).map(F.toFt); if (!SP.inRing(SP.centroid(pts), plan.ring)) continue;
    const e = areaPiece(plan, 'keepout', pts, 'gap' + plan.elements.length); plan.elements.push({ ...e, name: 'Road between parcels', note: 'About ' + s.gapFt + ' ft wide, with a road in it, and not in the parcels, so nothing is built or paved on it.', gap: true }); }
  return { plan, guessed, acres, frontNote };
}

// ---------- what's known about the site (src/siteplan.js siteFacts, siteInfo) ----------
export async function factsFor(plan, recs, county, t0) {
  const F = SP.frame(plan.origin), c = F.toLL(SP.centroid(plan.ring)), geom = { type: 'Polygon', coordinates: [plan.ring.concat([plan.ring[0]]).map(F.toLL)] };
  const left = () => budget() - (now() - t0);
  const [d, u, T] = await Promise.all([within(siteAt(c[0], c[1]).catch(e => ({ error: e.message })), 20000), within(utilitiesNear(c, geom).catch(() => null), 15000), within(terrainFor(plan.origin, plan.ring, Date.now(), { meteo: false }).catch(() => null), Math.min(45000, left() - 150000))]);
  const out = [], D = d && !d.error ? d : {}, ok = x => x != null && !x.error, ds = D.districts || {};
  // a lookup that failed comes back as { error }: said as not checked, never read as "none found"
  const f = D.flood; if (ok(f) && f.zone) out.push('FEMA flood zone ' + f.zone + (f.risk === 'high' ? ' — in the 100-year floodplain; expect fill, elevated slabs and floodplain permits.' : f.risk === 'moderate' ? ' — moderate risk (500-year floodplain).' : ' — outside the 100-year floodplain.') + ' (FEMA NFHL; at the middle of the site)');
  const w = ds.water; if (Array.isArray(w)) out.push(w.length ? 'Water / utility district: ' + w.map(x => x.name).join(', ') + '. Confirm capacity and annexation.' : 'No water or utility district (MUD) found here: water and sewer service needs to be confirmed.');
  if (Array.isArray(ds.schools) && ds.schools.length) out.push('School district: ' + ds.schools.join(', ') + '.');
  if (ds.opportunityZone === true) out.push('In a federal Opportunity Zone.');
  if (Array.isArray(ds.tirz) && ds.tirz.length) out.push('In ' + ds.tirz.join(', ') + '.');
  const r = ok(D.traffic) ? D.traffic.roads?.[0] : null; if (r) out.push('Busiest road nearby: ' + r.road + ', about ' + f0(r.aadt) + ' vehicles a day (TxDOT). Expect driveway permits and possibly turn lanes.');
  const e = D.environment; if (ok(e) && e.total != null) out.push(e.total ? e.total + ' EPA-regulated facilit' + (e.total === 1 ? 'y' : 'ies') + ' within ¼ mile' + (e.flaggedCount ? ', ' + e.flaggedCount + ' with violations or hazardous waste' : '') + '. A Phase I ESA is recommended.' : 'No EPA-regulated facilities within ¼ mile.');
  const missed = !d || d.error ? ['site facts (flood, districts, roads, EPA)'] : [['flood zone', f], ['water districts', w], ['traffic counts', D.traffic], ['EPA facilities', e], ['city limits', D.place]].filter(([, x]) => x?.error).map(([k]) => k);
  let ul = null; try { ul = u ? utilityLines(u) : null; } catch (x) { ul = null; }
  if (ul?.length) out.push(ul.slice(0, 4).join('. ') + '. Confirm capacity and service with each provider (OpenStreetMap, PUC Texas, City of Houston).');
  if (recs.length > 1) out.push(recs.length + ' parcels: a replat into one reserve or lot is likely needed.');
  if (T) { const l = TR.factLine(T, plan.ring); if (l) out.splice(1, 0, l); }
  const facts = PJ.siteFactsFrom(d || { error: 'none' }, { county, utilities: ul, parcels: recs.length, ground: T ? TR.groundFacts(T, plan.ring) : null });
  return { lines: out, d: D, terrain: T || null, jur: G.jurisdictionOf(d && !d.error ? facts : null, c), center: c, gone: [...missed, !u ? 'utilities' : null, !T ? 'ground elevations' : null].filter(Boolean) };
}
export function siteInfo(plan, label, city, county) {
  const a = SP.mainAngle(plan.ring), r = plan.ring.map(q => { const c = Math.cos(-a * Math.PI / 180), s = Math.sin(-a * Math.PI / 180); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c]; });
  const xs = r.map(q => q[0]), ys = r.map(q => q[1]), f = plan.front ?? SP.longestEdge(plan.ring), area = SP.ringArea(plan.ring);
  const side = (plan.streets || []).filter(k => k !== f && k < plan.ring.length).map(k => Math.round(SP.edgeLen(plan.ring, k))), boxA = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  return { acres: +(area / 43560).toFixed(3), widthFt: Math.round(Math.max(...xs) - Math.min(...xs)), depthFt: Math.round(Math.max(...ys) - Math.min(...ys)), frontageFt: Math.round(SP.edgeLen(plan.ring, f)),
    sideStreetsFt: side, shape: plan.ring.length <= 4 && area > boxA * 0.92 ? 'rectangular' : area > boxA * 0.8 ? 'mostly rectangular, ' + plan.ring.length + ' sides' : 'irregular, ' + plan.ring.length + ' sides (about ' + Math.round(area / boxA * 100) + '% of its bounding box)',
    streets: [f, ...(plan.streets || []).filter(k => k !== f)].filter(k => k < plan.ring.length).map(k => { const nm = plan.streetNames?.[k] || null; return { side: k === f ? 'front' : 'side', name: nm, highway: /\b(?:hwy|highway|fm|us|sh|i-?\d|interstate|freeway|parkway|tollway|loop)\b/i.test(nm || '') }; }),
    address: label || '', city: city || '', county: county || '', zoning: plan.zoning };
}
// what's around it for the best-use ideas: the nearest of each kind from the app's places (Overture and Foursquare open
// data; the browser asks OpenStreetMap's Overpass, which isn't used here), and the ZIP's rents and the tract's figures
const NEAR_KINDS = { grocery: /grocery|supermarket/i, restaurant: /restaurant|fast_food|cafe|coffee|bakery|pizza|burger|taco|sandwich|diner|grill|food/i, gas: /gas_station|fuel|convenience/i, pharmacy: /pharmacy|drugstore/i, school: /school/i, hospital: /hospital/i, clinic: /clinic|urgent|doctor|medical|dentist|dental|physician|health/i, hotel: /hotel|motel|lodging|inn\b/i, childcare: /child_?care|day_?care|preschool/i, storage: /storage/i, mall: /shopping_center|mall|department_store/i };
export async function nearbyFor(center) {
  const d = db(); if (!d) return {};
  const rows = await within(d.rpc('places_near', { p_lon: center[0], p_lat: center[1], p_m: 4828, p_n: 400 }).catch(() => []), 12000) || [];
  const out = {}, used = new Set(), it = p => ({ name: p.name || p.cat || 'place', miles: p.m != null ? +(p.m / 1609.344).toFixed(2) : null });
  for (const [k, re] of Object.entries(NEAR_KINDS)) { const hit = rows.filter(p => re.test((p.cat || '').replace(/_/g, ' ') + ' ' + (p.cat || '') + ' ' + (p.name || ''))).slice(0, 3); hit.forEach(p => used.add(p)); if (hit.length) out[k] = hit.map(it); }
  for (const p of rows) if (!used.has(p) && p.grp && Object.keys(out).length < 14) { const k = 'other ' + p.grp; if ((out[k] ||= []).length < 3) out[k].push(it(p)); } // the rest by the app's own groups
  return out;
}
export async function marketFor(center, zip) {
  const m = {};
  try { const a = await load('area.json'), r = zip && a?.rents?.zips?.[zip]; if (r) Object.assign(m, { zip, typicalRent: r.rent, rentChangeYearPct: r.yoy ?? null }); } catch (e) {}
  try { const t = await within(tractAt(center), 8000); const x = t?.t; if (x) Object.assign(m, { tractPopulation: x.pop ?? null, ['tractPopulationGrowthPctSince' + t.base]: x.gr ?? null, tractMedianHouseholdIncome: x.inc ?? null, tractMedianHomeValue: x.val ?? null, tractMedianRent: x.rent ?? null }); } catch (e) {}
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v != null));
}

// ---------- layouts (src/siteplan.js named, derive, forReview) ----------
const planOf = (v, plan) => ({ ...plan, setbacks: v.setbacks || plan.setbacks, program: v.program || plan.program, params: v.params || plan.params, zones: v.zones || plan.zones || [], elements: v.elements || [] });
export function named(list, plan, extra = {}) {
  const vs = list.map(r => { const v = { ...r, ...extra, arr: r.arr || RUN.baseName(r.name), setbacks: r.setbacks || plan.setbacks };
    if (r.pondDepth) v.params = G.withPondDepth({ ...plan, params: v.params || plan.params }, r.pondDepth).params;
    const p2 = planOf(v, plan); v.m = G.metrics(p2);
    if (v.elements?.length) { v.chk = K.checksOf(G.check(p2), v.m); v.m1 = v.elements.some(e => e.phase === 2) ? G.metrics({ ...p2, elements: v.elements.filter(e => e.phase !== 2) }) : null; }
    else v.chk = { bad: null, short: K.checksOf([], v.m).short };
    return v; });
  const keys = RUN.layoutKeys(vs), names = RUN.layoutNames(vs);
  return vs.map((v, i) => ({ ...v, rank: -i, key: keys[i], name: names[i] }));
}
const renumber = list => { const nm = RUN.layoutNames(list); return list.map((v, i) => ({ ...v, name: nm[i] })); };
const metricsOf = v => { const m = v.m, B = (v.elements || []).filter(e => e.kind === 'building');
  return { acres: +m.acres.toFixed(2), buildings: B.length, floorAreaSf: Math.round(m.gfa), units: m.units || 0, unitsPerAcre: +(m.duAc || 0).toFixed(1), parkingSpaces: m.spaces, parkingRequired: m.required, coveragePct: Math.round(m.coverage * 100), far: +m.far.toFixed(2), pondAcres: +(m.pond / 43560).toFixed(2), openSpacePct: Math.round(m.green * 100), leasableSf: Math.round(m.leasable || 0), sellableSf: Math.round(m.sellable || 0), leasablePlusSellableSf: Math.round(SP.lsfOf(m)), ...(v.pondDepth ? { pondDepthFtAssumed: v.pondDepth } : {}) }; };
async function forReview(list, plan, images) {
  const shots = images ? await (hooks.snapshots || chromiumShots)(list.slice(0, images).map(v => planSVG(G.effective(planOf(v, plan)), { px: 1000 }).svg)).catch(() => []) : [];
  return list.map((v, i) => ({ name: v.name || v.arr, notes: v.notes, issues: G.check(planOf(v, plan)).map(x => x.text).slice(0, 8), image: shots[i] || null, metrics: metricsOf(v) }));
}
// the AI's plan among the options (lib/planbrief.mjs), as the browser sends it with the review
const briefCheckOf = (pool, briefFor, dropped = null) => { const i = pool.findIndex(v => v.aiBrief), ab = i >= 0 ? pool[i].aiBrief : dropped?.brief; if (!ab) return {};
  return { briefCheck: { option: i >= 0 ? i : null, brief: ab.brief, reasons: ab.reasons, met: i >= 0 && !!ab.met, mayRevise: false, ...(i < 0 ? { dropped: dropped.reason } : {}) }, ...(briefFor ? { briefFor } : {}) }; };
function aiLayout(out, plan, prog, ab) {
  const pk = BR.pickBriefLayout(out, ab.brief); if (!pk.o) return { reason: pk.reason };
  const v = named([pk.o], { ...plan, program: pk.o.program || prog })[0];
  return { v: { ...v, key: 'ai|' + v.key, arr: 'AI’s plan · ' + v.arr, aiBrief: { ...ab, changed: BR.changedNotes(v.notes), met: BR.briefMet(v) } } };
}
const budget = () => hooks.budgetMs || BUDGET_MS;
// a home community's settings given as arguments (home_type, homes, pad_size, home_size, home_sf, buffer_ft) and the facts
// from reference files (references: "134 RV lots, 25' x 55' typ"): the program fields they set, and the words that say them
const dims = v => { const m = /(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)/i.exec(String(v ?? '')); return m ? [+m[1], +m[2]] : Array.isArray(v) && v.length === 2 && v.every(x => +x > 0) ? v.map(Number) : null; };
export function homeArgs(args = {}) {
  const refs = (Array.isArray(args.references) ? args.references : args.references ? [args.references] : []).map(x => clip(String(x || '').trim(), 300)).filter(Boolean).slice(0, 20);
  const kind = ['tiny', 'manufactured', 'mixed'].includes(args.home_type) ? args.home_type : null, o = {}, words = [];
  if (kind) { o.use = 'sfr'; o.homeKind = kind; words.push(kind === 'tiny' ? 'a tiny home community' : kind === 'manufactured' ? 'a manufactured home community' : 'a tiny home and manufactured home community'); }
  if (+args.homes > 0) { o.units = Math.round(+args.homes); words.push(o.units + ' homes'); }
  const refPad = () => { for (const r of refs) { if (!/\b(?:lots?|sites?|pads?|spaces?|typ)\b/i.test(r)) continue; const m = /(\d{2,3})\s*(?:'|ft|feet)?\s*(?:x|×|by)\s*(\d{2,3})\s*(?:'|ft|feet)?/i.exec(r); if (m && +m[1] >= 20 && +m[1] <= 80 && +m[2] >= 30 && +m[2] <= 150) return [+m[1], +m[2]]; } return null; }; // (an RV park's site size in a reference: "134 RV lots, 25' x 55' typ")
  const pad = dims(args.pad_size) || (kind || /tiny|mobile|manufactured|park model/i.test(String(args.request || '')) ? refPad() : null);
  if (pad) { const [a, b] = pad; o.lotW = Math.min(a, b); o.lotD = Math.max(a, b); o.lotSet = true; words.push(o.lotW + ' x ' + o.lotD + ' pads'); }
  const hs = dims(args.home_size); if (hs) { o.homeW = Math.min(...hs); o.homeD = Math.max(...hs); words.push('homes of ' + o.homeW + ' x ' + o.homeD + ' ft'); }
  if (+args.home_sf > 0) { o.homeSfMin = o.homeSfMax = Math.round(+args.home_sf); words.push(o.homeSfMin + ' sf homes'); }
  if (args.buffer_ft != null && +args.buffer_ft >= 0) { o.buffer = Math.round(+args.buffer_ft); words.push(o.buffer ? 'a ' + o.buffer + ' ft buffer along the property line' : 'lots to the property line'); }
  return { o, refs, words, any: Object.keys(o).length > 0 };
}

// ---------- the tool ----------
export async function sitePlanTool(args = {}, ctx = {}) {
  const t0 = now(), left = () => budget() - (now() - t0);
  // every AI call ends by the time left (less the PDF's share): one that runs over is treated as not answering
  const aiIn = b => { const ms = left() - RESERVE_MS; if (ms < 5000) return Promise.resolve({ status: 504, body: { error: 'out of time' } });
    let tm; return Promise.race([ai(b), new Promise(res => { tm = setTimeout(() => res({ status: 504, body: { error: 'the AI took too long' } }), ms); })]).finally(() => clearTimeout(tm)); };
  const level = EFFORTS.includes(args.effort) ? args.effort : 'medium', size = args.sheet === '24x36' ? 'archd' : 'tabloid';
  const HA = homeArgs(args), ask0 = clip([String(args.request || '').trim(), HA.words.length && !String(args.request || '').trim() ? HA.words.join(', ') : HA.words.length ? '(' + HA.words.join(', ') + ')' : ''].filter(Boolean).join(' '), 1200), goal = clip(String(args.goal || '').trim(), 600);
  // 1. the site
  const S = await parcelsFor(args), F0 = boxOf(S.recs.map(r => r.geometry));
  let roads = [], roadsNote = '';
  try { roads = await within(roadsNear(F0), 15000) || []; if (!roads.length) roadsNote = 'No road lines came back for the area, so the front is the longest side (a guess).'; } catch (e) { roadsNote = 'The road lines (US Census TIGERweb) didn’t answer (' + e.message + '), so the front is the longest side (a guess).'; }
  const { plan: plan0, guessed, frontNote } = await planFor(S.recs, roads, args.front_road ? clip(String(args.front_road), 60) : ''), Fr = SP.frame(plan0.origin), center = Fr.toLL(SP.centroid(plan0.ring));
  const parts = S.recs.length > 1 ? PARC.partsOf(plan0, S.recs.map((r, i) => ({ ...r, key: r.propId || String(i + 1) }))) : []; // (several parcels: each as a part, for the AI's reading and for laying them out one by one)
  const county = S.loc?.county?.name || (args.county ? String(args.county).replace(/\s+county$/i, '') : '') || '';
  // 2. what's known about it, and the jurisdiction (the Waller guardrails, as the app applies them)
  const FX = await factsFor(plan0, S.recs, county, t0), plan = { ...plan0, jur: FX.jur, ...(FX.terrain ? { terrain: FX.terrain } : {}) };
  const city = FX.d.place?.name || '', site = { ...siteInfo(plan, S.label, city, county), ...(parts.length > 1 ? { parcels: parts.map(q => ({ label: q.label, acres: q.acres, corner: q.corner, landlocked: q.landlocked, fronts: q.landlocked ? 'no street (reached across the site)' : q.corner ? 'two streets' : 'a street' })) } : {}) }, facts = FX.lines, guard = G.forAI(plan), withG = b => ({ ...b, ...(guard ? { guardrails: guard } : {}), ...(HA.refs.length ? { refs: HA.refs } : {}) });
  const notes = [], steps = [];
  if (frontNote) notes.push(frontNote); else if (roadsNote || guessed) notes.push(roadsNote || 'No street was found beside the parcel, so the front is its longest side (a guess).');
  if (FX.gone.length) notes.push('Not available for this plan: ' + FX.gone.join(', ') + '.');
  // 3. what to build: the request, or the AI's best-use ideas and the best one
  let ask = ask0 && args.answers ? ask0 + ' Answers: ' + clip(String(args.answers), 600) : ask0, ideas = null, ideaUsed = null, aiDown = '';
  if (!ask) {
    const zip = S.recs[0]?.zip || /\b(7[5-9]\d{3})\b/.exec(S.loc?.geocode?.matched || S.recs[0]?.situs || '')?.[1] || null;
    const [nearby, market] = await Promise.all([nearbyFor(center), marketFor(center, zip)]);
    const r = await aiIn({ mode: 'bestuse', prompt: goal, site, facts, nearby, market });
    if (r.status !== 200 || !r.body?.ideas?.length) {
      const why = r.status === 503 ? 'AI isn’t configured on this deployment' : (r.body?.error || 'the AI didn’t answer');
      return { content: [{ type: 'text', text: 'Best use: ' + why + ', so there are no ideas to lay out. Give a request instead (e.g. "25,000 sf retail strip with 2 pad sites").' }], isError: true };
    }
    ideas = { list: r.body.ideas, summary: r.body.summary || '' };
    const k = Number.isInteger(+args.idea) && +args.idea >= 1 && +args.idea <= ideas.list.length ? +args.idea - 1 : ideas.list.reduce((b, x, i, a) => x.fit > a[b].fit ? i : b, 0);
    ideaUsed = k; ask = ideas.list[k].request; steps.push('Best use: the AI suggested ' + ideas.list.length + ' uses; laid out #' + (k + 1) + ' (' + ideas.list[k].title + ').');
  }
  // 4. the program: planned first (Medium, High), then read by the AI (with none, the words are read directly)
  const L = ASK.effortOf(level);
  let prog = SP.guessProgram(ask), setbacks = plan.setbacks, summary = '', assumed = [], strategy = null, aiOk = false, model = null, aiB = null, aiBNote = '';
  const briefFor = L.plan && BR.asksBrief(L, ask) ? BR.briefContext(plan, SP.guessProgram(ask), { ask }) : null;
  if (L.plan && left() > 150000) {
    const s = await aiIn(withG({ mode: 'strategy', prompt: ask, site, facts, program: plan.program, effort: L.plan.effort, count: 1, ...(briefFor ? { briefFor } : {}) }));
    const pk = s.status === 200 ? s.body?.strategies?.[s.body.pick] || s.body?.strategies?.[0] : null;
    if (pk) { const { brief, briefNote, ...pk0 } = pk; strategy = { ...pk0, why: s.body.why || '' }; if (briefFor) { aiB = brief?.brief ? brief : null; aiBNote = briefNote || ''; } steps.push('Planned the site first (' + (pk.name || 'one plan') + ').'); model = s.model || model; }
    else if (s.status === 503) aiDown = 'AI isn’t configured on this deployment';
  } else if (L.plan) notes.push('Planning step skipped to stay inside the time limit.');
  if (!aiDown) {
    const r = await aiIn(withG({ prompt: ask, site, facts, program: plan.program, effort: L.effort, ...(strategy ? { strategy } : {}) }));
    if (r.status === 200 && r.body?.questions?.length && !args.answers && parts.length > 1) return { content: [{ type: 'text', text: 'Before laying out these ' + parts.length + ' parcels (' + parts.map(q => q.acres + ' ac' + (q.corner ? ', corner' : q.landlocked ? ', landlocked' : '')).join('; ') + '), the planner asks:\n' + r.body.questions.map((q, i) => (i + 1) + '. ' + q).join('\n') + '\nCall site_plan again with the same arguments plus answers (free text), or per_parcel with a request that says which use goes on which parcel.' }], questions: r.body.questions, parcels: parts.map(q => ({ label: q.label, acres: q.acres, corner: q.corner, landlocked: q.landlocked })) };
    if (r.status === 200 && r.body?.program) { prog = SP.keepNames(r.body.program, plan.program); setbacks = { ...SP.SETBACKS, ...r.body.setbacks }; summary = r.body.summary || ''; assumed = (r.body.assumptions || []).filter(Boolean); aiOk = true; model = r.model || model; }
    else aiDown = r.status === 503 ? 'AI isn’t configured on this deployment' : 'the AI didn’t answer';
  }
  if (!aiOk) { notes.push((aiDown || 'The AI didn’t answer') + ', so the request was read directly (no AI planning or review).'); strategy = null; aiB = null; aiBNote = ''; }
  if (aiB && prog?.zones?.length) { prog = BR.withPads(prog, aiB.brief.pads); aiB = null; }
  { const gw = SP.guessProgram(ask); if (gw.homeKind && (prog?.use !== 'sfr' || prog.zones?.length) && !HA.o.homeKind) { notes.push('The AI read the request as ' + (SP.USES[prog?.use]?.label || prog?.use || 'something else').toLowerCase() + '; it asks for a ' + SP.HOME_KINDS[gw.homeKind].label.toLowerCase() + ', so that is what is laid out.'); prog = { ...gw, ...(prog?.storm ? { storm: prog.storm } : {}) }; summary = ''; assumed = []; } } // (an RV park in a reference once read as self storage)
  { const kind = HA.o.homeKind || SP.normalizeProgram(prog || {}).homeKind || (HA.o.lotW || HA.o.homeW || HA.o.homeSfMin ? SP.homeKindOf(ask.toLowerCase()) : null); // (what the arguments say wins over the reading)
    if (HA.any && kind) { prog = { ...(prog?.use === 'sfr' && !prog.zones ? prog : { use: 'sfr' }), ...HA.o, homeKind: kind }; }
    else if (HA.o.units && ['sfr', 'townhomes', 'duplex', 'multifamily'].includes(prog?.use) && !prog.zones) prog = { ...prog, units: HA.o.units }; }
  const np = SP.normalizeProgram(prog), readAs = RUN.readAs(np, SP.USES), miss = RUN.notUnderstood(ask, np);
  // 5. the layouts
  const st0 = strategy?.settings || {}; let params0 = RUN.fillParams({ ...(st0.streets ? { streets: st0.streets } : {}), ...(strategy?.buildings?.form ? { form: strategy.buildings.form } : {}) }, { ask });
  if (np.form) params0 = { ...(params0 || {}), form: np.form };
  const ko = plan.elements.filter(e => e.kind === 'keepout'), koOpts = ko.length ? { keepout: ko } : {}, wb = BR.wordsBrief(ask);
  const planL = { ...plan, setbacks, ...(params0 ? { params: params0 } : {}) };
  const perParcel = parts.length > 1 && (np.parcels?.length || args.per_parcel === true); if (perParcel) steps.push('Laid out parcel by parcel: ' + parts.map(q => q.label + ' (' + q.acres + ' ac)').join(', ') + '.');
  let out = []; try { out = layoutOptions(planL, prog, { ...L.layout, deeper: true, ...koOpts, ...(wb ? { brief: wb } : {}), ...(perParcel ? { parcels: parts, perParcel: true } : {}) }); } catch (e) { notes.push('The layout engine failed: ' + e.message); }
  let variants = named(out, { ...planL, program: prog }, params0 ? { params: params0 } : {});
  let aiDrop = null;
  if (aiB) {
    if (BR.takesBrief(prog, aiB.brief)) {
      const bf = BR.briefForm(aiB.brief), planA = bf ? { ...planL, params: { ...(planL.params || {}), form: bf } } : planL; let got = null;
      try { got = aiLayout(layoutOptions(planA, prog, { count: 2, ...koOpts, brief: aiB.brief }), planA, prog, aiB); } catch (e) { got = null; }
      if (got?.v) variants = renumber(BR.placeAi(variants, got.v)); else { aiDrop = { brief: aiB, reason: got?.reason || 'the layout engine couldn’t lay it out' }; aiBNote = BR.droppedNote(aiB.brief, aiDrop.reason); }
    } else aiBNote = 'The AI’s plan is for shops and offices; this request reads as something else, so these are the engine’s own layouts.';
  }
  if (aiBNote) notes.push(aiBNote);
  // 6. the review (Medium: once; High: and once more after a revised program), inside the time left
  let aiPick = null, aiSummary = '', revisedWhy = '';
  const any = variants.some(v => v.elements?.length);
  if (aiOk && L.rounds > 0 && any) {
    if (left() < 60000) notes.push('The AI review was skipped to stay inside the time limit: the layouts are as the engine ranked them.');
    else {
      let pool = variants.filter(v => v.elements.length).slice(0, L.pool); const a = variants.find(v => v.aiBrief && v.elements.length); if (a && !pool.includes(a)) pool = pool.slice(0, Math.max(0, L.pool - 1)).concat([a]);
      const reviewOf = async (pl, pr, list, round) => aiIn(withG({ mode: 'review', prompt: ask, site, facts, program: pr, round, rounds: Math.max(1, Math.min(2, L.rounds)), effort: L.effort, options: await forReview(list, pl, L.images || 4), ...(strategy ? { strategy } : {}), ...(round === 1 ? briefCheckOf(list, briefFor, aiDrop) : {}) }));
      let rv = await reviewOf(planL, prog, pool, 1), extra = [];
      if (rv.status === 200) {
        let R = rv.body; steps.push('The AI reviewed ' + pool.length + ' layouts.');
        if (L.rounds >= 2 && R.revise && R.program && left() > 70000) {
          const params2 = RUN.fillParams({ ...(planL.params || {}), ...(R.params?.streets ? { streets: R.params.streets } : {}), ...(R.params?.form ? { form: R.params.form } : {}) }, { ask }), prog2 = { ...R.program, ...(R.params?.storm ? { storm: R.params.storm } : {}) };
          let out2 = []; try { out2 = layoutOptions({ ...plan, setbacks, params: params2 }, prog2, { ...(L.revise || { count: 3, depth: 6, budgetMs: 6000 }), ...koOpts, ...(wb ? { brief: wb } : {}) }); } catch (e) { out2 = []; }
          const v2 = named(out2, { ...planL, params: params2, program: prog2 }, { params: params2, revisedBy: R.why || 'the AI review' }).filter(v => v.elements.length).slice(0, 3);
          if (v2.length) {
            const nm = RUN.layoutNames([...variants, ...v2]); v2.forEach((v, k) => { v.name = nm[variants.length + k]; }); extra = v2; revisedWhy = R.why || 'a better program';
            const keep = [...new Set([...(R.ranking || []), ...pool.map((_, i) => i)])].filter(i => pool[i]).slice(0, 3), pool2 = keep.map(i => pool[i]).concat(v2);
            const rv2 = left() > 45000 ? await reviewOf({ ...planL, params: params2 }, prog2, pool2, 2) : null;
            if (rv2?.status === 200) { R = rv2.body; pool = pool2; steps.push('The AI revised the program (' + revisedWhy.replace(/\.$/, '') + ') and compared again.'); }
            else { R = { ...R, revise: false, reviews: (R.reviews || []).filter(r => keep.includes(r.option)).map(r => ({ ...r, option: keep.indexOf(r.option) })), ranking: keep.map((_, k) => k).concat(v2.map((_, k) => keep.length + k)) }; pool = pool2; steps.push('The AI revised the program (' + revisedWhy.replace(/\.$/, '') + '); the new layouts weren’t compared again in time.'); }
          }
        }
        const mr = RUN.mergeReviewed(variants, pool, R, extra); variants = mr.variants; aiSummary = mr.summary; aiPick = BR.fairPick(variants, mr.first) || null;
      } else notes.push('The AI review didn’t answer, so the layouts are as the engine ranked them.');
    }
  }
  // 7. the quality check of every layout (lib/planaudit.mjs), the pick (one that fails it gives way to one that passes) and the sheet
  const wants = { units: HA.o.units, homeKind: HA.o.homeKind || SP.guessProgram(ask).homeKind || null }; for (const x of variants) if (x.elements?.length) { try { x.audit = auditPlan(planOf(x, planL), wants); } catch (e) { x.audit = null; } }
  const L0 = RUN.landing(variants, aiPick); let pickI = L0.put, auditSwap = '';
  if (pickI >= 0 && variants[pickI].audit?.fails) { const j = variants.findIndex(x => x.elements?.length && x.audit && !x.audit.fails);
    if (j >= 0) { const f1 = variants[pickI].audit.items.find(i => i.level === 'fail'); auditSwap = variants[pickI].name + ' failed the quality check (' + f1.text.replace(/\.$/, '') + '), so ' + variants[j].name + ', which passes it, is the pick.'; pickI = j; } }
  if (pickI < 0) {
    const nf = K.noFit(ask, site.acres);
    return doc('Site plan: ' + S.label, [S.loc ? whereLine(S.loc) : 'Site: ' + S.label, 'Site: ' + n1(site.acres) + ' acres.', 'Request: ' + ask, '', 'Nothing fits that request on this site.' + (nf ? ' ' + nf : ''), ...notes.map(n => 'Note: ' + n)], sources(S, FX, roads));
  }
  const v = variants[pickI], pl = { ...planOf(v, planL), name: 'A', variant: { key: v.key, name: v.name } }, m = v.m;
  const sheetPlan = pl, audit = v.audit || auditPlan(sheetPlan, wants), checks = [...new Set([...G.check(sheetPlan).map(i => i.text), ...audit.items.filter(i => i.level !== 'pass' && i.area !== 'checks').map(i => i.text)])];
  // a Waller plan (inside the City of Waller or its ETJ): its scenarios A, B and C laid out for the guardrails page (SP-1A),
  // as the app's Site Plan PDF has them (src/siteplan.js scenarios)
  let guardPage = null;
  if (G.isOn(sheetPlan) && left() > 20000) try {
    const cands = [{ plan: sheetPlan, scenario: G.settingsOf(sheetPlan).scenario, onMap: true }];
    for (const sc of ['A', 'B', 'C']) { const p2 = G.withScenario({ ...sheetPlan, elements: plan.elements }, sc); let o = []; try { o = layoutOptions(p2, p2.program, { count: 3, ...koOpts }); } catch (e) { o = []; }
      cands.push(...o.filter(x => x.elements?.length).slice(0, 2).map(x => ({ plan: { ...p2, program: x.program || p2.program, params: x.params || p2.params, elements: x.elements }, scenario: sc }))); }
    const best = G.bestByScenario(cands); guardPage = { scen: Object.fromEntries(['A', 'B', 'C'].map(k => [k, best?.[k] || null])) };
  } catch (e) { guardPage = null; }
  let vicinity = ''; try { vicinity = serverKit(16).areaMap([{ geometry: { type: 'Polygon', coordinates: [pl.ring.concat([pl.ring[0]]).map(Fr.toLL)] }, stroke: '#c0392b', fill: 'rgba(192,57,43,.25)', width: 2 }], { W: 320, H: 190, px: 320, minSpanM: 3500, maxTiles: 16 }); } catch (e) { vicinity = ''; }
  const projectName = clip(args.project_name || S.label || 'Site plan', 80);
  // the picked layout and what was known about the site, kept for plan_set and site_renderings (a lost save costs only the id);
  // saved before the sheet is drawn, so the sheet can say its plan id (an agent that later reads the sheet finds it there)
  let planId = null, saveWhy = '';
  const st = store();
  if (!st) saveWhy = 'storage isn’t set up on this deployment (SUPABASE_SECRET_KEY)';
  else try { planId = newId(); await putJSON(st, 'plans/' + planId + '.json', savedPlan({ id: planId, plan: sheetPlan, v, audit, ask, projectName, preparedFor: clip(args.prepared_for || '', 80), S, county, facts, checks, vicinity, center })); }
  catch (e) { planId = null; saveWhy = 'it couldn’t be saved (' + clip(e.message, 120) + ')'; }
  const html = sheetHTML({ plan: sheetPlan, planName: 'Option A · ' + v.name, project: { name: projectName }, size, parcels: S.recs.map(r => ({ label: r.label, owner: r.owner, propId: r.propId, acres: r.acres })), facts, notes: planId ? checks.concat(['Saved as REI plan id ' + planId + ': plan_set and site_renderings work from exactly this layout.']) : checks, vicinity, renders: [], ...(guardPage ? { guard: guardPage } : {}),
    address: S.recs[0]?.label || S.label, county: county ? county + ' County, Texas' : '', date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), preparedFor: clip(args.prepared_for || '', 80), boundarySource: S.source });
  let pdf = null, pdfWhy = '';
  try { pdf = Buffer.from(await (hooks.render || chromium)(html, { sheet: size, title: projectName + ' — Site plan' })); if (pdf.length > (ctx.pdfLimit || PDF_LIMIT)) { pdfWhy = 'The sheet PDF came out at ' + (pdf.length / 1048576).toFixed(1) + ' MB, over what fits in one answer here.'; pdf = null; } }
  catch (e) { pdfWhy = 'The sheet PDF couldn’t be made (' + e.message + ').'; }
  // 8. the answer
  const rows = variants.filter(x => x.elements?.length).slice(0, 8).map(x => { const c = K.checkLabel(x.chk, { waller: G.isOn(planOf(x, planL)) }), mm = x.m;
    return '| ' + [x === v ? '**' + x.name + '** (picked)' : x.name, f0(mm.gfa) + ' sf', mm.units ? f0(mm.units) : '—', f0(mm.spaces) + ' / ' + f0(mm.required), Math.round(mm.coverage * 100) + '%', x.audit ? (x.audit.fails ? '✗ ' + x.audit.fails + ' failed' : x.audit.warns ? '! ' + x.audit.warns + ' note' + (x.audit.warns > 1 ? 's' : '') : '✓ ready') : '—', c.text, x.ai ? x.ai.score + '/100' : '—'].join(' | ') + ' |'; });
  const passing = K.passes(v.chk) !== false, noneOk = !variants.some(x => x.elements?.length && K.passes(x.chk));
  const why = (auditSwap ? auditSwap + ' ' : '') + (v.ai?.verdict && !auditSwap ? 'The AI’s pick: ' + v.ai.verdict : L0.ai >= 0 && L0.failing ? 'The AI’s pick failed a check, so the best layout that passes is used.' : passing ? K.engineReason(variants, pickI) + '.' : 'No layout passes every check; this is the planner’s first one (' + K.checkLabel(v.chk).text.toLowerCase() + ').')
    + (noneOk && v.ai?.verdict ? ' Note: no layout passes every check (this one: ' + K.checkLabel(v.chk).text.toLowerCase() + ').' : '');
  const L1 = [S.loc ? whereLine(S.loc) : 'Site: ' + S.label,
    'Site: ' + n1(site.acres) + ' acres, ' + site.shape + '; front ' + f0(site.frontageFt) + ' ft' + (plan.streetNames?.[plan.front] ? ' on ' + plan.streetNames[plan.front] : '') + (guessed ? ' (guessed: longest side)' : '') + (site.sideStreetsFt.length ? '; side street' + (site.sideStreetsFt.length > 1 ? 's ' : ' ') + site.sideStreetsFt.map(f0).join(', ') + ' ft' : '') + (S.recs.length > 1 ? '; ' + S.recs.length + ' parcels merged' : '') + '.',
    ...(jurLine(FX.d) ? ['Jurisdiction: ' + jurLine(FX.d)] : []),
    ...(G.isOn(sheetPlan) ? ['Laid out under the City of Waller planning guardrails (concept numbers, conservative scenario B unless set).'] : []),
    'Quality check: ' + audit.verdict.toUpperCase() + ' (' + audit.fails + ' failed, ' + audit.warns + ' to note, ' + audit.passes + ' passed)' + (audit.fails ? ' — do not hand this plan over as it is; see ## Quality check.' : audit.warns ? ' — fine to share, with the notes below.' : '.'),
    planId ? 'Plan id: ' + planId + ' (give it to plan_set for a schematic set of plans, or site_renderings for photoreal views, of exactly this layout).' : 'Plan id: none, ' + saveWhy + '; plan_set and site_renderings need one.',
    '', 'Request: "' + ask + '"' + (ideaUsed != null ? ' (best-use idea #' + (ideaUsed + 1) + ')' : ''),
    'Read as: ' + readAs.join(' · ') + (miss.length ? ' (not understood: ' + miss.join(', ') + ')' : ''),
    ...(summary ? ['AI: ' + summary] : []), ...(assumed.length ? ['Assumed: ' + assumed.join('; ')] : []),
    ...(strategy ? ['Plan for the site: ' + [strategy.name, strategy.why].filter(Boolean).join(' — ')] : []),
    '', '## Layouts', '| Layout | Floor area | Units | Parking (have / need) | Coverage | Quality | Checks | AI score |', '|---|---|---|---|---|---|---|---|', ...rows,
    '', '## Picked: ' + v.name, why,
    ...kvLines(m, v), ...fillNote(np, v, planL),
    ...(v.notes?.length ? ['Layout notes: ' + v.notes.slice(0, 6).join(' ')] : []),
    ...(v.ai?.problems?.length ? ['Problems the AI saw: ' + v.ai.problems.join('; ')] : []),
    '', '## Quality check: ' + audit.verdict, ...auditLines(audit, 18),
    ...(G.check(sheetPlan).length ? ['Checks: ' + G.check(sheetPlan).map(i => i.text).slice(0, 6).join('; ')] : []),
    ...(aiSummary ? ['', 'AI review: ' + aiSummary] : []),
    ...(ideas ? ['', '## Best-use ideas' + (ideas.summary ? ': ' + ideas.summary : ''), ...ideas.list.map((x, i) => (i + 1) + '. ' + x.title + ' (fit ' + x.fit + '/100)' + (i === ideaUsed ? ' — laid out' : '') + ': ' + x.why + (x.risks?.length ? ' Risks: ' + x.risks.join('; ') + '.' : '') + ' Request: "' + x.request + '"'), 'To lay out another idea, call site_plan again with idea: <number> (or its request).'] : []),
    '', 'Steps: ' + (steps.length ? steps.join(' ') : 'Laid out from the request.') + ' Effort ' + level + (model ? ' · AI model ' + model : '') + '.',
    ...notes.map(n => 'Note: ' + n),
    'Concept only: for feasibility, not for construction or permitting. Zoning, deed restrictions, drainage, utilities capacity, traffic and title are not resolved. To refine it (move buildings, change the program, Ask AI, plan sets), open the parcel in Real Estate Intelligence and use Site plan.'];
  const text = doc('Site plan: ' + S.label, L1, sources(S, FX, roads));
  const content = [{ type: 'text', text: text + (pdf ? '\n\nAttached: conceptual site plan report PDF (' + pages(pdf) + ' page' + (pages(pdf) === 1 ? '' : 's') + ', ' + Math.round(pdf.length / 1024) + ' KB, ' + (size === 'archd' ? '24 × 36' : '11 × 17') + ').' : '\n\n' + pdfWhy) }];
  const name = slug(projectName + ' site plan');
  if (pdf) content.push({ type: 'resource', resource: { uri: 'report://site_plan/' + name + '.pdf', mimeType: 'application/pdf', blob: pdf.toString('base64') } });
  if (args.include_geojson) content.push({ type: 'resource', resource: { uri: 'report://site_plan/' + name + '.geojson', mimeType: 'application/geo+json', text: JSON.stringify(layoutGeoJSON(sheetPlan)) } });
  return { content };
}
// what a saved plan holds (store: plans/<id>.json): the layout as the sheet drew it, and the site's facts, parcels and
// vicinity map, which a plan set's cover and civil sheets need and the plan alone doesn't carry
export function savedPlan({ id, plan, v, audit, ask, projectName, preparedFor, S, county, facts, checks, vicinity, center }) {
  return { v: 1, id, at: new Date().toISOString(), plan, layout: v.name, verdict: audit.verdict, fails: audit.fails, request: ask, projectName, preparedFor,
    address: S.recs[0]?.label || S.label, label: S.label, county: county ? county + ' County, Texas' : '', center,
    parcels: S.recs.map(r => ({ label: r.label, owner: r.owner, propId: r.propId, acres: r.acres })), boundarySource: S.source, facts, checks, vicinity };
}
// inside a city's limits, within half a mile of one (its possible ETJ), or neither (US Census TIGERweb places)
const jurLine = D => { const ok = x => x != null && !x.error; if (D.place === undefined || !ok(D.place) && D.place !== null) return '';
  if (D.place?.name) return 'inside the city limits of ' + D.place.name + ' (Census TIGERweb; confirm with the city).';
  const near = Array.isArray(D.near) ? D.near.map(x => x?.name).filter(Boolean) : null;
  return near?.length ? 'outside city limits, within 0.5 mile of ' + near.slice(0, 2).join(' and ') + ' (likely in its extraterritorial jurisdiction, ETJ: confirm).' : near ? 'unincorporated: outside city limits and more than 0.5 mile from any city (county rules).' : 'outside city limits (whether it is in a city’s ETJ wasn’t checked).'; };
// the land the request didn't need gets more of the program (the app's default, "Leftover land: Filled"): say so, and how to hold it
function fillNote(np, v, plan) {
  const asked = K.askedOf(np), m = v.m1 || v.m, phase2 = v.elements?.some(e => e.phase === 2), fill = RUN.leftoverOf(v.params || plan.params);
  const more = asked?.units ? m.units > asked.units * 1.15 : asked?.gfa ? m.gfa > asked.gfa * 1.15 : false;
  if (phase2) return ['The land the request didn’t need is laid out as Phase 2 (in the totals above; Phase 1 alone: ' + f0((v.m1 || v.m).gfa) + ' sf' + ((v.m1 || v.m).units ? ', ' + f0((v.m1 || v.m).units) + ' units' : '') + ').'];
  if (more && fill === 'fill') return ['More than asked: the app fills the land the request doesn’t need with more of the program (' + (asked.units ? f0(asked.units) + ' units asked' : f0(asked.gfa) + ' sf asked') + '). To keep only what was asked, add "leave the rest of the land for later" to the request (or "as a Phase 2").'];
  return [];
}
function kvLines(m, v) {
  const out = ['Floor area ' + f0(m.gfa) + ' sf (FAR ' + m.far.toFixed(2) + ')' + (m.units ? ' · ' + f0(m.units) + ' units (' + (m.duAc || 0).toFixed(1) + '/acre)' : '') + ' · ' + (v.elements || []).filter(e => e.kind === 'building').length + ' buildings',
    'Parking ' + f0(m.spaces) + ' spaces for ' + f0(m.required) + ' required · coverage ' + Math.round(m.coverage * 100) + '% · detention ' + (m.pond / 43560).toFixed(2) + ' ac · open space ' + Math.round(m.green * 100) + '%'];
  if (SP.lsfOf(m)) out.push('Leasable + sellable ' + f0(SP.lsfOf(m)) + ' sf');
  return out;
}
const sources = (S, FX, roads) => [
  { name: S.recs.length > 1 ? 'County appraisal district parcel outlines (merged)' : S.source === 'a boundary drawn on the map' ? 'The outline given' : (S.recs[0]?.source || 'Texas GIO StratMap') + ' parcel outline', asOf: 'live', url: 'https://geographic.texas.gov/', coverage: 'Texas' },
  { name: 'US Census TIGERweb roads (front and side streets)', asOf: 'current TIGER vintage', url: 'https://tigerweb.geo.census.gov/', coverage: 'the United States' },
  { name: 'Site facts: FEMA NFHL, TCEQ districts, TxDOT counts, EPA ECHO; utilities (OpenStreetMap ODbL, PUC Texas); USGS 3DEP ground', asOf: 'live', url: 'https://hazards.fema.gov/', coverage: 'Texas (FEMA, EPA, USGS: US)' },
  { name: 'Layout: Real Estate Intelligence site layout engine; program and review by AI', asOf: 'this run', url: 'https://fs-real-estate-intelligence.vercel.app/', coverage: 'concept plans' }];
// the picked layout's pieces in lon/lat: buildings, parking, drives, ponds, open space, with their use and size
export function layoutGeoJSON(plan) {
  const F = SP.frame(plan.origin), el = G.effective(plan).elements || [], close = r => r.concat([r[0]]);
  const features = [{ type: 'Feature', properties: { kind: 'site', acres: +(SP.ringArea(plan.ring) / 43560).toFixed(3) }, geometry: { type: 'Polygon', coordinates: [close(plan.ring).map(F.toLL)] } }];
  for (const e of el) { let o = null; try { o = SP.outline(e); } catch (x) { o = null; } if (!o || o.length < 3) continue;
    const props = Object.fromEntries(Object.entries({ kind: e.kind, use: e.use || null, name: e.name || null, floors: e.floors || null, floorAreaSf: e.kind === 'building' ? Math.round(SP.gfaOf(e)) : null, units: e.units || null, stalls: e.kind === 'parking' ? e.stalls || null : null, phase: e.phase || null }).filter(([, v]) => v != null));
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [close(o).map(p => F.toLL(p).map(v => +v.toFixed(7)))] } }); }
  return { type: 'FeatureCollection', features };
}
