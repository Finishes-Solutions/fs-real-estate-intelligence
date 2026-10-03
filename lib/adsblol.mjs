// adsb.lol beyond live positions (free, open data): a plane's flight path from its trace files, airport details, and the
// plane's photo and details from the databases adsb.lol's own map uses (planespotters.net photos, adsbdb aircraft).
// Used by api/planes.js ?track= and ?aircraft=; drawn on the map by src/planes.js (a 3D path when the map is tilted).
// Probed from GitHub Actions 2026-10-03 (build/probe-adsblol.mjs): traces answer without a key; planespotters wants a
// contact URL in the User-Agent; adsb.lol's /v2 API rate-limits quickly, so everything here is cached.
export const UA = 'FinishesSolutions-RealEstateIntel/1.0 (+https://fs-real-estate-intelligence.vercel.app)';
export const traceUrl = (hex, kind) => 'https://globe.adsb.lol/data/traces/' + hex.slice(-2) + '/' + kind + '_' + hex + '.json';
export const okHex = h => /^[0-9a-f]{6}$/.test(String(h || ''));

// readsb / tar1090 trace point: [seconds after `timestamp`, lat, lon, alt (feet or "ground"), gs, track, flags, vrate,
// details | null, source, geom alt, ...]. flags bit 1 = stale (a gap before this point), bit 2 = a new leg starts here.
function points(d) {
  if (!d?.trace?.length) return [];
  let last = 0;
  return d.trace.map(p => {
    const alt = p[3] === 'ground' ? 0 : Number.isFinite(p[3]) ? p[3] : Number.isFinite(p[10]) ? p[10] : last; last = alt;
    return { t: d.timestamp + p[0], lat: p[1], lon: p[2], alt, ground: p[3] === 'ground', leg: !!(p[6] & 2) };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}
// split a day's points into flights (a new leg starts at a leg marker, or after 20+ minutes on the ground / out of sight)
export function legs(pts) {
  const out = []; let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], gap = i && p.t - pts[i - 1].t > 1200;
    if (cur.length && (p.leg || gap)) { out.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  // a "flight" that never left the ground isn't one
  return out.filter(l => l.some(p => !p.ground && p.alt > 0));
}
// at most n points, evenly picked, always keeping the first and last
export function thin(pts, n = 400) {
  if (pts.length <= n) return pts;
  const step = (pts.length - 1) / (n - 1); return Array.from({ length: n }, (_, i) => pts[Math.round(i * step)]);
}

// the current flight's path (and today's earlier flights) for a hex
export async function track(hex, fetchImpl = globalThis.fetch) {
  const get = kind => fetchImpl(traceUrl(hex, kind), { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(9000) })
    .then(r => r.ok ? r.json() : r.status === 404 ? null : Promise.reject(new Error('adsb.lol trace ' + r.status)));
  const [full, recent] = await Promise.all([get('trace_full').catch(e => ({ error: e.message })), get('trace_recent').catch(e => ({ error: e.message }))]);
  if (full?.error && recent?.error) throw new Error(full.error);
  const a = points(full?.error ? null : full), b = points(recent?.error ? null : recent), end = a.length ? a[a.length - 1].t : -Infinity;
  const all = a.concat(b.filter(p => p.t > end)), L = legs(all), now = L[L.length - 1] || [];
  const info = (full && !full.error ? full : recent) || {};
  const leg = l => { const top = l.reduce((m, p) => Math.max(m, p.alt), 0);
    return { start: new Date(l[0].t * 1000).toISOString(), end: new Date(l[l.length - 1].t * 1000).toISOString(), from: [l[0].lon, l[0].lat], to: [l[l.length - 1].lon, l[l.length - 1].lat],
      started_on_ground: l[0].ground || l[0].alt < 1500, max_alt_ft: top }; };
  return { hex, registration: info.r || null, type: info.t || null, desc: info.desc || null, operator: info.ownOp || null, year: info.year || null, military: !!(info.dbFlags & 1),
    points: thin(now).map(p => [p.lon, p.lat, Math.round(p.alt), Math.round(p.t)]), leg: now.length ? leg(now) : null, today: L.map(leg) };
}

// photo + details: planespotters (by hex, then registration), else adsbdb's photo; adsbdb for maker, owner, country
export async function aircraftInfo(hex, reg, fetchImpl = globalThis.fetch) {
  const j = u => fetchImpl(u, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }).then(r => r.ok ? r.json() : null).catch(() => null);
  const [ps, db] = await Promise.all([j('https://api.planespotters.net/pub/photos/hex/' + hex), j('https://api.adsbdb.com/v0/aircraft/' + hex)]);
  let ph = ps?.photos?.[0];
  if (!ph && reg) ph = (await j('https://api.planespotters.net/pub/photos/reg/' + encodeURIComponent(reg)))?.photos?.[0];
  const a = db?.response?.aircraft || null;
  const photo = ph ? { src: ph.thumbnail_large?.src || ph.thumbnail?.src, link: ph.link, credit: ph.photographer || null, source: 'planespotters.net' }
    : a?.url_photo ? { src: a.url_photo_thumbnail || a.url_photo, link: a.url_photo, credit: null, source: 'airport-data.com' } : null;
  return { hex, photo: photo?.src ? photo : null, manufacturer: a?.manufacturer || null, model: a?.type || null, icao_type: a?.icao_type || null, registration: a?.registration || reg || null,
    owner: a?.registered_owner || null, country: a?.registered_owner_country_name || null };
}

// airport by ICAO code (name, city, position, elevation)
export async function airport(icao, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl('https://api.adsb.lol/api/0/airport/' + encodeURIComponent(icao), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('adsb.lol airport ' + r.status);
  const a = await r.json(); return a ? { icao: a.icao, iata: a.iata || null, name: a.name, city: a.location, country: a.countryiso2, lat: a.lat, lon: a.lon, elevation_ft: a.alt_feet } : null;
}
