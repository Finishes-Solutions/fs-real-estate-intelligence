// Nearest places of a kind around a point, from OpenStreetMap (Overpass API, free).
// GET ?lat=..&lon=..&what=airport|restaurant|gas|…|<brand or name>&limit=5 -> { category, label, places: [{ name, kind, miles, lat, lon, … }] }
// Widens the search radius until it finds enough.
// GET ?lat&lon&name=Starbucks&mode=business -> businesses with that name or brand (map search), nearest first.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { categoryOf, CATEGORIES, overpassQuery, parsePlaces, businessQuery } from '../lib/nearby.mjs';

const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const UA = { 'User-Agent': 'FinishesSolutions-RE-Intelligence/1.0 (nearby places)', 'Content-Type': 'application/x-www-form-urlencoded' };

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 20, perDay: 400 })) return;
  const lat = +req.query.lat, lon = +req.query.lon, what = String(req.query.what || '').slice(0, 60), limit = Math.max(1, Math.min(10, +req.query.limit || 5));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 24 || lat > 38 || lon < -108 || lon > -92) return res.status(400).json({ error: 'lat/lon must be in or near Texas' });
  const business = req.query.mode === 'business', name = String(req.query.name || '').slice(0, 60);
  if (business ? name.trim().length < 2 : !what.trim()) return res.status(400).json({ error: business ? 'Type at least 2 letters of the business name.' : 'Say what to look for.' });
  const cat = business ? null : categoryOf(what), radii = business ? [8000, 30000, 80000] : (cat && CATEGORIES[cat].radius) || [3000, 12000, 40000];
  let places = [], used = 0;
  try {
    for (const r of radii) {
      used = r;
      const ctl = AbortSignal.timeout(14000);
      const resp = await fetch(OVERPASS, { method: 'POST', headers: UA, body: new URLSearchParams({ data: business ? businessQuery(name, lat, lon, r, limit) : overpassQuery(cat, what, lat, lon, r, limit) }), signal: ctl });
      if (!resp.ok) throw new Error('OpenStreetMap search failed (HTTP ' + resp.status + ')');
      places = parsePlaces((await resp.json()).elements, [lat, lon], cat, limit);
      if (places.length >= Math.min(limit, 3)) break;
    }
  } catch (e) { return res.status(502).json({ error: e.name === 'TimeoutError' ? 'OpenStreetMap search timed out. Try again.' : e.message }); }
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.json({ category: cat || 'name', label: cat ? CATEGORIES[cat].label : business ? name : what, searched_miles: +(used / 1609.344).toFixed(1), places, source: 'OpenStreetMap' });
}
