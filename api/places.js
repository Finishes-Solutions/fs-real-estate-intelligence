// Businesses and places in the seven counties: Overture Maps Places and Foursquare Open Source Places, merged and loaded
// monthly into Supabase (build/places.mjs, "Places" workflow).
//   GET ?box=w,s,e,n[&groups=food,shop][&limit=4000]   the map layer: [[id, name, group, lon, lat]]
//   GET ?near=lat,lon[&m=150&n=60]                        places within m meters, nearest first (building card)
//   GET ?q=name[&near=lat,lon][&n=8]                      search by name, closest first (map search)
//   GET ?id=ov:…                                           one place
//   GET ?counts=w,s,e,n                                    places per group in a box
//   GET ?meta=1                                            the last load: when, releases, counts
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';
import { GROUPS, normName } from '../lib/places.mjs';

const db = (env = process.env) => supa({ ...env, SUPABASE_URL: env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co' });
export const SOURCES = 'Overture Maps Foundation Places (CDLA-Permissive-2.0; includes Meta, Microsoft, BrightQuery and Foursquare records) and Foursquare Open Source Places (Apache-2.0).';
const box = (s, maxDeg2) => { const b = String(s || '').split(',').map(Number); return b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && (b[2] - b[0]) * (b[3] - b[1]) <= maxDeg2 ? b : null; };
const latlon = s => { const [lat, lon] = String(s || '').split(',').map(Number); return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? [lat, lon] : null; };

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 90, perDay: 4000 })) return;
  const q = req.query || {}, d = db();
  if (!d || d.via !== 'key') return res.status(503).json({ error: 'Places aren’t configured here (SUPABASE_SECRET_KEY).' });
  const cache = (a, b) => res.setHeader('Cache-Control', 'public, max-age=' + a + ', s-maxage=' + b);
  try {
    if (q.box) {
      // a neighborhood at most (about 0.15° square): the layer only shows from street zoom
      const b = box(q.box, 0.03); if (!b) return res.status(400).json({ error: 'box=w,s,e,n, at most about 10 by 10 miles' });
      const groups = String(q.groups || '').split(',').filter(g => GROUPS[g]), limit = Math.min(8000, Math.max(100, +q.limit || 4000));
      const list = await d.rpc('places_in_box', { w: b[0], s: b[1], e: b[2], n: b[3], p_groups: groups.length ? groups : null, p_limit: limit });
      cache(3600, 86400); return res.json({ places: list, capped: list.length >= limit });
    }
    if (q.q) {
      const t = normName(q.q).slice(0, 60); if (t.length < 2) return res.status(400).json({ error: 'Type at least 2 letters.' });
      const p = latlon(q.near), n = Math.min(20, Math.max(1, +q.n || 8));
      const list = await d.rpc('places_search', { p_q: t, p_lon: p ? p[1] : null, p_lat: p ? p[0] : null, p_n: n });
      cache(600, 86400); return res.json({ places: list });
    }
    if (q.near) {
      const p = latlon(q.near); if (!p) return res.status(400).json({ error: 'near=lat,lon' });
      const m = Math.min(2000, Math.max(10, +q.m || 150)), n = Math.min(200, Math.max(1, +q.n || 60));
      const list = await d.rpc('places_near', { p_lon: p[1], p_lat: p[0], p_m: m, p_n: n });
      cache(3600, 86400); return res.json({ places: list });
    }
    if (q.id) {
      const x = await d.rpc('place_get', { p_id: String(q.id).slice(0, 80) }); if (!x) return res.status(404).json({ error: 'No such place.' });
      cache(3600, 86400); return res.json(x);
    }
    if (q.counts) {
      const b = box(q.counts, 4); if (!b) return res.status(400).json({ error: 'counts=w,s,e,n (up to 2° by 2°)' });
      const c = await d.rpc('places_counts', { w: b[0], s: b[1], e: b[2], n: b[3] });
      cache(3600, 86400); return res.json({ counts: c, groups: Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, v.label])) });
    }
    if (q.meta) {
      const rows = await d.select('places_loads', 'select=*&order=at.desc&limit=1');
      cache(600, 3600); return res.json({ last: rows[0] || null, sources: SOURCES });
    }
    return res.status(400).json({ error: 'Use box, near, q, id, counts or meta.' });
  } catch (e) {
    console.error('places', e.message); res.setHeader('Cache-Control', 'no-store');
    const missing = /does not exist|PGRST20[02]|Could not find the function/i.test(e.message);
    return res.status(missing ? 503 : 502).json({ error: missing ? 'Places aren’t loaded yet (run the Places workflow).' : 'Places lookup failed: ' + e.message });
  }
}
