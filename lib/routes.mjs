// Flight routes from the Virtual Radar Server standing data (github.com/vradarserver/standing-data, free, updated by
// the community): one CSV per airline, callsign -> every airport the flight number calls at, e.g. AAL2302 =
// KORD-KIAH-KORD. That's the data adsb.lol's own route lookup used before it started answering empty (October 2026).
// A multi-stop flight number is flown one leg at a time, so pickLeg chooses the leg the plane is on from where it is,
// which way it's heading and whether it's climbing or descending. Used by api/planes.js ?route=.
export const VRS = 'https://raw.githubusercontent.com/vradarserver/standing-data/main/routes/schema-01/';
const TTL = 6 * 3600e3;
const files = new Map(); // airline code -> { t, map: Map(callsign -> [ICAO, ...]) | null, job }

// ICAO airline callsigns only (three letters, then the flight number): N-numbers and other registrations have no route
export const airlineOf = cs => { const m = /^([A-Z]{3})(\d[0-9A-Z]{0,4})$/.exec(String(cs || '').trim().toUpperCase()); return m ? m[1] : null; };

export function parseRoutes(text) {
  const map = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const c = line.split(','); if (c.length < 5 || c[0].charCodeAt(0) === 0xfeff || c[0] === 'Callsign') continue;
    const aps = c[4].trim().split('-').filter(Boolean); if (aps.length > 1) map.set(c[0].trim().toUpperCase(), aps);
  }
  return map;
}

// [ICAO, ...] for a callsign, or null
export async function vrsCodes(callsign, fetchImpl = globalThis.fetch) {
  const code = airlineOf(callsign); if (!code) return null;
  let f = files.get(code);
  if (!f || Date.now() - f.t > TTL) {
    const job = fetchImpl(VRS + code[0] + '/' + code + '-all.csv', { signal: AbortSignal.timeout(6000) })
      .then(r => r.ok ? r.text().then(parseRoutes) : r.status === 404 ? new Map() : Promise.reject(new Error('VRS routes ' + r.status)));
    f = { t: Date.now(), job }; files.set(code, f);
    job.catch(() => files.delete(code)); // a failed download is retried by the next lookup
    if (files.size > 400) files.delete(files.keys().next().value);
  }
  return (await f.job).get(String(callsign).trim().toUpperCase()) || null;
}

const R = Math.PI / 180;
export const MI = (a, b) => { const h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 7917.6 * Math.asin(Math.sqrt(h)); };
export const BRG = (a, b) => { const y = Math.sin((b[0] - a[0]) * R) * Math.cos(b[1] * R), x = Math.cos(a[1] * R) * Math.sin(b[1] * R) - Math.sin(a[1] * R) * Math.cos(b[1] * R) * Math.cos((b[0] - a[0]) * R); return (Math.atan2(y, x) / R + 360) % 360; };

// airports: [{ lat, lon, ... }, ...] in calling order (null where unknown). Returns { i, origin, destination } for the leg
// that best fits the plane, or null. Lower score = better fit:
//   detour     how far off the straight line between the two airports the plane is (0 when on it)
//   heading    how far the plane's track is from the bearing to the leg's destination (0..1), away from that airport
//   climb      descending within 60 mi of the destination or climbing within 60 mi of the origin fits (-1); the reverse
//              (descending near where it left, climbing near where it's going) doesn't (+1)
// The caller still checks the chosen leg with plausible() so a stale route is rejected rather than forced.
export function pickLeg(airports, lat, lon, track, vs) {
  const p = [lon, lat]; let best = null;
  for (let i = 0; i + 1 < airports.length; i++) {
    const o = airports[i], d = airports[i + 1]; if (!o || !d) continue;
    const A = [o.lon, o.lat], B = [d.lon, d.lat], dA = MI(p, A), dB = MI(p, B), len = Math.max(1, MI(A, B));
    let s = Math.min(2, Math.max(0, (dA + dB) / len - 1));
    if (Number.isFinite(track) && dB > 15) s += Math.abs(((track - BRG(p, B)) + 540) % 360 - 180) / 180;
    if (Number.isFinite(vs) && Math.abs(vs) > 250) {
      if (vs < 0 && dB < 60) s -= 1; else if (vs > 0 && dA < 60) s -= 1;
      if (vs < 0 && dA < 60 && dB >= 60) s += 1; if (vs > 0 && dB < 60 && dA >= 60) s += 1;
    }
    if (!best || s < best.s) best = { s, i, origin: o, destination: d };
  }
  return best && { i: best.i, origin: best.origin, destination: best.destination };
}
