// Houston crime (Houston Police NIBRS incidents, loaded nightly into Supabase by build/live-sync.mjs):
//   GET  ?grid=1                         the map layer: last-12-month incidents summed onto ~400 m cells [[lon, lat, violent, property, other], …]
//   GET  ?lat=..&lon=..&mi=0.5[&list=N]  report for a circle
//   POST { geometry, list? }             report for any area (a selection box, polygon, county or radius drawn on the map)
// A report has totals by category for the last 12 months and the 12 before, incidents per square mile vs the city,
// top offenses and premises, a monthly series, and (with list) the incidents themselves, newest first.
// "Last 12 months" ends at the newest incident HPD has published (its file runs about three months behind).
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { offenseName } from '../lib/nibrs.mjs';

export const HOUSTON_SQMI = 640; // City of Houston land area, for the citywide rate
export const COVERAGE = 'City of Houston only (Houston Police Department). Incidents outside the city limits, including unincorporated Harris County and other cities, are not included.';

export function circle(lon, lat, mi, n = 64) {
  const r = mi / 69.0, k = Math.cos(lat * Math.PI / 180), ring = [];
  for (let i = 0; i <= n; i++) { const a = (i % n) / n * 2 * Math.PI; ring.push([Math.round((lon + r * Math.cos(a) / k) * 1e6) / 1e6, Math.round((lat + r * Math.sin(a)) * 1e6) / 1e6]); }
  return { type: 'Polygon', coordinates: [ring] };
}
// accept a GeoJSON Feature or geometry; Polygon / MultiPolygon only, bounded size
export function cleanGeometry(g) {
  const geom = g?.type === 'Feature' ? g.geometry : g;
  if (!geom || !['Polygon', 'MultiPolygon'].includes(geom.type) || !Array.isArray(geom.coordinates)) return null;
  const pts = JSON.stringify(geom.coordinates).split('],[').length;
  if (pts > 50000) return null;
  return { type: geom.type, coordinates: geom.coordinates };
}
const pct = (a, b) => b ? Math.round((a / b - 1) * 100) : null;
// crime_report() jsonb -> the shape the card, the report and the assistant use
export function shapeReport(r, list) {
  if (!r?.latest) return { latest: null, note: 'No crime data loaded yet.' };
  const t = r.totals || {}, cur = { v: +t.last12_v || 0, p: +t.last12_p || 0, o: +t.last12_o || 0 }, pri = { v: +t.prior12_v || 0, p: +t.prior12_p || 0, o: +t.prior12_o || 0 };
  cur.total = cur.v + cur.p + cur.o; pri.total = pri.v + pri.p + pri.o;
  const area = +r.area_sqmi || 0, city = r.city_last12 || {}, cityTot = (+city.v || 0) + (+city.p || 0) + (+city.o || 0);
  const per = (n, a) => a > 0 ? Math.round(n / a) : null;
  return {
    latest: r.latest, from: r.from, area_sqmi: area,
    last12: cur, prior12: pri, change: { total: pct(cur.total, pri.total), v: pct(cur.v, pri.v), p: pct(cur.p, pri.p), o: pct(cur.o, pri.o) },
    per_sqmi: area >= 0.05 ? { total: per(cur.total, area), v: per(cur.v, area), p: per(cur.p, area) } : null,
    city_per_sqmi: cityTot ? { total: per(cityTot, HOUSTON_SQMI), v: per(+city.v || 0, HOUSTON_SQMI), p: per(+city.p || 0, HOUSTON_SQMI) } : null,
    offenses: (r.by_code || []).map(([code, n, cat]) => ({ code, name: offenseName(code), cat, n: +n })),
    premises: (r.by_premise || []).map(([premise, n]) => ({ premise, n: +n })),
    months: (r.by_month || []).map(([m, v, p, o]) => ({ m, v: +v, p: +p, o: +o })),
    incidents: list ? list.map(x => ({ day: x.day, code: x.code, offense: offenseName(x.code), cat: x.cat, n: x.n, premise: x.premise, lon: x.lon, lat: x.lat })) : undefined,
    coverage: COVERAGE
  };
}
export async function crimeReport(db, geometry, list = 0) {
  const [r, rows] = await Promise.all([db.rpc('crime_report', { p_geom: geometry }), list ? db.rpc('crime_list', { p_geom: geometry, p_limit: Math.min(20000, list) }) : null]);
  return shapeReport(r, rows);
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 40, perDay: 1500 })) return;
  const db = supa(); if (!db) return res.status(503).json({ error: 'Crime data needs the database (SUPABASE_URL and SUPABASE_SECRET_KEY on the server).' });
  const q = req.query || {};
  try {
    if (q.grid) {
      const cell = 0.004, [rows, latest] = await Promise.all([db.rpc('crime_grid', { p_cell: cell }), db.rpc('crime_latest', {})]);
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
      return res.json({ cell, latest, cells: (rows || []).map(r => [Math.round(r.x * 1e4) / 1e4, Math.round(r.y * 1e4) / 1e4, +r.v, +r.p, +r.o]).filter(c => c[2] + c[3] + c[4] > 0), coverage: COVERAGE });
    }
    let geometry, list = 0;
    if (req.method === 'POST') { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}; geometry = cleanGeometry(b.geometry); list = +b.list || 0; }
    else { const lat = +q.lat, lon = +q.lon, mi = Math.min(10, Math.max(0.05, +q.mi || 0.5)); if (lat > 25 && lat < 37 && lon > -107 && lon < -93) geometry = circle(lon, lat, mi); list = +q.list || 0; }
    if (!geometry) return res.status(400).json({ error: 'Send a Polygon or MultiPolygon geometry (POST) or lat, lon and mi.' });
    const d = await crimeReport(db, geometry, list);
    res.setHeader('Cache-Control', req.method === 'POST' ? 'no-store' : 'public, max-age=3600, s-maxage=86400');
    return res.json(d);
  } catch (e) {
    console.error('crime', e.message); res.setHeader('Cache-Control', 'no-store');
    return res.status(/too large/.test(e.message) ? 400 : 502).json({ error: /too large/.test(e.message) ? 'That area is too large for a crime report (over 1,500 square miles).' : 'Crime data is unavailable right now.' });
  }
}
