// The parcel outline export: the full outline exactly as the county (or the appraisal district) draws it, every point,
// as GeoJSON (RFC 7946: longitude, latitude, WGS 84), with what is on record and what the Parcel Map measures from it.
// Opens in QGIS, ArcGIS, Google Earth (via import), CAD tools that read GeoJSON, and geojson.io.
//   parcelGeoJSON(parcels: [{ geometry: GeoJSON Polygon | MultiPolygon, …record }], { regrid?: { fields, more }, label? }) -> FeatureCollection
// Each parcel is one Feature. Its properties: the record (owner, address, values…), every Regrid field when the record came
// from Regrid, and the outline's measures (area, perimeter, points) and its courses as the Parcel Map lists them.
import { frame } from '../siteplan.mjs';
import { ringAreaFt, perimeterFt, openRing } from './plain.mjs';
import { boundaryCourses } from './courses.mjs';

const r2 = v => Math.round(v * 100) / 100;
// the record's own fields, without the outline (it is the geometry) and without empty values
const recordProps = p => Object.fromEntries(Object.entries(p || {}).filter(([k, v]) => !['geometry', 'geom', 'raw'].includes(k) && v != null && v !== '' && typeof v !== 'object'));

export function parcelGeoJSON(parcels, { regrid = null, label = '' } = {}) {
  const features = (parcels || []).filter(p => p?.geometry?.coordinates?.length).map(p => {
    const g = p.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const outer = polys.map(rs => openRing(rs[0] || [])), all = outer.flat(), o = all.length ? [all.reduce((s, q) => s + q[0], 0) / all.length, all.reduce((s, q) => s + q[1], 0) / all.length] : [0, 0], F = frame(o);
    const rings = outer.map(r => r.map(q => F.toFt(q))), holes = polys.flatMap(rs => rs.slice(1).map(h => openRing(h).map(q => F.toFt(q))));
    const area = rings.reduce((s, r) => s + ringAreaFt(r), 0) - holes.reduce((s, r) => s + ringAreaFt(r), 0), per = rings.reduce((s, r) => s + perimeterFt(r), 0);
    // the courses of the largest piece, clockwise, as the Parcel Map lists them (lines and curves between corners)
    const big = rings.reduce((b, r) => ringAreaFt(r) > ringAreaFt(b) ? r : b, rings[0] || []);
    let cw = big; { let a = 0; for (let i = 0; i < cw.length; i++) { const u = cw[i], v = cw[(i + 1) % cw.length]; a += u[0] * v[1] - v[0] * u[1]; } if (a > 0) cw = [cw[0], ...cw.slice(1).reverse()]; }
    const { courses } = boundaryCourses(cw);
    const props = { ...recordProps(p),
      ...(regrid ? { regrid: Object.fromEntries([...(regrid.more || []), ...(regrid.fields || [])].filter(([, v]) => v != null && v !== '')) } : {}),
      outline: { area_sqft: Math.round(area), area_acres: Math.round(area / 43560 * 10000) / 10000, perimeter_ft: r2(per), points: all.length, pieces: rings.length, holes: holes.length, centroid: [Math.round(o[0] * 1e7) / 1e7, Math.round(o[1] * 1e7) / 1e7], units: 'US survey feet, measured on the outline (planning data, not a survey)' },
      courses: courses.map(c => ({ course: c.from + '-' + c.to, type: c.type, bearing: c.brg, distance_ft: r2(c.len), ...(c.type === 'curve' ? { arc_ft: r2(c.arc), radius_ft: Number.isFinite(c.radius) ? r2(c.radius) : null, delta_deg: r2(c.delta), turns: c.turn } : {}),
        from: F.toLL(c.a).map(v => Math.round(v * 1e7) / 1e7), to: F.toLL(c.b).map(v => Math.round(v * 1e7) / 1e7) })) };
    return { type: 'Feature', properties: props, geometry: g };
  });
  return { type: 'FeatureCollection', name: label || 'parcel outline', features };
}
