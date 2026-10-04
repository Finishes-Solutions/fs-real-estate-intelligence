// Drive-time areas (isochrones): everywhere reachable by car within N minutes of a point.
//   GET ?lat=..&lon=..&minutes=10,20,30&depart=now|weekday-am|weekday-pm|weekend
//   -> { type: 'FeatureCollection', features: [{ properties: { minutes, sqmi }, geometry: Polygon }], source, traffic, depart }
// TomTom Calculate Reachable Range (TOMTOM_API_KEY; live or typical traffic for the departure time, one call per band).
// Without the key, or if TomTom fails: Valhalla on the FOSSGIS servers (OpenStreetMap roads, no traffic, all bands at once).
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { areaSqMi } from '../lib/fema.mjs';

const UA = 'FinishesSolutions-RealEstateIntel/1.0 (internal map; contact via finishessolutions.com)';
export const DEPARTS = { now: 'Leaving now', 'weekday-am': 'Weekday 8 AM', 'weekday-pm': 'Weekday 5 PM', weekend: 'Sunday 11 AM' };

export function parseMinutes(s) {
  const m = [...new Set(String(s || '10,20,30').split(',').map(x => Math.round(+x)).filter(x => x >= 1 && x <= 60))].sort((a, b) => a - b).slice(0, 4);
  return m.length ? m : null;
}
// the next such time in Houston, as a local time with its UTC offset (TomTom's departAt)
export function departAt(kind, now = new Date(), tz = 'America/Chicago') {
  if (!kind || kind === 'now') return 'now';
  const want = kind === 'weekend' ? { days: [0], h: 11 } : { days: [2, 3], h: kind === 'weekday-pm' ? 17 : 8 }; // Tue/Wed: a typical weekday
  const part = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map(p => [p.type, p.value]));
  for (let i = 1; i <= 8; i++) {
    const d = new Date(now.getTime() + i * 864e5), p = part(d), wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    if (!want.days.includes(wd)) continue;
    // offset of that day in Houston (CDT -05:00 or CST -06:00)
    const noonUtc = Date.UTC(+p.year, +p.month - 1, +p.day, 12), q = part(new Date(noonUtc)), off = +q.hour - 12;
    const sign = off < 0 ? '-' : '+', hh = String(Math.abs(off)).padStart(2, '0');
    return p.year + '-' + p.month + '-' + p.day + 'T' + String(want.h).padStart(2, '0') + ':00:00' + sign + hh + ':00';
  }
  return 'now';
}
const ringOf = pts => { const r = pts.map(p => [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]); if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]); return r; };
const feature = (minutes, ring) => { const geometry = { type: 'Polygon', coordinates: [ring] }; return { type: 'Feature', properties: { minutes, sqmi: Math.round(areaSqMi(geometry) * 10) / 10 }, geometry }; };

export async function tomtomRange(key, lat, lon, minutes, depart, fetchImpl = fetch) {
  const one = async m => {
    const q = new URLSearchParams({ key, timeBudgetInSec: String(m * 60), travelMode: 'car', routeType: 'fastest', traffic: 'true', ...(depart !== 'now' ? { departAt: depart } : {}) });
    const r = await fetchImpl('https://api.tomtom.com/routing/1/calculateReachableRange/' + lat + ',' + lon + '/json?' + q, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('TomTom ' + r.status);
    const b = (await r.json()).reachableRange?.boundary; if (!b?.length) throw new Error('TomTom returned no area');
    return feature(m, ringOf(b.map(p => [p.longitude, p.latitude])));
  };
  return { features: await Promise.all(minutes.map(one)), source: 'TomTom (' + (depart === 'now' ? 'live traffic' : 'typical traffic') + ')', traffic: true };
}
export async function valhalla(lat, lon, minutes, fetchImpl = fetch) {
  const json = JSON.stringify({ locations: [{ lat, lon }], costing: 'auto', contours: minutes.map(time => ({ time })), polygons: true, denoise: 0.6, generalize: 80 });
  const r = await fetchImpl('https://valhalla1.openstreetmap.de/isochrone?json=' + encodeURIComponent(json), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Valhalla ' + r.status);
  const d = await r.json(); if (d.error) throw new Error('Valhalla: ' + d.error);
  const features = (d.features || []).filter(f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon').map(f => {
    const m = Math.round(f.properties?.contour), poly = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.sort((a, b) => b[0].length - a[0].length)[0];
    return feature(m, ringOf(poly[0]));
  }).sort((a, b) => a.properties.minutes - b.properties.minutes);
  if (!features.length) throw new Error('Valhalla returned no area');
  return { features, source: 'OpenStreetMap / Valhalla (no traffic)', traffic: false };
}

export async function isochrones({ lat, lon, minutes, depart = 'now', key = process.env.TOMTOM_API_KEY, fetchImpl = fetch }) {
  const errors = [], when = departAt(depart);
  if (key) { try { return { ...(await tomtomRange(key, lat, lon, minutes, when, fetchImpl)), depart, depart_at: when }; } catch (e) { errors.push(e.message); } }
  try { return { ...(await valhalla(lat, lon, minutes, fetchImpl)), depart: 'typical', note: (key ? 'Traffic unavailable (' + errors[0] + '). ' : '') + 'Drive times without traffic.' }; }
  catch (e) { errors.push(e.message); }
  const err = new Error('Couldn’t work out drive-time areas right now (' + errors.join('; ') + ').'); err.status = 502; throw err;
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 10, perDay: 200 })) return;
  const q = req.query || {}, lat = +q.lat, lon = +q.lon, minutes = parseMinutes(q.minutes), depart = DEPARTS[q.depart] ? q.depart : 'now';
  if (!(lat >= -60 && lat <= 75 && lon >= -180 && lon <= 180) || !minutes) return res.status(400).json({ error: 'Send lat, lon and minutes (1 to 60, up to 4 values).' });
  try {
    const out = await isochrones({ lat: +lat.toFixed(4), lon: +lon.toFixed(4), minutes, depart });
    // "now" changes minute to minute; a typical weekday or weekend barely changes in a week
    res.setHeader('Cache-Control', depart === 'now' ? 'private, max-age=120' : 'public, max-age=3600, s-maxage=604800');
    return res.json({ type: 'FeatureCollection', ...out, center: [lon, lat] });
  } catch (e) { res.setHeader('Cache-Control', 'no-store'); console.error('isochrone failed', e.message); return res.status(e.status || 502).json({ error: e.message }); }
}
