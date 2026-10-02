// Regrid (paid; Bundle Access: 2,000 parcel records and 200,000 tiles a month, overage $0.10 per record / $0.001 per tile).
// The token stays on the server (REGRID_TOKEN on Vercel); the browser only ever talks to this endpoint.
//   GET ?lat=&lon=[&key=county|prop_id]  one parcel record (building card button). Each parcel is paid for once: the
//                                         record is saved in Supabase (regrid_parcels) and served from there afterwards.
//   GET ?tile=z/x/y                       parcel-line vector tile (map layer, zoom 15–16 only; deeper zooms reuse z16)
//   GET ?usage=1                          what's been used this billing cycle against the caps
// Hard caps (refuse instead of going into overage): REGRID_RECORD_CAP (default 1800), REGRID_TILE_CAP (default 180000).
// Every billable call is counted atomically in Supabase (regrid_take) and checked against Regrid's own /usage numbers,
// so the counter never runs behind Regrid. Without Supabase there is no counter, so the endpoint refuses (fails closed).
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';

const API = 'https://app.regrid.com/api/v2';
const TILE_URL = process.env.REGRID_TILE_URL || 'https://tiles.regrid.com/api/v1/parcels/{z}/{x}/{y}.mvt';
const CAP = { records: +(process.env.REGRID_RECORD_CAP || 1800), tiles: +(process.env.REGRID_TILE_CAP || 180000) };
export const TILE_ZOOM = [15, 16];

// Regrid's own usage for the current billing cycle, cached per instance for 10 minutes (the /usage call is not billed)
let usageCache = null;
export function cycleOf(u, now = new Date()) {
  const b = u?.usage?.cycle_dates?.begin;
  if (Number.isFinite(b) && b > 0) return new Date(b < 1e12 ? b * 1000 : b).toISOString().slice(0, 10);
  return now.toISOString().slice(0, 7) + '-01'; // calendar month when Regrid doesn't say
}
async function regridUsage(token) {
  if (usageCache && Date.now() - usageCache.at < 600e3) return usageCache;
  let u = null;
  try { const r = await fetch(API + '/usage?return_by_this_token=false', { headers: { 'x-regrid-token': token }, signal: AbortSignal.timeout(6000) }); if (r.ok) u = await r.json(); } catch (e) {}
  const cu = u?.usage?.cycle_usage || {};
  usageCache = { at: Date.now(), cycle: cycleOf(u), records: Math.max(+cu.results || 0, +cu.features || 0), tiles: +cu.tiles || 0, known: !!u };
  return usageCache;
}
// take n units, or return false when that would pass the cap
async function take(db, token, kind, n) {
  const u = await regridUsage(token);
  const total = await db.rpc('regrid_take', { p_cycle: u.cycle, p_kind: kind, p_n: n, p_cap: CAP[kind], p_floor: u[kind] || 0 });
  return total >= 0 ? total : false;
}
async function used(db, token) {
  const u = await regridUsage(token);
  const rows = await db.select('regrid_usage', 'cycle=eq.' + encodeURIComponent(u.cycle) + '&select=kind,n').catch(() => []);
  const ours = Object.fromEntries(rows.map(r => [r.kind, r.n]));
  return { cycle: u.cycle, regrid_reported: u.known, records: { used: Math.max(ours.records || 0, u.records), cap: CAP.records }, tiles: { used: Math.max(ours.tiles || 0, u.tiles), cap: CAP.tiles } };
}

// the fields the card shows, in order; everything else non-empty goes in `more`
const SHOW = [['parcelnumb', 'Parcel number'], ['owner', 'Owner'], ['mailadd', 'Mailing address'], ['usedesc', 'Land use (county)'], ['lbcs_activity_desc', 'Activity (standardized)'],
  ['lbcs_function_desc', 'Function (standardized)'], ['zoning', 'Zoning'], ['zoning_description', 'Zoning description'], ['yearbuilt', 'Year built'], ['numstories', 'Stories'],
  ['ll_bldg_footprint_sqft', 'Building footprint sq ft'], ['ll_bldg_count', 'Buildings on parcel'], ['ll_gisacre', 'Acres'], ['parval', 'Total value'], ['landval', 'Land value'],
  ['improvval', 'Improvement value'], ['saleprice', 'Last sale price'], ['saledate', 'Last sale date'], ['usps_vacancy', 'USPS vacancy'], ['legaldesc', 'Legal description'], ['ll_last_refresh', 'Regrid data refreshed']];
