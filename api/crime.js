// Houston crime (Houston Police NIBRS incidents, loaded nightly into Supabase by build/live-sync.mjs):
//   GET  ?grid=1                         the map layer: last-12-month incidents summed onto ~400 m cells [[lon, lat, violent, property, other], …]
//   GET  ?lat=..&lon=..&mi=0.5[&list=N]  report for a circle
//   POST { geometry, list? }             report for any area (a selection box, polygon, county or radius drawn on the map)
//   GET  ?city=1                         the whole City of Houston (Market view): four quarter-boxes summed, each under the
//                                        1,500 sq mi report limit; the boxes cover all of HPD's data, so nothing is missed
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
    // when: hour of day and day of week (last 12 months), and every year kept, with Houston's own totals for comparison
    hours: (r.by_hour || []).map(([h, v, p, o]) => ({ h: +h, v: +v, p: +p, o: +o })),
    weekdays: (r.by_dow || []).map(([d, v, p, o]) => ({ d: +d, v: +v, p: +p, o: +o })),
    years: (r.by_year || []).map(([y, v, p, o, d0, d1]) => ({ y: +y, v: +v, p: +p, o: +o, total: +v + +p + +o, from: d0, to: d1, days: d0 && d1 ? Math.round((Date.parse(d1) - Date.parse(d0)) / 864e5) + 1 : null })),
    city_years: (r.city_by_year || []).map(([y, n]) => ({ y: +y, n: +n })),
    incidents: list ? list.map(x => ({ day: x.day, code: x.code, offense: offenseName(x.code), cat: x.cat, n: x.n, premise: x.premise, lon: x.lon, lat: x.lat })) : undefined,
    coverage: COVERAGE
  };
}
export async function crimeReport(db, geometry, list = 0) {
  const [r, rows] = await Promise.all([db.rpc('crime_report', { p_geom: geometry }), list ? db.rpc('crime_list_json', { p_geom: geometry, p_limit: Math.min(20000, list) }) : null]);
  return shapeReport(r, rows);
}

// the HPD data's extent (the city plus the airports and annexed strips) in four boxes
export const CITY_BOXES = (() => { const w = -95.92, e = -94.98, s = 29.50, n = 30.17, mx = (w + e) / 2, my = (s + n) / 2;
  return [[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]].map(([a, b, c, d]) => ({ type: 'Polygon', coordinates: [[[a, b], [c, b], [c, d], [a, d], [a, b]]] })); })();
// several reports -> one (totals, months and offense / premise lists summed; per-sq-mi over the city's land area)
export function mergeReports(list) {
  const ok = list.filter(r => r?.latest); if (!ok.length) return { latest: null, note: 'No crime data loaded yet.' };
  const add = (k, f) => ok.reduce((a, r) => a + (f(r)[k] || 0), 0), cur = {}, pri = {};
  for (const k of ['v', 'p', 'o', 'total']) { cur[k] = add(k, r => r.last12); pri[k] = add(k, r => r.prior12); }
  const by = (key, field) => { const m = new Map(); ok.forEach(r => (r[field] || []).forEach(x => { const id = x[key]; const y = m.get(id) || { ...x, n: 0 }; y.n += x.n; m.set(id, y); })); return [...m.values()].sort((a, b) => b.n - a.n); };
  const months = new Map(); ok.forEach(r => (r.months || []).forEach(x => { const y = months.get(x.m) || { m: x.m, v: 0, p: 0, o: 0 }; y.v += x.v; y.p += x.p; y.o += x.o; months.set(x.m, y); }));
  const pct = (a, b) => b ? Math.round((a / b - 1) * 100) : null;
  return { latest: ok.map(r => r.latest).sort().pop(), from: ok.map(r => r.from).sort()[0], area_sqmi: HOUSTON_SQMI, last12: cur, prior12: pri,
    change: { total: pct(cur.total, pri.total), v: pct(cur.v, pri.v), p: pct(cur.p, pri.p), o: pct(cur.o, pri.o) },
    per_sqmi: { total: Math.round(cur.total / HOUSTON_SQMI), v: Math.round(cur.v / HOUSTON_SQMI), p: Math.round(cur.p / HOUSTON_SQMI) },
    offenses: by('code', 'offenses').slice(0, 25), premises: by('premise', 'premises').slice(0, 15), months: [...months.values()].sort((a, b) => a.m.localeCompare(b.m)), coverage: COVERAGE };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 40, perDay: 1500 })) return;
  const db = supa(); if (!db) return res.status(503).json({ error: 'Crime data needs the database (SUPABASE_URL and SUPABASE_SECRET_KEY on the server).' });
  const q = req.query || {};
  try {
    if (q.grid) {
      // one jsonb array: PostgREST would cap a table result at 1,000 rows (the grid has ~7,500 cells)
      const cell = 0.004, [rows, latest] = await Promise.all([db.rpc('crime_grid_json', { p_cell: cell }), db.rpc('crime_latest', {})]);
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
      return res.json({ cell, latest, cells: (rows || []).map(c => [+c[0], +c[1], +c[2], +c[3], +c[4]]).filter(c => c[2] + c[3] + c[4] > 0), coverage: COVERAGE });
    }
    if (q.city) {
      const d = mergeReports(await Promise.all(CITY_BOXES.map(g => crimeReport(db, g))));
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
      return res.json(d);
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
