// Demographics for a place from the census-tract data already in the app (data/market.json, US Census ACS 5-year):
// the tracts inside an outline or within a radius, rolled up. Tract medians can't be combined exactly, so the area
// figures are household-weighted averages of the tract medians (labelled "approx." wherever they are shown).
const R = 3958.8, rad = x => x * Math.PI / 180;
export const miles = (a, b) => { const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const rings = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
function inRing(p, r) { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside; } return inside; }
export const inGeom = (p, g) => rings(g).some(poly => inRing(p, poly[0]) && !poly.slice(1).some(h => inRing(p, h)));
export const centroid = g => { let x = 0, y = 0, n = 0; for (const poly of rings(g)) for (const [a, b] of poly[0]) { x += a; y += b; n++; } return n ? [x / n, y / n] : null; };

// the tracts for a place: inside `geom` (a county or town outline) or within `mi` miles of `c`, always including the tract
// the point falls in
export function tractsFor(tracts, { c, mi, geom }) {
  return tracts.filter(t => { if (!t.geom) return false; const k = t._c ||= centroid(t.geom);
    return geom ? inGeom(k, geom) : (c && (inGeom(c, t.geom) || miles(c, k) <= mi)); });
}
const wavg = (list, v, w) => { let s = 0, ws = 0; for (const t of list) { const x = v(t), y = w(t); if (x != null && y > 0) { s += x * y; ws += y; } } return ws ? s / ws : null; };
export function summarizeTracts(list) {
  if (!list.length) return null;
  const sum = k => list.reduce((s, t) => s + (t[k] || 0), 0), hh = t => Math.max(0, (t.hu || 0) - (t.vac || 0));
  const pop = sum('pop'), hu = sum('hu'), vac = sum('vac');
  const base = list.reduce((s, t) => s + (t.gr != null && t.pop ? t.pop / (1 + t.gr / 100) : t.pop || 0), 0);
  const r0 = v => v == null ? null : Math.round(v);
  return { tracts: list.length, population: pop, households: hu - vac, housing_units: hu,
    median_household_income_approx: r0(wavg(list, t => t.inc, hh)), median_home_value_approx: r0(wavg(list, t => t.val, hh)),
    median_gross_rent_approx: r0(wavg(list, t => t.rent, hh)), median_age_approx: wavg(list, t => t.age, t => t.pop) == null ? null : +wavg(list, t => t.age, t => t.pop).toFixed(1),
    vacancy_rate_pct: hu ? +(vac / hu * 100).toFixed(1) : null, population_growth_pct: base ? +((pop / base - 1) * 100).toFixed(1) : null,
    ...(list.some(t => t.jobs != null) ? { jobs: sum('jobs') } : {}),
    // modeled (ACS income × BLS Consumer Expenditure Survey): an estimate, labelled so
    ...(list.some(t => t.spend != null) ? (() => { const sp = list.filter(t => t.spend != null), cats = {}; sp.forEach(t => Object.entries(t.sp || {}).forEach(([k, v]) => cats[k] = (cats[k] || 0) + (v || 0)));
      const h = sp.reduce((s, t) => s + (t.hh || 0), 0), total = sp.reduce((s, t) => s + t.spend, 0);
      return { consumer_spending_estimate: { per_year: total, per_household: h ? Math.round(total / h) : null, by_category: cats, note: 'Estimate: households by income × BLS Consumer Expenditure Survey spending by income (South region); not measured locally.' } }; })() : {}) };
}
