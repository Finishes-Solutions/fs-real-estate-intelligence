// The parcels behind what's picked on the map (the card's building / parcel tabs), as one site: each parcel once, their
// outlines together, and the totals. Used to run any report on a selection (src/selreports.js) and to hand a site to the
// CRE report runner (lib/runner.mjs). Tested in test/selection.mjs.
//
// What a picked item carries (src/building.js): { center:[lon,lat], footprint, parcel, d: { parcels? }, regrid? }
//   parcel   the appraisal record under the click (api/building.js normalizeParcel), or null where the free statewide
//            parcel data has no record (Harris and Waller)
//   d.parcels  every parcel a big building sits on (only when there are two or more; from the second lookup)
//   regrid   a Regrid record for the spot ({ fields:[[label,value]], geom, ll_uuid, headline }), used when parcel is null
// A building footprint is never treated as a parcel: the site is the land, and a footprint is only what stands on it.

const R = 6371008.8, SQFT_PER_M2 = 10.7639104, SQFT_PER_ACRE = 43560;

// area of a GeoJSON Polygon / MultiPolygon in square feet (spherical excess formula; exact enough for parcels)
export function areaSqft(g) {
  if (!g) return 0;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const ringArea = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) { const [x1, y1] = r[i], [x2, y2] = r[i + 1]; s += (x2 - x1) * Math.PI / 180 * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180)); } return Math.abs(s * R * R / 2); };
  return Math.round(polys.reduce((t, rings) => t + (rings[0] ? ringArea(rings[0]) : 0) - rings.slice(1).reduce((h, r) => h + ringArea(r), 0), 0) * SQFT_PER_M2);
}

// "1.23 acres" / "53,578 sq ft" (the appraisal record's area) -> acres
export function acresOf(area) {
  const s = String(area ?? '').toLowerCase(), n = parseFloat(s.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/acre|^\s*[\d.,]+\s*(ac)?\s*$/.test(s)) return n;
  if (/sq|square|sf|ft/.test(s)) return n / SQFT_PER_ACRE;
  return null;
}

const num = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const field = (rec, label) => rec?.fields?.find(([k]) => k === label)?.[1] ?? null;
const r2 = n => Math.round(n * 100) / 100;

// a Regrid record (api/regrid.js) as a parcel in the appraisal record's shape
export function parcelFromRegrid(rec) {
  if (!rec || rec.none) return null;
  const more = Object.fromEntries(rec.more || []), acres = num(field(rec, 'Acres'));
  return {
    propId: field(rec, 'Parcel number'), owner: field(rec, 'Owner'), mailing: field(rec, 'Mailing address'),
    situs: rec.headline || null, county: more.county ? String(more.county).replace(/\s+county$/i, '') : null,
    landUse: field(rec, 'Land use (county)'), marketValue: num(field(rec, 'Total value')), landValue: num(field(rec, 'Land value')),
    improvementValue: num(field(rec, 'Improvement value')), yearBuilt: field(rec, 'Year built'), area: acres ? acres + ' acres' : null,
    legal: field(rec, 'Legal description'), zoning: [field(rec, 'Zoning'), field(rec, 'Zoning description')].filter(Boolean).join(' · ') || null,
    geometry: rec.geom && /Polygon$/.test(rec.geom.type) ? rec.geom : null, source: 'Regrid', regridId: rec.ll_uuid || null
  };
}

