// Diagnostic: crime by city / county (api/crimeus) against the live FBI and Census services for places across the US:
// which department each point gets, why, and the headline rates. Run "Probe services" with script=fbi.
import handler from '../api/crimeus.js';
const PTS = [
  ['Downtown Houston', 29.7604, -95.3698], ['Brookshire TX', 29.786, -95.95], ['Rural Waller County', 30.15, -96.05], ['Hempstead TX', 30.0974, -96.0783], ['Katy (Waller side)', 29.7858, -95.8245],
  ['Cypress TX (unincorporated)', 29.9691, -95.6972], ['Sugar Land TX', 29.6197, -95.6349], ['Austin TX', 30.2672, -97.7431], ['Manhattan NY', 40.758, -73.9855], ['Brooklyn NY', 40.6782, -73.9442],
  ['Washington DC', 38.8977, -77.0365], ['Nashville TN', 36.1627, -86.7816], ['Fairfax City VA', 38.8462, -77.3064], ['Fairfax County VA (Reston)', 38.9586, -77.357], ['Los Angeles CA', 34.0522, -118.2437],
  ['Chicago IL', 41.8781, -87.6298], ['Lower Merion Twp PA', 40.0185, -75.2799], ['Cambridge MA', 42.3736, -71.1097], ['New Orleans LA', 29.9511, -90.0715], ['Rural Montana', 46.9, -110.4],
  ['Anchorage AK', 61.2181, -149.9003], ['Honolulu HI', 21.3069, -157.8583], ['Indianapolis IN', 39.7684, -86.1581], ['Louisville KY', 38.2527, -85.7585]
];
const call = async query => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader() {} }; await handler({ headers: {}, query, method: 'GET' }, r); return r; };
for (const [label, lat, lon] of PTS) {
  const t = Date.now(), r = await call({ lat: String(lat), lon: String(lon) }), d = r.body || {};
  const h = d.headline || {};
  console.log((label + ' '.repeat(28)).slice(0, 28) + ' ' + r.code + ' ' + String(Date.now() - t).padStart(5) + 'ms | ' + (d.where ? [d.where.place_name, d.where.subdivision, d.where.county_name, d.where.state].join(' / ') : '') +
    ' | ' + (d.agency ? d.agency.ori + ' ' + d.agency.name + ' (' + d.why + ')' : d.error || d.note) +
    (d.year ? ' | ' + d.year + (d.partial ? ' partial ' + d.months + 'mo' : '') + ' pop ' + d.population + ' | violent ' + h.rate_v + ' (TX/state ' + h.state_rate_v + ', US ' + h.us_rate_v + ') property ' + h.rate_p + ' (state ' + h.state_rate_p + ', US ' + h.us_rate_p + ') chg ' + h.change_v + '/' + h.change_p + ' cleared ' + h.cleared_v + '/' + h.cleared_p : '') +
    ' | others ' + (d.others || []).length);
  if (label === 'Brookshire TX') console.log('  years:', JSON.stringify(d.years?.slice(0, 4)), '\n  mix:', JSON.stringify(d.offenses), '\n  through', d.data_through, d.refreshed);
}
