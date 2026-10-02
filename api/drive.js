// Driving distance and time between two points.
//   With TOMTOM_API_KEY: TomTom Routing (live traffic: minutes now, minutes without traffic, delay).
//   Without it (or if TomTom fails): OSRM on the FOSSGIS servers (OpenStreetMap roads, no traffic).
// GET ?from=lat,lon&to=lat,lon -> { miles, minutes, typical_minutes, delay_minutes, traffic, source, line: [[lon,lat],...] }
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const UA = 'FinishesSolutions-RealEstateIntel/1.0 (internal map; contact via finishessolutions.com)';
export const MI = 1609.344;

export function parsePt(s) {
  const m = String(s || '').match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/); if (!m) return null;
  const lat = +m[1], lon = +m[2];
  // anywhere on Earth (Open-Meteo, OSRM and TomTom are worldwide); the drive handler refuses trips no car can make
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [lat, lon] : null;
}
// keep the line light: every n-th point, always the last
const thin = (pts, max = 400) => { const n = Math.max(1, Math.ceil(pts.length / max)); return pts.filter((p, i) => i % n === 0 || i === pts.length - 1).map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]); };

export async function tomtom(key, a, b) {
  const u = 'https://api.tomtom.com/routing/1/calculateRoute/' + a.join(',') + ':' + b.join(',') + '/json?' +
    new URLSearchParams({ key, traffic: 'true', travelMode: 'car', routeType: 'fastest', computeTravelTimeFor: 'all', routeRepresentation: 'polyline' });
  const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('TomTom ' + r.status);
  const d = await r.json(), route = d.routes?.[0], s = route?.summary; if (!s) throw new Error('TomTom returned no route');
  const now = s.travelTimeInSeconds, typical = s.noTrafficTravelTimeInSeconds ?? s.historicTrafficTravelTimeInSeconds ?? now;
  return { miles: +(s.lengthInMeters / MI).toFixed(1), minutes: Math.round(now / 60), typical_minutes: Math.round(typical / 60),
    delay_minutes: Math.round((s.trafficDelayInSeconds ?? Math.max(0, now - typical)) / 60), traffic: true, source: 'TomTom (live traffic)',
    line: thin((route.legs || []).flatMap(l => (l.points || []).map(p => [p.longitude, p.latitude]))) };
}
export async function osrm(a, b) {
  const u = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' + a[1] + ',' + a[0] + ';' + b[1] + ',' + b[0] + '?overview=simplified&geometries=geojson';
  const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('OSRM ' + r.status);
  const d = await r.json(), route = d.routes?.[0]; if (d.code !== 'Ok' || !route) throw new Error('No road route found');
  return { miles: +(route.distance / MI).toFixed(1), minutes: Math.round(route.duration / 60), typical_minutes: Math.round(route.duration / 60), delay_minutes: null,
    traffic: false, source: 'OpenStreetMap / OSRM (no live traffic)', line: thin(route.geometry?.coordinates || []) };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 20, perDay: 600 })) return;
  const a = parsePt(req.query?.from), b = parsePt(req.query?.to);
  if (!a || !b) return res.status(400).json({ error: 'from and to must be lat,lon.' });
  // straight-line over ~2,500 miles (Houston to Paris) is not a drive
  const R = Math.PI / 180, mi = 7917.5 * Math.asin(Math.sqrt(Math.sin((b[0] - a[0]) * R / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin((b[1] - a[1]) * R / 2) ** 2));
  if (mi > 2500) return res.status(400).json({ error: 'Those places are about ' + Math.round(mi).toLocaleString('en-US') + ' miles apart in a straight line, too far for a drive time.' });
  const key = process.env.TOMTOM_API_KEY, errors = [];
  if (key) { try { const out = await tomtom(key, a, b); res.setHeader('Cache-Control', 'private, max-age=60'); return res.json(out); } catch (e) { errors.push(e.message); } }
  try { const out = await osrm(a, b); res.setHeader('Cache-Control', 'private, max-age=600'); return res.json({ ...out, note: errors.length ? 'Live traffic unavailable (' + errors[0] + ')' : undefined }); }
  catch (e) { errors.push(e.message); }
  console.error('drive failed', errors.join('; '));
  return res.status(502).json({ error: 'Couldn’t get a driving route right now.' });
}
