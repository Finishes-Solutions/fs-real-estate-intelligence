// Market tab numbers that aren't charts: the construction pipeline from the TDLR filings, housing from the census tracts,
// Zillow rents by ZIP matched to counties, monthly series from data/markets.json, and the "What's moving" lines.
// Pure functions (browser and node), tested in test/marketcalc.mjs; src/area.js draws them.
import { summarizeTracts, inGeom } from './demographics.mjs';

// one filing over this is a data-entry slip (a $6.5B road job in Baytown, 2026-10): kept out of the totals and named
export const OUTLIER = 2e9;
export const ym = d => String(d || '').slice(0, 7);
export function addMonths(m, n) { const [y, mm] = m.split('-').map(Number), t = y * 12 + mm - 1 + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); }
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const TYPES = ['New', 'Reno', 'Addition'];

// filings: [{ id, name, county, city, cost, type, use, ts, te }] (ts/te = start and end dates, YYYY-MM-DD)
// under construction = started and not finished today (the rule metrics.js uses for "active")
// since: when the filing list starts. Projects filed before then are missing, so earlier months undercount; the change on a
// year ago is only given once the year-ago month is two years past that start (most jobs run under two years).
export function pipeline(filings, { counties = null, today = new Date().toISOString().slice(0, 10), back = 24, ahead = 12, outlier = OUTLIER, since = null } = {}) {
  const inArea = (filings || []).filter(f => !counties || counties.has(f.county));
  const outliers = inArea.filter(f => f.cost > outlier), list = inArea.filter(f => !(f.cost > outlier) && f.ts && f.te);
  const v = arr => arr.reduce((s, f) => s + (f.cost || 0), 0), byCost = (a, b) => (b.cost || 0) - (a.cost || 0);
  const active = list.filter(f => f.ts <= today && today <= f.te), soon = addDays(today, 90);
  const starting = list.filter(f => f.ts > today && f.ts <= soon), upcoming = list.filter(f => f.ts > today);
  const now = ym(today), first = addMonths(now, -back), months = [];
  for (let m = first; m <= addMonths(now, ahead); m = addMonths(m, 1)) months.push({ m, New: 0, Reno: 0, Addition: 0, n: 0, future: m > now });
  const at = new Map(months.map((r, i) => [r.m, i]));
  for (const f of list) {
    const a = ym(f.ts) < first ? first : ym(f.ts), b = ym(f.te); if (b < first || a > months[months.length - 1].m) continue;
    const t = TYPES.includes(f.type) ? f.type : 'New';
    for (let i = at.get(a) ?? 0; i < months.length && months[i].m <= b; i++) { months[i][t] += f.cost || 0; months[i].n++; }
  }
  const group = (arr, key) => { const g = new Map(); for (const f of arr) { const k = key(f) || 'Other', x = g.get(k) || { name: k, n: 0, v: 0, list: [] }; x.n++; x.v += f.cost || 0; x.list.push(f); g.set(k, x); }
    return [...g.values()].map(x => ({ ...x, list: x.list.sort(byCost).slice(0, 6) })).sort((a, b) => b.v - a.v); };
  const yearAgo = months.find(r => r.m === addMonths(now, -12)), cur = months.find(r => r.m === now), tot = r => r ? r.New + r.Reno + r.Addition : 0;
  return { today, active: { n: active.length, v: v(active) }, starting: { n: starting.length, v: v(starting), list: starting.sort(byCost).slice(0, 10) },
    upcoming: { n: upcoming.length, v: v(upcoming) }, months, byUse: group(active, f => f.use), byCounty: group(active, f => f.county), byType: group(active, f => f.type),
    largest: active.slice().sort(byCost).slice(0, 10), since: since ? ym(since) : null,
    change: since && addMonths(now, -12) >= addMonths(ym(since), 24) && tot(yearAgo) ? (tot(cur) / tot(yearAgo) - 1) * 100 : null,
    outliers: outliers.map(f => ({ id: f.id, name: f.name, county: f.county, cost: f.cost })) };
}

// ACS household income brackets (B19001, 16 of them) folded into 7 readable bands
export const INCOME_BANDS = [['Under $25K', [0, 1, 2, 3]], ['$25–50K', [4, 5, 6, 7, 8]], ['$50–75K', [9, 10]], ['$75–100K', [11]], ['$100–150K', [12, 13]], ['$150–200K', [14]], ['$200K+', [15]]];
export function housing(tracts) {
  const s = summarizeTracts(tracts || []); if (!s) return null;
  const ib = new Array(16).fill(0); for (const t of tracts) (t.ib || []).forEach((n, i) => ib[i] += n || 0);
  const all = ib.reduce((a, b) => a + b, 0);
  return { ...s, income: all ? INCOME_BANDS.map(([label, idx]) => ({ label, n: idx.reduce((a, i) => a + ib[i], 0), pct: idx.reduce((a, i) => a + ib[i], 0) / all * 100 })) : null };
}

// town name -> county, from the town points and the county outlines ([{ name, geom }])
export function cityCounties(places, counties) {
  const out = {}; for (const [name, lon, lat] of places || []) { const c = (counties || []).find(x => inGeom([lon, lat], x.geom)); if (c) out[name] = c.name; }
  return out;
}
// Zillow rents for the Houston-area ZIPs, those whose town falls in the counties shown (all metro ZIPs for the region)
export function rents(zips, { counties = null, cityCounty = {}, metro = /Houston/ } = {}) {
  const rows = Object.entries(zips || {}).filter(([, z]) => metro.test(z.metro || '') && z.rent > 0 && (!counties || counties.has(cityCounty[z.city] || (z.city === 'Houston' ? 'Harris' : ''))))
    .map(([zip, z]) => ({ zip, city: z.city, rent: z.rent, yoy: z.yoy, month: z.month, county: cityCounty[z.city] || (z.city === 'Houston' ? 'Harris' : null) })).sort((a, b) => b.rent - a.rent);
  if (!rows.length) return null;
  const med = arr => { const s = arr.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
  return { rows, typical: med(rows.map(r => r.rent)), yoy: med(rows.map(r => r.yoy)), month: rows[0].month, low: rows[rows.length - 1], high: rows[0] };
}

// a markets.json series ({ months: { start, v[] } }) as the last n monthly points, and its change over 12 months
export function monthly(s, n = 60) {
  const M = s?.months; if (!M?.v?.length) return null;
  const pts = M.v.map((v, i) => ({ m: addMonths(M.start, i), v })).filter(p => p.v != null).slice(-n);
  const last = pts[pts.length - 1], prev = pts.find(p => p.m === addMonths(last.m, -12));
  return { pts, last, yoy: prev && prev.v ? (last.v / prev.v - 1) * 100 : null, chg: prev ? last.v - prev.v : null };
}

// "What's moving": the biggest changes, in plain words. cands: [{ text, score }] where score is the size of the change
export const movers = (cands, n = 5) => cands.filter(c => c && c.text && Number.isFinite(c.score)).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, n);
