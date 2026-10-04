// Exact county lines for the zoomed-in map, anywhere in the US: GET /api/counties?x=-95.5&y=29.5
//   x, y = south-west corner of a 0.5° cell (multiples of 0.5). Returns every county that touches the cell, as its
//   boundary lines from the Census TIGER/Line files (TIGERweb, ~5 m generalisation):
//   { cell: [x, y], counties: [{ id: '48201', name: 'Harris County', lines: [[[lon, lat], …], …] }] }
// The national map uses the lighter 1:10m lines in data/uscounties.json; the browser asks for these cells only from
// zoom 10. Cells are fixed, so the CDN serves each one to everybody for a month.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (county lines)' };
export const CELL = 0.5;
// US and territories, generously: [-180, 17] … [-64, 72], plus the far side of the date line for the Aleutians and Guam
const okCell = (x, y) => y >= -15 && y < 72 && ((x >= -180 && x < -64) || (x >= 144 && x < 180));
const r5 = v => Math.round(v * 1e5) / 1e5;

// polygon rings → lines (a closed ring is a line that ends where it starts)
export function ringsToLines(g) {
  const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.flat().filter(r => r.length > 1).map(r => r.map(([lon, lat]) => [r5(lon), r5(lat)]));
}

export async function countyCell(x, y) {
  const q = new URLSearchParams({ geometry: [x, y, x + CELL, y + CELL].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'GEOID,NAME', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.00005', geometryPrecision: '5', f: 'geojson' });
  const r = await fetch(TIGER + '?' + q, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('TIGERweb ' + r.status);
  const d = await r.json(); if (d.error) throw new Error('TIGERweb: ' + (d.error.message || 'error'));
  return { cell: [x, y], counties: (d.features || []).map(f => ({ id: String(f.properties?.GEOID || ''), name: f.properties?.NAME || '', lines: ringsToLines(f.geometry) })).filter(c => c.id && c.lines.length) };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 120, perDay: 5000 })) return;
  const q = req.query || {}, x = Number(q.x), y = Number(q.y);
  if (!isFinite(x) || !isFinite(y) || x / CELL !== Math.round(x / CELL) || y / CELL !== Math.round(y / CELL) || !okCell(x, y)) return res.status(400).json({ error: 'x and y: the south-west corner of a 0.5° cell in the US' });
  try {
    const out = await countyCell(x, y);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
    return res.json(out);
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: e.message }); }
}
