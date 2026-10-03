// FEMA data helpers shared by api/fema.js, the FEMA report and the assistant. Pure functions, no network.
//   flood zones       FEMA National Flood Hazard Layer (NFHL) zone codes -> risk class
//   zone shares       share of an area in each risk class, by sampling a grid of points against the NFHL polygons
//   NFIP claims       OpenFEMA NFIP Redacted Claims (v3) rows -> totals by year and flood event
//   risk index        FEMA National Risk Index (census tracts) -> composite and per-hazard expected annual loss

export const RISK_LABEL = { high: 'High risk (1% annual chance, "100-year")', moderate: 'Moderate (0.2% annual chance, "500-year")', minimal: 'Minimal flood hazard', undetermined: 'Undetermined (not studied)', water: 'Open water', unmapped: 'Not mapped' };
export function zoneClass(zone, sub, sfha) {
  const z = String(zone || '').trim().toUpperCase(), s = String(sub || '').toUpperCase();
  if (!z) return 'unmapped';
  if (sfha === 'T' || /^(A|V)/.test(z)) return 'high';
  if (z === 'D') return 'undetermined';
  if (/OPEN WATER/.test(z) || z === 'W') return 'water';
  if (/0\.2 PCT|500/.test(s) || z === 'B' || z === 'X500') return 'moderate';
  return 'minimal';
}

// ---------- geometry (planar, fine at site and neighborhood scale) ----------
// even-odd point in polygon over a list of rings (works for GeoJSON polygons and Esri rings alike)
export function inRings(pt, rings) {
  let c = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export const geomRings = g => g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
export function bbox(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of geomRings(g)) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
export function areaSqMi(g) {
  const lat0 = (bbox(g)[1] + bbox(g)[3]) / 2 * Math.PI / 180, kx = 69.17 * Math.cos(lat0), ky = 69.17; let a = 0;
  const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky); return Math.abs(s) / 2; };
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const p of polys) a += ringArea(p[0]) - p.slice(1).reduce((t, r) => t + ringArea(r), 0);
  return a;
}
// a grid of about n points inside the area
export function samplePoints(g, n = 900) {
  const [x0, y0, x1, y1] = bbox(g), k = Math.cos((y0 + y1) / 2 * Math.PI / 180), w = (x1 - x0) * k, h = y1 - y0;
  const step = Math.sqrt(w * h / n) || 1e-4, rings = geomRings(g), pts = [];
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / (2 * k); x < x1; x += step / k) if (inRings([x, y], rings)) pts.push([x, y]);
  if (!pts.length) pts.push([(x0 + x1) / 2, (y0 + y1) / 2]);
  return pts;
}
// NFHL features ({ attributes, geometry: { rings } }) -> share of the area in each risk class, zones present, base flood elevations
export function zoneShares(g, features, n = 900) {
  const pts = samplePoints(g, n), feats = (features || []).filter(f => f.geometry?.rings).map(f => ({ a: f.attributes || {}, rings: f.geometry.rings, b: bbox({ type: 'Polygon', coordinates: f.geometry.rings }) }));
  const count = {}, zones = {}; let floodway = false;
  for (const p of pts) {
    let hit = null;
    for (const f of feats) { if (p[0] < f.b[0] || p[0] > f.b[2] || p[1] < f.b[1] || p[1] > f.b[3]) continue; if (inRings(p, f.rings)) { if (!hit || zoneClass(f.a.FLD_ZONE, f.a.ZONE_SUBTY, f.a.SFHA_TF) === 'high') hit = f; } }
    const cls = hit ? zoneClass(hit.a.FLD_ZONE, hit.a.ZONE_SUBTY, hit.a.SFHA_TF) : 'unmapped'; count[cls] = (count[cls] || 0) + 1;
    if (hit) { const z = String(hit.a.FLD_ZONE || '').trim(); zones[z] = (zones[z] || 0) + 1; if (/FLOODWAY/i.test(hit.a.ZONE_SUBTY || '')) floodway = true; }
  }
  const pct = v => Math.round(v / pts.length * 1000) / 10;
  const bfes = feats.map(f => f.a.STATIC_BFE).filter(v => v > -9000);
  return { samples: pts.length, shares: Object.fromEntries(Object.entries(count).map(([k, v]) => [k, pct(v)])), zones: Object.entries(zones).sort((a, b) => b[1] - a[1]).map(([z, v]) => ({ zone: z, pct: pct(v) })),
    floodway, bfe: bfes.length ? { min: Math.min(...bfes), max: Math.max(...bfes) } : null };
}

