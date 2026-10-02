// Team field notes without sign-in: the browser syncs through here and this talks to Supabase with the secret key
// (field_notes, team_watchlist, field-photos bucket). RLS keeps those tables closed to the public key.
//   GET                                   -> { notes: [...], watch: [...] }
//   POST { notes, watch, deletes, name }  -> { ok }      notes/watch upserted; deletes: [{ kind: note|watch|photo, id | wkind+ref | path }]
//   POST { photo: { path, data(base64) } } -> { path }   uploads one JPEG
//   GET ?photo=<path>                     -> image bytes
// Optional FIELD_ACCESS_CODE: when set, every call needs header x-field-code with it (a shared team passcode).
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';

const BUCKET = 'field-photos';
const PHOTO = /^shared\/[\w-]{1,40}\/[\w-]{1,60}\.jpg$/;
const MAX_PHOTO = 6 * 2 ** 20;
const TAGS_MAX = 60;

export function conn(env = process.env) {
  const url = (env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co').replace(/\/$/, ''), key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}) };
  async function call(path, opts = {}) {
    const r = await fetch(url + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error((opts.method || 'GET') + ' ' + path.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r;
  }
  const json = async (path, opts) => { const t = await (await call(path, opts)).text(); return t ? JSON.parse(t) : null; };
  const write = (path, body, prefer) => call('/rest/v1/' + path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Prefer: prefer || 'resolution=merge-duplicates,return=minimal' } });
  return {
    notes: () => json('/rest/v1/field_notes?select=client_id,lng,lat,title,body,tag,photos,created_by_email,updated_by_email,created_at,updated_at&order=updated_at.desc&limit=5000'),
    watch: () => json('/rest/v1/team_watchlist?select=*&order=added_at.desc&limit=2000'),
    upsertNotes: rows => write('field_notes?on_conflict=client_id', rows),
    upsertWatch: rows => write('team_watchlist?on_conflict=kind,ref', rows),
    del: (table, query) => call('/rest/v1/' + table + '?' + query, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
    upload: (path, buf) => call('/storage/v1/object/' + BUCKET + '/' + path, { method: 'POST', body: buf, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' } }),
    download: path => call('/storage/v1/object/' + BUCKET + '/' + path),
    removePhotos: paths => call('/storage/v1/object/' + BUCKET, { method: 'DELETE', body: JSON.stringify({ prefixes: paths }), headers: { 'Content-Type': 'application/json' } })
  };
}

const num = (v, lo, hi) => { const n = +v; return isFinite(n) && n >= lo && n <= hi ? n : null; };
const iso = v => { const t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : new Date().toISOString(); };
const cid = v => /^[\w-]{3,60}$/.test(String(v || '')) ? String(v) : null;
export function cleanNote(n, name) {
  const id = cid(n?.id), lng = num(n?.lng, -180, 180), lat = num(n?.lat, -90, 90); if (!id || lng == null || lat == null) return null;
  return { client_id: id, lng, lat, title: clip(n.title, 200), body: clip(n.text, 8000), tag: clip(n.tag || 'Other', TAGS_MAX), photos: (Array.isArray(n.photos) ? n.photos : []).filter(p => PHOTO.test(p)).slice(0, 40),
    created_at: iso(n.created), updated_at: iso(n.updated), created_by_email: clip(n.by || name || '', 80) || null, updated_by_email: clip(name || n.by || '', 80) || null };
}
export function cleanWatch(w, name) {
  if (!['filing', 'building'].includes(w?.kind) || !w.ref) return null;
  return { kind: w.kind, ref: clip(w.ref, 80), client_id: cid(w.id), label: clip(w.label, 300), sub: clip(w.sub, 300), lng: num(w.lng, -180, 180), lat: num(w.lat, -90, 90), added_by: clip(w.by || name || '', 80) || null, added_at: iso(w.added) };
}
const toNote = r => ({ id: r.client_id, lng: r.lng, lat: r.lat, title: r.title, text: r.body, tag: r.tag, photos: r.photos || [], created: iso(r.created_at), updated: iso(r.updated_at), by: r.created_by_email || '', editedBy: r.updated_by_email || '' });
const toWatch = r => ({ id: r.client_id || r.kind + ':' + r.ref, kind: r.kind, ref: r.ref, label: r.label || '', sub: r.sub || '', lng: r.lng, lat: r.lat, added: iso(r.added_at), by: r.added_by || '' });
const inList = vals => 'in.(' + vals.map(v => '"' + String(v).replace(/["\\]/g, '') + '"').join(',') + ')';

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 120, perDay: 5000 })) return;
  res.setHeader('Cache-Control', 'no-store');
  const code = process.env.FIELD_ACCESS_CODE;
  if (code && String(req.headers['x-field-code'] || '') !== code) return res.status(401).json({ error: 'Enter the team passcode.', passcode: true });
  const db = conn(); if (!db) return res.status(503).json({ error: 'Team sync needs SUPABASE_SECRET_KEY on the site (Vercel).' });
  try {
    if (req.method === 'GET' && req.query?.photo) {
      const path = String(req.query.photo); if (!PHOTO.test(path)) return res.status(400).json({ error: 'bad photo path' });
      const r = await db.download(path); res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg'); res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    }
    if (req.method === 'GET') { const [n, w] = await Promise.all([db.notes(), db.watch()]); return res.json({ notes: n.map(toNote), watch: w.map(toWatch) }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (b.photo) {
      const path = String(b.photo.path || ''), buf = Buffer.from(String(b.photo.data || ''), 'base64');
      if (!PHOTO.test(path)) return res.status(400).json({ error: 'bad photo path' });
      if (!buf.length || buf.length > MAX_PHOTO || buf[0] !== 0xff || buf[1] !== 0xd8) return res.status(400).json({ error: 'Photos must be JPEGs under 6 MB.' });
      await db.upload(path, buf); return res.json({ path });
    }
    const name = clip(b.name, 80).trim();
    const dels = (Array.isArray(b.deletes) ? b.deletes : []).slice(0, 500);
    const noteIds = dels.filter(d => d.kind === 'note').map(d => cid(d.id)).filter(Boolean), photos = dels.filter(d => d.kind === 'photo' && PHOTO.test(d.path)).map(d => d.path);
    if (noteIds.length) await db.del('field_notes', 'client_id=' + encodeURIComponent(inList(noteIds)));
    for (const d of dels.filter(d => d.kind === 'watch' && ['filing', 'building'].includes(d.wkind) && d.ref)) await db.del('team_watchlist', 'kind=eq.' + d.wkind + '&ref=eq.' + encodeURIComponent(clip(d.ref, 80)));
    if (photos.length) await db.removePhotos(photos);
    const notes = (Array.isArray(b.notes) ? b.notes : []).slice(0, 500).map(n => cleanNote(n, name)).filter(Boolean);
    const watch = (Array.isArray(b.watch) ? b.watch : []).slice(0, 2000).map(w => cleanWatch(w, name)).filter(Boolean);
    if (notes.length) await db.upsertNotes(notes);
    if (watch.length) await db.upsertWatch(watch);
    return res.json({ ok: true, notes: notes.length, watch: watch.length, deleted: noteIds.length });
  } catch (e) { console.error('field', e.message); return res.status(502).json({ error: 'The team database didn’t answer. Your changes are kept on this device and will retry.' }); }
}