const empty = v => v == null || v === '' || v === 0 || v === '0';
export function trimRecord(feature) {
  const p = feature?.properties || {}, f = p.fields || {};
  const mail = [f.mailadd, [f.mail_city, f.mail_state2, f.mail_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const fields = SHOW.map(([k, label]) => [label, k === 'mailadd' ? mail : f[k]]).filter(([, v]) => !empty(v)).map(([label, v]) => [label, String(v).slice(0, 200)]);
  const shown = new Set(SHOW.map(s => s[0]).concat(['mail_city', 'mail_state2', 'mail_zip', 'geoid', 'll_uuid', 'll_stable_id', 'path']));
  const more = Object.entries(f).filter(([k, v]) => !shown.has(k) && !empty(v) && typeof v !== 'object').slice(0, 80).map(([k, v]) => [k, String(v).slice(0, 160)]);
  return { ll_uuid: p.ll_uuid || f.ll_uuid || null, headline: p.headline || f.address || '', path: p.path || f.path || '', fields, more,
    zoning: (feature?.zoning || null) };
}

export default async function handler(req, res) {
  const token = process.env.REGRID_TOKEN || process.env.REGRID_API_KEY, q = req.query || {};
  if (!token) return res.status(503).json({ error: 'Regrid isn’t set up on this deployment (REGRID_API_KEY is missing).' });
  const db = supa();
  if (!db) return res.status(503).json({ error: 'Regrid is paused: the usage counter needs SUPABASE_URL and SUPABASE_SECRET_KEY on the server.' });

  // ---- tile ----
  if (q.tile) {
    const m = String(q.tile).match(/^(\d{1,2})\/(\d{1,7})\/(\d{1,7})$/); if (!m) return res.status(400).end();
    const [z, x, y] = m.slice(1).map(Number);
    if (z < TILE_ZOOM[0] || z > TILE_ZOOM[1] || x >= 2 ** z || y >= 2 ** z) return res.status(400).end();
    // empty answer (no charge) once the monthly cap is reached; the map just shows no lines
    try { if ((await take(db, token, 'tiles', 1)) === false) { res.setHeader('X-Regrid-Capped', '1'); res.setHeader('Cache-Control', 'public, s-maxage=3600'); return res.status(204).end(); } }
    catch (e) { console.error('regrid tile counter', e.message); return res.status(503).end(); }
    const r = await fetch(TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y) + (TILE_URL.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token), { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (!r || !r.ok) return res.status(r?.status === 404 ? 204 : 502).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/x-protobuf');
    // (fetch already decompressed the body, so no Content-Encoding is passed on)
    // parcel lines change rarely: the CDN keeps each tile a week, so a tile is paid for once a week at most
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  }

  if (!sameOrigin(req, res)) return;
  // ---- usage ----
  if (q.usage) { try { res.setHeader('Cache-Control', 'no-store'); return res.json(await used(db, token)); } catch (e) { return res.status(502).json({ error: e.message }); } }

  // ---- one parcel record ----
  const lat = +q.lat, lon = +q.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 25 || lat > 37 || lon < -107 || lon > -93) return res.status(400).json({ error: 'lat/lon must be inside Texas' });
  const key = /^[\w .'-]{1,40}\|[\w.-]{1,40}$/.test(String(q.key || '')) ? 'pid:' + String(q.key).toLowerCase() : 'pt:' + lat.toFixed(5) + ',' + lon.toFixed(5);
  try {
    const hit = (await db.select('regrid_parcels', 'k=eq.' + encodeURIComponent(key) + '&select=data,geom,fetched_at'))[0];
    if (hit) return res.json({ ...hit.data, geom: hit.geom, cached: true, fetched: hit.fetched_at.slice(0, 10), usage: await used(db, token) });
  } catch (e) { console.error('regrid cache', e.message); }
  if (!rateLimit(req, res, { perMinute: 10, perDay: 120 })) return;
  let total;
  try { total = await take(db, token, 'records', 1); } catch (e) { console.error('regrid counter', e.message); return res.status(503).json({ error: 'Couldn’t check the Regrid allowance, so nothing was spent. Try again shortly.' }); }
  if (total === false) return res.status(429).json({ error: 'This month’s Regrid allowance (' + CAP.records + ' parcel records) is used up. The free county appraisal data above still works; Regrid resets next billing cycle.', capped: true });
  const u = new URL(API + '/parcels/point');
  Object.entries({ lat: lat.toFixed(6), lon: lon.toFixed(6), limit: '1', return_matched_buildings: 'false', return_matched_addresses: 'false', return_enhanced_ownership: 'false' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'x-regrid-token': token }, signal: AbortSignal.timeout(12000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
  if (!r.ok) { const t = await r.text(); console.error('regrid point', r.status, t.slice(0, 200)); return res.status(502).json({ error: r.status === 401 ? 'Regrid rejected the token.' : 'Regrid didn’t answer just now.' }); }
  const d = await r.json(), f = d?.parcels?.features?.[0];
  if (!f) return res.json({ none: true, usage: await used(db, token) });
  const out = trimRecord({ ...f, zoning: d?.zoning?.features?.[0]?.properties || null });
  try { await db.upsert('regrid_parcels', [{ k: key, ll_uuid: out.ll_uuid, data: out, geom: f.geometry || null }], 'k'); } catch (e) { console.error('regrid save', e.message); }
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ...out, geom: f.geometry || null, cached: false, usage: await used(db, token) });
}
