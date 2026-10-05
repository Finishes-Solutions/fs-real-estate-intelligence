// Google Maps Platform, server side (the key stays here): place search for the map search box and Google place cards.
//   GET ?status=1                                  { places, tiles_key, caps, used }: is a server key set, the browser key for
//                                                    Google tiles (GOOGLE_MAPS_BROWSER_KEY), this month's use
//   GET ?ac=text&near=lat,lon&session=uuid          Places API (New) Autocomplete: [{ id, main, secondary, types }]
//   GET ?place=ChIJ…&session=uuid                   Place Details: name, address, location, category, rating, hours,
//                                                    phone, website, Google Maps link, attributions
// Google's terms: results are shown with Google attribution and on a Google map (the browser switches the base map to
// Google's tiles when it shows a Google place), and nothing but the place ID may be stored, so responses are not cached.
// Monthly caps (GOOGLE_AUTOCOMPLETE_CAP, GOOGLE_DETAILS_CAP; default 9,000 and 900, inside Google's free monthly use)
// are counted in Supabase (google_take); past a cap the search falls back to the free sources until next month.
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';

const E = process.env, KEY = () => E.GOOGLE_MAPS_KEY || E.GOOGLE_MAPS_API_KEY || '';
const db = () => supa({ ...E, SUPABASE_URL: E.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co' });
export const CAPS = () => ({ autocomplete: +E.GOOGLE_AUTOCOMPLETE_CAP || 9000, details: +E.GOOGLE_DETAILS_CAP || 900 });
const month = () => new Date().toISOString().slice(0, 7);
export const DETAIL_FIELDS = ['id', 'displayName', 'formattedAddress', 'shortFormattedAddress', 'location', 'types', 'primaryTypeDisplayName', 'businessStatus', 'googleMapsUri', 'websiteUri',
  'nationalPhoneNumber', 'rating', 'userRatingCount', 'regularOpeningHours.weekdayDescriptions', 'regularOpeningHours.openNow', 'priceLevel', 'viewport', 'addressComponents'].join(',');

// counts one call against the month's cap; true when allowed. Without a database the call is allowed (and uncounted).
async function take(kind, d = db()) {
  if (!d || d.via !== 'key') return true;
  try { const n = await d.rpc('google_take', { p_month: month(), p_kind: kind, p_cap: CAPS()[kind] }); return n !== -1; } catch (e) { console.error('google_take', e.message); return true; }
}
async function google(url, { method = 'GET', body, fields, fetchImpl = fetch } = {}) {
  const r = await fetchImpl(url, { method, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY(), ...(fields ? { 'X-Goog-FieldMask': fields } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('Google ' + r.status + ': ' + (d.error?.message || 'request failed').slice(0, 160)), { status: r.status });
  return d;
}
export function shapeSuggestions(d) {
  return (d.suggestions || []).map(s => s.placePrediction).filter(Boolean).map(p => ({ id: p.placeId, main: p.structuredFormat?.mainText?.text || p.text?.text || '', secondary: p.structuredFormat?.secondaryText?.text || '', types: (p.types || []).slice(0, 3) }));
}
export function shapePlace(p) {
  if (!p) return null;
  const comp = t => (p.addressComponents || []).find(c => (c.types || []).includes(t))?.shortText;
  return { id: p.id, name: p.displayName?.text || '', address: p.formattedAddress || '', short_address: p.shortFormattedAddress, lat: p.location?.latitude, lon: p.location?.longitude,
    category: p.primaryTypeDisplayName?.text || (p.types || [])[0]?.replace(/_/g, ' ') || '', types: p.types || [], status: p.businessStatus, maps_url: p.googleMapsUri, website: p.websiteUri, phone: p.nationalPhoneNumber,
    rating: p.rating, ratings: p.userRatingCount, price: p.priceLevel, open_now: p.regularOpeningHours?.openNow, hours: p.regularOpeningHours?.weekdayDescriptions, zip: comp('postal_code'), city: comp('locality'),
    viewport: p.viewport ? [p.viewport.low?.longitude, p.viewport.low?.latitude, p.viewport.high?.longitude, p.viewport.high?.latitude] : undefined };
}
const sessionOk = s => /^[A-Za-z0-9_-]{8,64}$/.test(String(s || ''));

export default async function handler(req, res) {
  if (!sameOrigin(req, res)) return;
  const q = req.query || {};
  res.setHeader('Cache-Control', 'private, no-store'); // Google content may not be cached
  if (q.status) {
    let used = null; const d = db();
    if (KEY() && d?.via === 'key') { try { used = Object.fromEntries((await d.select('google_usage', 'select=kind,n&month=eq.' + month())).map(r => [r.kind, r.n])); } catch (e) {} }
    // the browser key (Map Tiles API: Google base maps and 3D) is public by design: restrict it to this site's address in Google Cloud
    return res.json({ places: !!KEY(), tiles_key: E.GOOGLE_MAPS_BROWSER_KEY || null, caps: CAPS(), used });
  }
  if (!KEY()) return res.status(503).json({ error: 'Google isn’t set up on this deployment (GOOGLE_MAPS_KEY is missing).' });
  if (!rateLimit(req, res, { perMinute: 60, perDay: 1500 })) return;
  try {
    if (q.ac) {
      const text = String(q.ac).trim().slice(0, 120); if (text.length < 2) return res.json({ suggestions: [] });
      if (!(await take('autocomplete'))) return res.status(429).json({ error: 'This month’s Google search allowance is used up.', capped: true });
      const [lat, lon] = String(q.near || '').split(',').map(Number);
      const body = { input: text, includedRegionCodes: ['us'], ...(sessionOk(q.session) ? { sessionToken: q.session } : {}),
        ...(Number.isFinite(lat) && Number.isFinite(lon) ? { locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: 50000 } }, origin: { latitude: lat, longitude: lon } } : {}) };
      const d = await google('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', body });
      return res.json({ suggestions: shapeSuggestions(d) });
    }
    if (q.place) {
      const id = String(q.place); if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return res.status(400).json({ error: 'place= a Google place ID' });
      if (!(await take('details'))) return res.status(429).json({ error: 'This month’s Google place details allowance is used up.', capped: true });
      const d = await google('https://places.googleapis.com/v1/places/' + encodeURIComponent(id) + (sessionOk(q.session) ? '?sessionToken=' + encodeURIComponent(q.session) : ''), { fields: DETAIL_FIELDS });
      return res.json({ place: shapePlace(d) });
    }
    return res.status(400).json({ error: 'Use status, ac or place.' });
  } catch (e) { console.error('google', e.message); return res.status(502).json({ error: e.message }); }
}
