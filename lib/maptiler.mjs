// MapTiler (basemaps and geocoding) runs on a key with a monthly quota. When MapTiler refuses the key (quota used up,
// account suspended, key not allowed on this site) the map must not go blank and search must not go dead: the
// MapTiler basemaps are drawn from OpenFreeMap instead (same OpenMapTiles data, keyless) and searches go to Photon
// (OpenStreetMap, keyless, made for search-as-you-type). The outage is remembered for a few hours so every page load
// doesn't spend a failed request (and a blank moment) finding out again.

export const OFM = 'https://tiles.openfreemap.org';
export const PHOTON = 'https://photon.komoot.io';
export const DOWN_KEY = 'fs-maptiler-down', DOWN_HOURS = 6;

// a failed request that means "MapTiler won't serve this key", not a network blip: 401/403/429, or MapTiler's own wording
export function refused(status, text = '') {
  if (status === 401 || status === 403 || status === 429 || /quota|suspended|invalid key/i.test(String(text))) return true;
  return !status && /unauthori[sz]ed|forbidden/i.test(String(text)); // no status to go by: the error's wording
}
// a MapLibre 'error' event that is MapTiler refusing the key (the style or a tile), as opposed to any other source failing
export function mapErrorRefused(e) {
  const er = e && e.error, url = String((er && er.url) || ''), msg = String((er && er.message) || '');
  if (!/api\.maptiler\.com/.test(url + ' ' + msg)) return false;
  return refused(er && er.status, msg);
}

// the keyless style that stands in for a MapTiler basemap: Positron/Dark for the plain Dataviz look, Liberty for streets
// and topo; satellite goes to the app's own Esri imagery style (null here: the caller has it)
export function standIn(style, dark) {
  if (style === 'sat') return null;
  if (style === 'dots') return OFM + '/styles/' + (dark ? 'dark' : 'positron');
  return OFM + '/styles/' + (dark ? 'dark' : 'liberty');
}

// remembered outage: { at: ms } in localStorage, good for DOWN_HOURS
export function downSince(store, now = Date.now()) {
  try { const v = JSON.parse(store.getItem(DOWN_KEY) || 'null'); return v && now - v.at < DOWN_HOURS * 36e5 ? v.at : 0; } catch (e) { return 0; }
}
export function markDown(store, now = Date.now()) { try { store.setItem(DOWN_KEY, JSON.stringify({ at: now })); } catch (e) {} }

// Photon search URL. bbox is "west,south,east,north" (as the MapTiler call takes it); prox is "lon,lat"
export function photonSearchUrl(q, { limit = 6, prox, bbox } = {}) {
  const p = new URLSearchParams({ q, limit: String(limit), lang: 'en' });
  if (prox) { const [lon, lat] = String(prox).split(','); p.set('lon', lon); p.set('lat', lat); }
  if (bbox) p.set('bbox', bbox);
  return PHOTON + '/api/?' + p;
}
export const photonReverseUrl = (c, limit = 1) => PHOTON + '/reverse?lon=' + c[0] + '&lat=' + c[1] + '&limit=' + limit + '&lang=en';

// Photon's GeoJSON in the shape the app's geocoder returns ({t, name, type, k, c, bbox}), with MapTiler's place types so
// the search box, the assistant and kindOf() treat both the same
const TYPE = { city: 'place', town: 'place', village: 'place', hamlet: 'place', district: 'neighbourhood', locality: 'locality', suburb: 'neighbourhood',
  neighbourhood: 'neighbourhood', county: 'county', state: 'region', country: 'country', street: 'street', postcode: 'postal_code' };
function photonType(p) {
  if (p.osm_key === 'highway') return 'street';
  if (p.osm_key === 'place' || p.osm_key === 'boundary') return TYPE[p.osm_value] || TYPE[p.type] || 'place';
  if (!p.name) return p.housenumber || p.type === 'house' ? 'address' : TYPE[p.type] || 'poi';
  return 'poi'; // a named shop, hotel, venue or building
}
export function fromPhoton(d) {
  return ((d && d.features) || []).filter(f => f && f.geometry && Array.isArray(f.geometry.coordinates)).map(f => {
    const p = f.properties || {}, type = photonType(p), us = !p.countrycode || p.countrycode === 'US';
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const name = type === 'address' ? street : (p.name || street || p.city || '');
    const town = p.city && p.city !== name ? p.city : (p.county && p.county !== name && type !== 'county' ? p.county : '');
    const region = p.state && p.state !== name ? p.state + (us && p.postcode && /address|poi|street/.test(type) ? ' ' + p.postcode : '') : '';
    const parts = [name, type === 'poi' && street !== name ? street : '', town, region, us ? '' : p.country !== name ? p.country : ''].filter(Boolean);
    const t = [...new Set(parts)].join(', ');
    const e = Array.isArray(p.extent) && p.extent.length === 4 ? p.extent.map(Number) : null; // [west, north, east, south]
    return { t, name, type, k: type === 'address' ? 'Address' : type.replace(/^\w/, c => c.toUpperCase()), c: f.geometry.coordinates.slice(0, 2),
      ...(e && e.every(isFinite) ? { bbox: [e[0], e[3], e[2], e[1]] } : {}) };
  }).filter(r => r.t);
}