// The county parcel service answers in ArcGIS form, passed on as { type:'Polygon', coordinates: rings }: a parcel in two
// pieces (split by a road or a creek) is two OUTER rings in one list, and holes are told apart only by winding. Read as
// GeoJSON, the second piece would be a hole. Rings wound like the first are pieces; the others are holes, each in the
// piece that contains it (ArcGIS doesn't promise a hole comes right after its piece).
const signed = r => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s; };
export function esriRings(g) {
  if (!g || g.type !== 'Polygon' || g.coordinates.length < 2) return g;
  const rings = g.coordinates.filter(r => r.length >= 4), way = Math.sign(signed(rings[0]));
  const polys = rings.filter(r => Math.sign(signed(r)) === way).map(r => [r]);
  for (const h of rings.filter(r => Math.sign(signed(r)) !== way)) (polys.find(p => inRing(h[0], p[0])) || polys[0]).push(h);
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

// one parcel in a common shape, whatever it came from
function tidy(p, center, source) {
  const geometry = p.geometry && /Polygon$/.test(p.geometry.type) ? esriRings(p.geometry) : null;
  const gs = areaSqft(geometry), rec = acresOf(p.area);
  // the record's acreage when it has one (that's the legal area); otherwise measured from the outline
  const acres = rec ?? (gs ? gs / SQFT_PER_ACRE : null);
  return {
    propId: p.propId ? String(p.propId) : null, owner: p.owner || null, situs: p.situs || null, county: p.county || null,
    city: p.situsCity || null, zip: p.situsZip || null, landUse: p.landUse || null, yearBuilt: p.yearBuilt || null,
    landValue: p.landValue || null, improvementValue: p.improvementValue || null,
    marketValue: p.marketValue || ((p.landValue || 0) + (p.improvementValue || 0)) || null,
    legal: p.legal || p.raw?.LEGAL_DESC || p.raw?.legal_desc || null, zoning: p.zoning || null,
    acres: acres ? Math.round(acres * 10000) / 10000 : null, sqft: acres ? Math.round(acres * SQFT_PER_ACRE) : null,
    // a building on several parcels was clicked once: each parcel's own middle, not the click, is where it is
    geometry, center: geometry ? middle(geometry) || center : center, source: p.source || source, regridId: p.regridId || null
  };
}
const middle = g => { const r = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0]) || []; const n = r.length > 1 ? r.length - 1 : r.length; if (!n) return null;
  let x = 0, y = 0; for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; };

