// Development activity in the seven counties, loaded nightly into Supabase by build/county-data.mjs ("County data"
// workflow): Harris County building permits, plats and new subdivisions, TxDOT projects, water districts (MUDs) and
// schools. Sources in lib/countydata.mjs.
//   GET ?box=w,s,e,n&kinds=permit,plat[&since=YYYY-MM-DD][&shapes=1][&limit=4000]  the map layers: compact rows
//   GET ?near=lat,lon&kinds=permit,plat,district,school,txdot[&m=200&n=20]        the property card, the assistant
//   GET ?counts=w,s,e,n[&since=YYYY-MM-DD]                                         rows per kind and category in a box
//   GET ?id=permit:hcad:…                                                          one row, full
//   GET ?meta=1                                                                    the last load of each source
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';

const db = (env = process.env) => supa({ ...env, SUPABASE_URL: env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co' });
export const KINDS = ['permit', 'plat', 'txdot', 'district', 'school'];
const box = (s, maxDeg2) => { const b = String(s || '').split(',').map(Number); return b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && (b[2] - b[0]) * (b[3] - b[1]) <= maxDeg2 ? b : null; };
const latlon = s => { const [lat, lon] = String(s || '').split(',').map(Number); return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? [lat, lon] : null; };
const kinds = s => { const k = String(s || '').split(',').filter(x => KINDS.includes(x)); return k.length ? k : null; };
const day = s => /^\d{4}-\d\d-\d\d$/.test(String(s || '')) ? String(s) : null;

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 90, perDay: 4000 })) return;
  const q = req.query || {}, d = db();
  if (!d || d.via !== 'key') return res.status(503).json({ error: 'County data isn’t configured here (SUPABASE_SECRET_KEY).' });
  const cache = (a, b) => res.setHeader('Cache-Control', 'public, max-age=' + a + ', s-maxage=' + b);
  try {
    if (q.box) {
      const k = kinds(q.kinds); if (!k) return res.status(400).json({ error: 'kinds=' + KINDS.join(',') });
      // outlines only at neighborhood size; points (and TxDOT lines) up to a few counties
      const shapes = q.shapes === '1', b = box(q.box, shapes ? 0.06 : 4); if (!b) return res.status(400).json({ error: shapes ? 'box=w,s,e,n, at most about 15 by 15 miles with outlines' : 'box=w,s,e,n (up to 2° by 2°)' });
      const limit = Math.min(8000, Math.max(100, +q.limit || 4000));
      const rows = await d.rpc('dev_in_box', { p_kinds: k, w: b[0], s: b[1], e: b[2], n: b[3], p_since: day(q.since), p_limit: limit, p_shapes: shapes });
      cache(3600, 21600); return res.json({ rows, capped: rows.length >= limit });
    }
    if (q.near) {
      const p = latlon(q.near); if (!p) return res.status(400).json({ error: 'near=lat,lon' });
      const k = kinds(q.kinds) || KINDS, m = Math.min(5000, Math.max(10, +q.m || 200)), n = Math.min(200, Math.max(1, +q.n || 20));
      const rows = await d.rpc('dev_near', { p_kinds: k, p_lon: p[1], p_lat: p[0], p_m: m, p_n: n });
      cache(3600, 21600); return res.json({ rows });
    }
    if (q.counts) {
      const b = box(q.counts, 4); if (!b) return res.status(400).json({ error: 'counts=w,s,e,n (up to 2° by 2°)' });
      const c = await d.rpc('dev_counts', { w: b[0], s: b[1], e: b[2], n: b[3], p_since: day(q.since) });
      cache(3600, 21600); return res.json({ counts: c });
    }
    if (q.id) {
      const x = await d.rpc('dev_get', { p_id: String(q.id).slice(0, 120) }); if (!x) return res.status(404).json({ error: 'Not found.' });
      cache(3600, 21600); return res.json(x);
    }
    if (q.meta) {
      const m = await d.rpc('county_meta', {});
      cache(600, 3600); return res.json({ sources: m });
    }
    return res.status(400).json({ error: 'Use box, near, counts, id or meta.' });
  } catch (e) {
    console.error('devdata', e.message); res.setHeader('Cache-Control', 'no-store');
    const missing = /does not exist|PGRST20[02]|Could not find the function/i.test(e.message);
    return res.status(missing ? 503 : 502).json({ error: missing ? 'County data isn’t loaded yet (run the County data workflow).' : 'County data lookup failed: ' + e.message });
  }
}
