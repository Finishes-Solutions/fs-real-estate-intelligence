// Aircraft from community ADS-B networks (free, no key): adsb.lol first (open data, ODbL), airplanes.live as a fallback
// (same readsb JSON, non-commercial terms). Used by api/planes.js (live layer, routes, history reads) and
// api/planes-sample.js (the every-minute sampler that builds the low-flight history in Supabase).
// From Vercel, adsb.lol rate-limits (429) when many views miss the cache and airplanes.live refuses (403), so two more
// free readsb-compatible feeds back them up (2026-10-03).
import { aircraftType } from './aircraft-types.mjs';
import { shapeOf } from './aircraft-shapes.mjs';
export const SOURCES = [
  { name: 'adsb.lol', point: (lat, lon, nm) => 'https://api.adsb.lol/v2/point/' + lat + '/' + lon + '/' + nm },
  { name: 'adsb.fi', point: (lat, lon, nm) => 'https://opendata.adsb.fi/api/v2/lat/' + lat + '/lon/' + lon + '/dist/' + nm },
  { name: 'adsb.one', point: (lat, lon, nm) => 'https://api.adsb.one/v2/point/' + lat + '/' + lon + '/' + nm },
  { name: 'airplanes.live', point: (lat, lon, nm) => 'https://api.airplanes.live/v2/point/' + lat + '/' + lon + '/' + nm }
];
export const LOW_FT = 3000; // "low": airborne and below this barometric altitude (approach / departure / helicopters)
const NM = 1.852; // km per nautical mile

// one aircraft from readsb JSON -> what the map and the assistant need
export function normalize(a) {
  if (!a || !isFinite(a.lat) || !isFinite(a.lon)) return null;
  const ground = a.alt_baro === 'ground', alt = ground ? 0 : isFinite(a.alt_baro) ? Math.round(a.alt_baro) : isFinite(a.alt_geom) ? Math.round(a.alt_geom) : null;
  return {
    hex: String(a.hex || '').replace(/^~/, '').toLowerCase(), flight: String(a.flight || '').trim() || null, reg: a.r || null, type: a.t || null, desc: a.desc || aircraftType(a.t),
    lat: +(+a.lat).toFixed(5), lon: +(+a.lon).toFixed(5), alt, ground,
    gs: isFinite(a.gs) ? Math.round(a.gs) : null, track: isFinite(a.track) ? Math.round(a.track) : isFinite(a.true_heading) ? Math.round(a.true_heading) : null,
    vs: isFinite(a.baro_rate) ? Math.round(a.baro_rate) : isFinite(a.geom_rate) ? Math.round(a.geom_rate) : null,
    squawk: a.squawk || null, cat: a.category || null, shape: shapeOf(a.t, a.category, a.dbFlags), mil: !!(a.dbFlags & 1), seen: isFinite(a.seen_pos) ? +a.seen_pos : isFinite(a.seen) ? +a.seen : null
  };
}
export const isLow = p => p && !p.ground && p.alt != null && p.alt > 0 && p.alt < LOW_FT;

// map view -> one point query covering it. Rounded coarsely so viewers looking at about the same area (and one viewer
// panning around) share the CDN cache instead of each asking the feeds; the radius covers the view plus the rounding.
export function pointQuery([w, s, e, n]) {
  const lat = (s + n) / 2, lon = (w + e) / 2, R = Math.PI / 180;
  const halfKm = Math.hypot((e - w) / 2 * 111.32 * Math.cos(lat * R), (n - s) / 2 * 110.57);
  const RADII = [25, 50, 100, 150, 200, 250], stepOf = nm => nm <= 25 ? 0.2 : nm <= 50 ? 0.4 : nm <= 100 ? 0.8 : 1.5;
  // the rounded centre can sit up to half a step (diagonally) from the real one: add that to the radius needed
  let nm = RADII.find(r => r >= (halfKm + stepOf(r) / 2 * 111 * Math.SQRT2) / NM) || 250;
  const step = stepOf(nm), rnd = v => Math.round(v / step) * step;
  return { lat: +rnd(lat).toFixed(2), lon: +rnd(lon).toFixed(2), nm };
}

// first source that answers -> { source, time, aircraft }
export async function fetchPoint(lat, lon, nm, fetchImpl = globalThis.fetch, ms = 8000, sources = SOURCES) {
  const errors = [];
  for (const src of sources) {
    try {
      const r = await fetchImpl(src.point(lat, lon, nm), { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0', Accept: 'application/json' } });
      if (!r.ok) throw new Error(src.name + ' ' + r.status);
      const d = await r.json(), list = d.ac || d.aircraft;
      if (!Array.isArray(list)) throw new Error(src.name + ': no aircraft list');
      return { source: src.name, time: d.now ? new Date(d.now > 1e12 ? d.now : d.now * 1000).toISOString() : new Date().toISOString(), aircraft: list.map(normalize).filter(Boolean) };
    } catch (e) { errors.push(e.message); }
  }
  throw new Error(errors.join('; '));
}

// ~1 km grid cell (0.01°): its south-west corner. Stored as numbers so the database can sum any box of cells.
export const cellOf = (lat, lon) => [Math.floor(lon * 100 + 1e-9) / 100, Math.floor(lat * 100 + 1e-9) / 100]; // 1e-9: a point exactly on an edge always lands in the same cell
// one sample -> per-cell counts: n = aircraft seen low in the cell, min_alt = the lowest of them
export function binLow(aircraft) {
  const m = new Map();
  for (const p of aircraft) if (isLow(p)) {
    const [lon, lat] = cellOf(p.lat, p.lon), k = lon + ',' + lat, c = m.get(k) || { lon, lat, n: 0, min_alt: p.alt };
    c.n++; c.min_alt = Math.min(c.min_alt, p.alt); m.set(k, c);
  }
  return [...m.values()];
}
// box of km around a point, for "low flights over this property"
export function boxAround(lon, lat, km = 1) {
  const dLat = km / 110.57, dLon = km / (111.32 * Math.cos(lat * Math.PI / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

// per-day cell rows + how many samples ran -> the history summary shown on cards and to the assistant.
// The sampler runs every minute (1,440 a day; every 5 minutes before 2026-10-03). The index is sightings per 288
// samples, the original 5-minute day, so it means the same thing whatever the sampling rate and mixed history stays
// comparable, and dividing by the samples actually taken keeps missed runs from looking like quiet skies. A plane that
// stays low over the spot for several minutes counts more than once, so this is an exposure index (how much low
// traffic), not a count of distinct flights.
export const SAMPLES_PER_DAY = 1440, INDEX_SAMPLES = 288;
// sightings -> the index, given how many samples ran
export const perDay = (sightings, samples) => samples > 0 ? Math.round(sightings / samples * INDEX_SAMPLES * 10) / 10 : null;
export function summarize(rows, samples, days) {
  let total = 0, minAlt = null;
  for (const r of rows || []) { total += r.n || 0; if (r.min_alt != null) minAlt = minAlt == null ? r.min_alt : Math.min(minAlt, r.min_alt); }
  return { days, samples, sampled_days: Math.round(samples / SAMPLES_PER_DAY * 10) / 10, low_sightings: total, low_per_day: perDay(total, samples), lowest_ft: minAlt };
}
