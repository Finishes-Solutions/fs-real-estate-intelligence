// Houston Police Department NIBRS incidents (public yearly CSV, one row per offense, geocoded to the block).
// https://www.houstontx.gov/police/cs/xls/NIBRSPublicView<year>.csv
// Columns: Incident, Occurrence Date, Occurrence Hour, NIBRS Class, NIBRS Description, Offense Count, Beat, Premise,
//          Street Number, Street Name, Street Type, Street Suffix, City, ZIP Code, Map Longitude, Map Latitude
import { csvLine } from './csv.mjs';

export const HPD_CSV = year => 'https://www.houstontx.gov/police/cs/xls/NIBRSPublicView' + year + '.csv';
// FBI summary groups: violent (murder, rape, robbery, aggravated assault) and property (burglary, theft, vehicle theft, arson, vandalism)
const VIOLENT = new Set(['09A', '09B', '11A', '11B', '11C', '120', '13A']);
export function category(code) {
  const c = String(code || '').trim().toUpperCase();
  if (VIOLENT.has(c)) return 'v';
  if (c === '200' || c === '220' || c === '240' || c === '290' || /^23[A-H]$/.test(c)) return 'p';
  return 'o';
}
// CSV text -> rows for public.crime_incidents (only rows with a usable point inside the Houston area)
export function parseHpd(csv, { since = '0000-00-00' } = {}) {
  const lines = String(csv).split(/\r?\n/), h = csvLine(lines[0]).map(s => s.trim());
  const ix = n => h.indexOf(n), iI = ix('Incident'), iD = ix('Occurrence Date'), iC = ix('NIBRS Class'), iN = ix('Offense Count'), iP = ix('Premise'), iX = ix('Map Longitude'), iY = ix('Map Latitude');
  if ([iI, iD, iC, iX, iY].some(i => i < 0)) throw new Error('unexpected HPD header: ' + lines[0].slice(0, 120));
  const out = new Map();
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue; const c = csvLine(lines[k]);
    const day = String(c[iD] || '').slice(0, 10), lon = +c[iX], lat = +c[iY], code = String(c[iC] || '').trim().toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < since || !code) continue;
    if (!(lon < -94.5 && lon > -96.5 && lat > 29 && lat < 30.6)) continue; // ungeocoded rows carry 0 or a placeholder
    const id = String(c[iI]).trim() + ':' + code; // one incident can list several offense classes
    const prev = out.get(id), n = Math.max(1, Math.min(99, parseInt(c[iN], 10) || 1));
    if (prev) { prev.n = Math.min(99, prev.n + n); continue; }
    out.set(id, { id, day, code, cat: category(code), n, premise: String(c[iP] || '').slice(0, 60) || null, lon: Math.round(lon * 1e5) / 1e5, lat: Math.round(lat * 1e5) / 1e5 });
  }
  return [...out.values()];
}
// rows from public.crime_near(...) -> the card summary
export function crimeSummary(rows, miles) {
  const z = () => ({ v: 0, p: 0, o: 0 }), cur = z(), prior = z(); let latest = null;
  for (const r of rows || []) { const t = r.period === 'last12' ? cur : prior; t[r.cat] = (t[r.cat] || 0) + (+r.n || 0); if (r.latest && (!latest || r.latest > latest)) latest = r.latest; }
  const sum = t => t.v + t.p + t.o, pct = (a, b) => b ? Math.round((a / b - 1) * 100) : null;
  return { miles, latest, last12: { ...cur, total: sum(cur) }, prior12: { ...prior, total: sum(prior) }, change: { total: pct(sum(cur), sum(prior)), v: pct(cur.v, prior.v), p: pct(cur.p, prior.p) } };
}