// the same parcel reached twice (two buildings on one lot, a building's parcel list overlapping another pick)
const keyOf = p => p.propId ? 'p:' + String(p.county || '').toLowerCase() + '|' + p.propId : p.regridId ? 'r:' + p.regridId : null;
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const inside = (pt, g) => !!g && (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some(rings => inRing(pt, rings[0]) && !rings.slice(1).some(h => inRing(pt, h)));

// items: the picked things (see top). Returns { parcels, missing } where missing lists the picks with no parcel record
// at all (no appraisal record, no Regrid record): they still have a center, but no owner, acreage or outline.
export function selectedParcels(items) {
  const out = [], seen = new Set(), missing = [];
  for (const it of items || []) {
    if (!it?.center) continue;
    const all = it.d?.parcels || it.parcels, list = all?.length ? all : it.parcel ? [it.parcel] : [];
    const recs = list.length ? list.map(p => tidy(p, it.center, 'County appraisal district')) : it.regrid ? [parcelFromRegrid(it.regrid)].filter(Boolean).map(p => tidy(p, it.center, 'Regrid')) : [];
    if (!recs.length) { if (!out.some(p => inside(it.center, p.geometry))) missing.push({ center: it.center }); continue; }
    for (const p of recs) {
      // a parcel without an id whose spot is inside one already listed is that parcel
      const k = keyOf(p);
      if (k ? seen.has(k) : out.some(q => inside(p.center, q.geometry))) continue;
      if (k) seen.add(k); out.push(p);
    }
  }
  return { parcels: out, missing };
}

// all the parcels as one site: outline (a MultiPolygon of every parcel's polygons), center, totals and a label
export function combineParcels(parcels) {
  const polys = [];
  for (const p of parcels) if (p.geometry) (p.geometry.type === 'Polygon' ? [p.geometry.coordinates] : p.geometry.coordinates).forEach(c => polys.push(c));
  const geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  const sum = k => { const v = parcels.map(p => p[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const acres = sum('acres'), pts = parcels.map(p => p.center).filter(Boolean);
  const center = pts.length ? [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length] : null;
  const counties = [...new Set(parcels.map(p => p.county).filter(Boolean).map(c => c.replace(/\s+county$/i, '')))];
  const first = parcels.find(p => p.situs)?.situs;
  const label = parcels.length === 1 ? (first || 'Selected parcel') : (first ? first + ' + ' + (parcels.length - 1) + ' more parcel' + (parcels.length > 2 ? 's' : '') : parcels.length + ' selected parcels');
  return {
    geometry, center, label, counties, count: parcels.length, withOutline: parcels.filter(p => p.geometry).length,
    totals: { acres: acres != null ? Math.round(acres * 10000) / 10000 : null, sqft: acres != null ? Math.round(acres * SQFT_PER_ACRE) : null,
      landValue: sum('landValue'), improvementValue: sum('improvementValue'), marketValue: sum('marketValue') },
    owners: [...new Set(parcels.map(p => (p.owner || '').trim()).filter(Boolean))]
  };
}

// the parcels as the report runner's FeatureCollection (the shape its enrich-parcel stage builds: run-sitemap,
// run-site-plan and the screening packet read these property names)
export function runnerFeatures(parcels) {
  return { type: 'FeatureCollection', features: parcels.map((p, i) => ({ type: 'Feature', geometry: p.geometry || null, properties: {
    index: i + 1, parcelId: p.propId || '', owner: p.owner || '', acres: p.acres != null ? r2(p.acres) : '', sqft: p.sqft || '', situs: p.situs || '', city: p.city || '',
    subdivision: '', zoning: p.zoning || '', landUse: p.landUse || '', landValue: p.landValue || '', improvementValue: p.improvementValue || '', totalValue: p.marketValue || '',
    yearBuilt: p.yearBuilt || '', legal: p.legal || '', source: p.source || '', raw: {}, hasGeometry: !!p.geometry } })) };
}

// the parcel facts as the runner's "Confirmed Parcel Record" block, so its research stage starts from the county record
// (the same wording enrich-parcel uses; the runner treats these rows as Verified Facts)
export function enrichmentBlock(parcels, site, state = 'TX') {
  const money = v => v != null ? '$' + Math.round(v).toLocaleString('en-US') : '';
  const rows = p => [['Parcel / Account ID', p.propId], ['Owner of Record', p.owner], ['Acreage', p.acres != null ? r2(p.acres) + ' ac' : ''], ['Lot Size (SF)', p.sqft ? p.sqft.toLocaleString('en-US') : ''],
    ['Legal Description', p.legal], ['Situs Address', p.situs], ['City', p.city], ['Zoning', p.zoning], ['Land Use', p.landUse], ['Land Value', money(p.landValue)],
    ['Improvement Value', money(p.improvementValue)], ['Total / Assessed Value', money(p.marketValue)], ['Year Built', p.yearBuilt], ['Source', p.source]]
    .filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => '| ' + k + ' | ' + String(v).replace(/\|/g, '/').trim() + ' |').join('\n');
  const county = site.counties.join(' / ') || 'the';
  if (parcels.length === 1) {
    return '## Confirmed Parcel Record (Authoritative Source)\nThe following parcel facts were retrieved DIRECTLY from ' + parcels[0].source + ' for Parcel ' + (parcels[0].propId || parcels[0].situs || '') + ' in ' + county + ' County, ' + state + '. ' +
      'Treat every value below as a Verified Fact with source "' + parcels[0].source + '". Do not contradict, re-estimate, or downgrade these to assumptions; carry them forward exactly into the report and use them to anchor the comp set, site analysis, and gap list. ' +
      'Continue using web search for everything NOT listed here (market, demographics, comps, FEMA, utilities, zoning detail, future development).\n\n| Field | Value (Verified Fact) |\n|---|---|\n' + rows(parcels[0]) + '\n\n';
  }
  const t = site.totals;
  return '## Confirmed Parcel Records — ' + parcels.length + '-Parcel Assemblage (Authoritative Source)\nThis development assembles ' + parcels.length + ' parcels in ' + county + ' County, ' + state + '. ' +
    'Each parcel\'s facts below were retrieved DIRECTLY from the county source and are Verified Facts — carry them forward exactly and present each parcel separately in the report. ' +
    'For ALL development sizing, density, yield, budget, and proforma math, use the COMBINED SITE TOTALS at the bottom (the sum across every parcel), never a single parcel.\n\n' +
    parcels.map((p, i) => '### Parcel ' + (i + 1) + ' of ' + parcels.length + ' — ' + (p.propId || p.situs || 'unnumbered') + '\n| Field | Value (Verified Fact) |\n|---|---|\n' + rows(p) + '\n\n').join('') +
    '### COMBINED SITE TOTALS (use these for all development math)\n| Field | Combined Value |\n|---|---|\n| Parcels Assembled | ' + parcels.length + ' |\n' +
    (t.acres != null ? '| Total Acreage | ' + r2(t.acres) + ' ac |\n' : '') + (t.sqft != null ? '| Total Lot Size (SF) | ' + t.sqft.toLocaleString('en-US') + ' |\n' : '') +
    (t.landValue != null ? '| Total Land Value | ' + money(t.landValue) + ' |\n' : '') + (t.improvementValue != null ? '| Total Improvement Value | ' + money(t.improvementValue) + ' |\n' : '') +
    (t.marketValue != null ? '| Total Assessed Value | ' + money(t.marketValue) + ' |\n' : '') + '\n';
}
