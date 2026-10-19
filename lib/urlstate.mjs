// Where you are, kept in the page address so a reload (or the installed app reopening) comes back to it.
// The app writes these next to the filters (lib/filter.mjs):
//   ml=lat,lng,zoom[,bearing,pitch]  the map camera
//   b=lat,lng                        an open property card
//   sp=project.plan                  the open site plan
//   pj=project                       the project open on the Projects page
//   pt=tab                           that project page's tab (options, renderings, ask; none for Overview)
// None of these turn the filing dots on by themselves (only real filters do).
export const OWN_KEYS = ['v', 'f', 'b', 'ml', 'pj', 'pt', 'sp'];

export function camStr({ lat, lng, zoom, bearing = 0, pitch = 0 }) {
  const tilt = Math.abs(bearing) > 0.5 || pitch > 0.5;
  return [lat.toFixed(5), lng.toFixed(5), zoom.toFixed(2)].concat(tilt ? [bearing.toFixed(1), pitch.toFixed(1)] : []).join(',');
}
export function parseCam(s) {
  const a = String(s || '').split(',').map(Number);
  if (!(a.length === 3 || a.length === 5) || !a.every(Number.isFinite)) return null;
  if (Math.abs(a[0]) > 90 || Math.abs(a[1]) > 180 || a[2] < 1 || a[2] > 22) return null;
  return { center: [a[1], a[0]], zoom: a[2], bearing: a[3] || 0, pitch: Math.min(85, Math.max(0, a[4] || 0)) };
}
// "lat,lng" -> [lng, lat]
export function parseLatLng(s) {
  const a = String(s || '').split(',').map(Number);
  return a.length === 2 && a.every(Number.isFinite) && Math.abs(a[0]) <= 90 && Math.abs(a[1]) <= 180 ? [a[1], a[0]] : null;
}
export function parsePlanRef(s) {
  const a = String(s || '').split('.');
  return a.length === 2 && a.every(x => /^[a-z0-9]{4,40}$/i.test(x)) ? a : null;
}
// what the page opens with: the address when it has anything, else the last one kept on this device
export const startHash = (hash, kept) => hash || kept || '';
// filters beyond the date range (which the app always writes) put the filing dots on
export const showsFilings = keys => keys.some(k => !OWN_KEYS.includes(k) && k !== 'd');
export const hasSpec = keys => keys.some(k => !OWN_KEYS.includes(k));
// a street address being typed: a house number, then a word ("1004 Priya Ln", "12b Main")
export const looksLikeAddress = q => /^\d+[a-z]?\s+[a-z]/i.test(String(q || '').trim());