// ---------- NFIP claims ----------
const highZone = z => /^(A|V)/.test(String(z || '').toUpperCase());
export function claimsSummary(rows, now = new Date()) {
  const by = new Map(), ev = new Map(); let n = 0, paid = 0, res = 0, inHigh = 0, recent = 0, last = null;
  const since10 = now.getUTCFullYear() - 10;
  for (const r of rows || []) {
    const p = (+r.amountPaidOnBuildingClaim || 0) + (+r.amountPaidOnContentsClaim || 0) + (+r.amountPaidOnIncreasedCostOfComplianceClaim || 0), y = +r.yearOfLoss || +String(r.dateOfLoss || '').slice(0, 4) || null;
    n++; paid += p; if ([1, 11, 12, 13, 14, 15, 16].includes(+r.occupancyType)) res++; if (highZone(r.ratedFloodZone || r.floodZoneCurrent)) inHigh++; if (y >= since10) recent++;
    if (y) { const t = by.get(y) || { year: y, claims: 0, paid: 0 }; t.claims++; t.paid += p; by.set(y, t); }
    const name = r.floodEvent && !/^flooding$/i.test(r.floodEvent) ? r.floodEvent : null;
    if (name) { const e = ev.get(name) || { event: name, claims: 0, paid: 0, year: y }; e.claims++; e.paid += p; ev.set(name, e); }
    const d = String(r.dateOfLoss || '').slice(0, 10); if (d && (!last || d > last)) last = d;
  }
  return { claims: n, paid: Math.round(paid), avg_paid: n ? Math.round(paid / n) : null, residential_pct: n ? Math.round(res / n * 100) : null, in_high_risk_zone_pct: n ? Math.round(inHigh / n * 100) : null,
    last_10_years: recent, latest_loss: last, by_year: [...by.values()].sort((a, b) => a.year - b.year).map(x => ({ ...x, paid: Math.round(x.paid) })),
    top_events: [...ev.values()].sort((a, b) => b.paid - a.paid).slice(0, 8).map(x => ({ ...x, paid: Math.round(x.paid) })) };
}

// ---------- National Risk Index ----------
export const HAZARDS = { HRCN: 'Hurricane', RFLD: 'Riverine flooding', CFLD: 'Coastal flooding', HAIL: 'Hail', TRND: 'Tornado', SWND: 'Strong wind', HWAV: 'Heat wave', CWAV: 'Cold wave',
  WNTW: 'Winter weather', ISTM: 'Ice storm', LTNG: 'Lightning', WFIR: 'Wildfire', DRGT: 'Drought', ERQK: 'Earthquake', LNDS: 'Landslide', TSUN: 'Tsunami', AVLN: 'Avalanche', VLCN: 'Volcanic activity' };
const RATING = ['Very Low', 'Relatively Low', 'Relatively Moderate', 'Relatively High', 'Very High'];
const ratingOf = score => score == null ? null : score < 20 ? RATING[0] : score < 40 ? RATING[1] : score < 60 ? RATING[2] : score < 80 ? RATING[3] : RATING[4];
// tract attribute rows -> area summary (building-value-weighted scores, summed expected annual losses, top hazards)
export function nriSummary(rows) {
  const t = (rows || []).filter(r => r && r.TRACTFIPS); if (!t.length) return null;
  const bv = t.reduce((s, r) => s + (+r.BUILDVALUE || 0), 0) || 1, w = k => t.reduce((s, r) => s + (+r[k] || 0) * (+r.BUILDVALUE || 0), 0) / bv;
  const haz = Object.entries(HAZARDS).map(([k, name]) => ({ hazard: name, key: k, eal: Math.round(t.reduce((s, r) => s + (+r[k + '_EALT'] || 0), 0)), rating: t.map(r => r[k + '_RISKR']).filter(Boolean).sort((a, b) => RATING.indexOf(b) - RATING.indexOf(a))[0] || null }))
    .filter(h => h.eal > 0).sort((a, b) => b.eal - a.eal);
  const score = Math.round(w('RISK_SCORE') * 10) / 10, sovi = Math.round(w('SOVI_SCORE') * 10) / 10, resl = Math.round(w('RESL_SCORE') * 10) / 10;
  return { tracts: t.length, population: t.reduce((s, r) => s + (+r.POPULATION || 0), 0), building_value: Math.round(bv), risk_score: score, risk_rating: ratingOf(score),
    expected_annual_loss: Math.round(t.reduce((s, r) => s + (+r.EAL_VALT || 0), 0)), social_vulnerability: { score: sovi, rating: ratingOf(sovi) }, community_resilience: { score: resl, rating: ratingOf(resl) },
    hazards: haz.slice(0, 8), by_tract: t.map(r => ({ tract: r.TRACTFIPS, county: r.COUNTY, risk_rating: r.RISK_RATNG, risk_score: r.RISK_SCORE == null ? null : Math.round(r.RISK_SCORE * 10) / 10, eal: Math.round(+r.EAL_VALT || 0), population: +r.POPULATION || 0 })) };
}
