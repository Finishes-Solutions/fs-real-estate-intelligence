// TABS list row + detail + geocode + AI fields -> one filing record. Shared by the regional JSON build and the statewide database backfill.
import { geoContains } from 'd3-geo';
import { iso } from './util.mjs';
import { minVertexDist } from './geometry.mjs';

export const TYPE = { 9001: 'New', 9002: 'Reno', 9003: 'Addition' };
export const STATUS = { 3001: 'Inspection complete', 3007: 'Closed', 3008: 'Registered', 3009: 'Review complete' };

// ---- timeline dates: filer estimates when usable, otherwise inferred and flagged ----
const okDate = s => /^\d{4}-\d\d-\d\d$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2045;
const addMonths = (s, m) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.round(m * 30.44)); return iso(d); };
const DUR = { New: [6, 4], Reno: [3, 2], Addition: [4, 3], Other: [4, 2] }; // months = base + k * log10(cost / $50K)
export function timeline(type, cost, reg, start, end) {
  const s = okDate(start) ? start : reg, sE = !okDate(start);
  if (okDate(end) && end >= s) return { ts: s, te: end, tsE: sE, teE: false };
  const [b, k] = DUR[type] || DUR.Other, m = Math.max(2, Math.min(36, b + k * Math.log10(Math.max(cost, 5e4) / 5e4)));
  return { ts: s, te: addMonths(s, m), tsE: sE, teE: true };
}

// r: TABS list row merged with detail fields (street, cityLine, owner, scope, sqft, design, tenant, facility, city, _county)
// loc: { c: [lon, lat], src } | undefined; ai: enrichment fields | null; countyGeom: GeoJSON MultiPolygon | undefined
// fullScope keeps the whole scope text (database); otherwise it is trimmed for the browser JSON.
export function toFiling(r, loc, ai, countyGeom, { fullScope = false } = {}) {
  const sq = parseInt(String(r.sqft || '').replace(/[^\d]/g, ''), 10);
  const scope = (r.scope || '').replace(/\s+/g, ' ').trim(), type = TYPE[r.TypeOfWork] || 'Other', cost = r.EstimatedCost || 0;
  const reg = (r.ProjectCreatedOn || '').slice(0, 10), start = (r.EstimatedStartDate || '').slice(0, 10), end = (r.EstimatedEndDate || '').slice(0, 10);
  const f = { id: r.ProjectNumber, name: (r.ProjectName || '').replace(/\s+/g, ' ').trim(), county: r._county, city: r.city, addr: [r.street, r.cityLine].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    type, cost, sqft: sq > 1 ? sq : null, owner: (r.owner || '').trim(), scope: fullScope || scope.length <= 260 ? scope : scope.slice(0, 250).replace(/\s\S*$/, '') + '…',
    reg, status: STATUS[r.ProjectStatus] || '', start, end, ...timeline(type, cost, reg, start, end) };
  if (loc) {
    const c = loc.c; f.lat = Math.round(c[1] * 1e5) / 1e5; f.lon = Math.round(c[0] * 1e5) / 1e5;
    if (loc.src === 'city') f.approx = true;
    if (loc.via) f.gp = loc.via;
    if (countyGeom && !geoContains(countyGeom, c) && minVertexDist(countyGeom, c) > 0.12) f.misfiled = true;
  }
  ai = ai || {};
  if (ai.use) Object.assign(f, { use: ai.use, sub: ai.subtype || '', ten: ai.tenant || '', dev: ai.developer || '', arch: ai.architect || (r.design || '').trim(), gc: ai.gc || '', units: ai.units ?? null, sum: ai.summary || '' });
  else if (r.design) f.arch = r.design.trim();
  return f;
}

// geocoder plausibility check: the point must fall in (or within ~8 km of) the county the filing was registered in
export function countyCheck(outlines) {
  return (r, c) => { const g = outlines[r._county]; return !g || geoContains(g, c) || minVertexDist(g, c) < 0.08; };
}

const d = s => s || null;
// compact filing -> public.filings row
export function toRow(f, r, fips) {
  return { id: f.id, name: f.name, county: f.county, fips, city: d(f.city), zip: d(r.zip), addr: d(f.addr), type: f.type, cost: f.cost, sqft: f.sqft && f.sqft < 2e9 ? f.sqft : null, owner: d(f.owner), scope: d(f.scope),
    reg: d(f.reg), status: d(f.status), est_start: d(f.start), est_end: d(f.end), ts: d(f.ts), te: d(f.te), ts_est: f.tsE, te_est: f.teE,
    lat: f.lat ?? null, lon: f.lon ?? null, approx: !!f.approx, misfiled: !!f.misfiled, geo_src: f.gp || null,
    use: d(f.use), subtype: d(f.sub), tenant: d(f.ten), developer: d(f.dev), architect: d(f.arch), gc: d(f.gc), units: f.units ?? null, summary: d(f.sum),
    design_firm: d((r.design || '').trim()), tabs_tenant: d((r.tenant || '').trim()), facility: d((r.facility || '').trim()), updated_at: new Date().toISOString() };
}
