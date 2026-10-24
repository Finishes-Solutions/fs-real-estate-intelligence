// A project's reference files (a survey, existing floor plans, an earlier site plan…), kept in a private Supabase
// storage bucket (site-files) through the secret key, like the field photos (api/field.js), and read by the AI into
// facts (lib/sitefiles.mjs). The file itself goes from the browser straight to storage on a one-time signed link, so
// a 20 MB survey never passes through this function's request body; this function lists, links, reads and deletes.
//   GET  ?pid=<project>                          -> { files: [{ path, id, name, size, type, at }] }
//   GET  ?pid=<project>&open=<path>               -> { url }  a link to the file, good for ten minutes
//   POST { pid, upload: { name, size } }          -> { id, path, url }  a one-time link to PUT the file to
//   POST { pid, read: { path } }                  -> { read: { kind, title, readable, unreadable, summary }, facts: [...] }
//   POST { pid, remove: [path] }                  -> { ok, removed }
//   POST { pid, media: { kind, key, size } }   -> { path, url }  a one-time link to PUT a rendering, its massing or a
//                                                plan set PDF to, so it opens on any computer (the project-media bucket)
//   GET  ?pid=<project>&media=<kind>/<key>       -> { url }  a link to it, good for ten minutes (404: none kept)
//   POST { pid, unmedia: ['<kind>/<key>', …] }    -> { ok, removed }
// Paths are projects/<pid>/<file id>__<safe name>; a path for another project, or any other shape, is refused.
// Media paths are <pid>/<kind>/<key>.<ext> in their own bucket, so they never show in the reference files list.
// Not set up (no secret key, or no bucket yet): 503 with setup ('key' | 'bucket') and the browser says so.
// Uses the same optional team passcode as the notes and projects (FIELD_ACCESS_CODE, header x-field-code).
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { conn as fieldConn } from './field.js';
import { withRoom } from '../lib/openai.mjs';
import { router, chatJSON, wantsClaude } from '../lib/airoute.mjs';
import * as RF from '../lib/sitefiles.mjs';

const B = RF.BUCKET, MAX_FILES = 50, PID = /^[\w-]{3,60}$/;
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const J = { 'Content-Type': 'application/json' };
// renderings, their massing pictures and plan set PDFs, kept for the team (lib/sitefiles.mjs MEDIA)
export function mediaStore(db) {
  const M = RF.MEDIA_BUCKET;
  return {
    signUpload: path => db.json('/storage/v1/object/upload/sign/' + M + '/' + enc(path), { method: 'POST', headers: J, body: '{}' }),
    signGet: path => db.json('/storage/v1/object/sign/' + M + '/' + enc(path), { method: 'POST', headers: J, body: JSON.stringify({ expiresIn: 600 }) }),
    remove: paths => db.call('/storage/v1/object/' + M, { method: 'DELETE', headers: J, body: JSON.stringify({ prefixes: paths }) })
  };
}
export function storage(db) {
  return {
    list: pid => db.json('/storage/v1/object/list/' + B, { method: 'POST', headers: J, body: JSON.stringify({ prefix: 'projects/' + pid + '/', limit: 200, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }) }),
    signUpload: path => db.json('/storage/v1/object/upload/sign/' + B + '/' + enc(path), { method: 'POST', headers: J, body: '{}' }),
    signGet: path => db.json('/storage/v1/object/sign/' + B + '/' + enc(path), { method: 'POST', headers: J, body: JSON.stringify({ expiresIn: 600 }) }),
    get: path => db.call('/storage/v1/object/' + B + '/' + enc(path)),
    remove: paths => db.call('/storage/v1/object/' + B, { method: 'DELETE', headers: J, body: JSON.stringify({ prefixes: paths }) })
  };
}
const noBucket = e => /bucket not found/i.test(e?.message || '');
const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20);

// ---------- the AI reads one file ----------
const { ai } = router(() => process.env.OPENAI_MODEL); // Settings › AI model › Reference files: OpenAI or Claude (lib/airoute.mjs)
const isPdf = b => b.length > 4 && b.slice(0, 5).toString('latin1') === '%PDF-', isPng = b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, isJpg = b => b[0] === 0xff && b[1] === 0xd8;
// what goes to the model for a file: a PDF as the document, a picture as an image, a DXF or text file as its words;
// null when the bytes aren't what the name says
export function contentFor(buf, name) {
  const t = RF.typeOf(name); if (!t || !buf?.length) return null;
  if (t.how === 'pdf') return isPdf(buf) ? { files: [{ filename: RF.safeName(name), data: 'data:application/pdf;base64,' + buf.toString('base64') }], text: '' } : null;
  if (t.how === 'image') return (t.ext === 'png' ? isPng(buf) : isJpg(buf)) ? { images: ['data:' + t.mime + ';base64,' + buf.toString('base64')], text: '' } : null;
  const s = buf.toString('utf8'); if (/\u0000/.test(s.slice(0, 2000))) return null; // a binary DXF, or not text at all
  return { text: t.ext === 'dxf' ? RF.dxfDigest(s) : s.slice(0, 60000) };
}
export async function readFile(buf, name, { key, model = null, provider = null, res = null } = {}) {
  const c = contentFor(buf, name); if (!c) { const e = new Error('That file isn’t a ' + (RF.typeOf(name)?.ext || '').toUpperCase() + ' the AI can read (it may be damaged, or saved in another format).'); e.status = 422; throw e; }
  const user = 'Reference file: ' + clip(name, 120) + ' (' + RF.typeOf(name).how + '). Read it and list its facts.' + (c.text ? '\n\n' + c.text : '');
  const t0 = Date.now(), r = await ai(key, { provider, model }, res, m => withRoom(o => chatJSON({ key, model: m, feature: 'siteplan', system: RF.READ_SYSTEM, user, name: 'reference_facts', schema: RF.READ_SCHEMA, images: c.images || [], files: c.files || [], ...o }), { maxTokens: 16000, effort: 'medium', t0 }));
  return RF.readOut(r.data);
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 40, perDay: 1500 })) return;
  res.setHeader('Cache-Control', 'no-store');
  const code = process.env.FIELD_ACCESS_CODE;
  if (code && String(req.headers['x-field-code'] || '') !== code) return res.status(401).json({ error: 'Enter the team passcode.', passcode: true });
  const db = fieldConn(); if (!db) return res.status(503).json({ error: 'Reference files need SUPABASE_SECRET_KEY on the site (Vercel), so they can be kept in the team’s storage.', setup: 'key' });
  const st = storage(db), b = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})) : {};
  const pid = String((req.method === 'GET' ? req.query?.pid : b.pid) || ''); if (!PID.test(pid)) return res.status(400).json({ error: 'Which project? (pid)' });
  try {
    if (req.method === 'GET' && req.query?.media) {
      const path = RF.mediaPath(pid, req.query.media); if (!path) return res.status(400).json({ error: 'bad media' });
      try { const s = await mediaStore(db).signGet(path); return res.json({ url: db.url + '/storage/v1' + (s.signedURL || s.signedUrl) }); }
      catch (e) { if (/ 40[04] /.test(e.message) && !noBucket(e)) return res.status(404).json({ error: 'Not kept for the team.' }); throw e; }
    }
    if (req.method === 'GET' && req.query?.open) {
      const path = String(req.query.open); if (!RF.parsePath(path, pid)) return res.status(400).json({ error: 'bad path' });
      const s = await st.signGet(path); return res.json({ url: db.url + '/storage/v1' + (s.signedURL || s.signedUrl) });
    }
    if (req.method === 'GET') {
      const rows = await st.list(pid);
      return res.json({ files: (rows || []).filter(r => r.id && r.name).map(r => { const path = 'projects/' + pid + '/' + r.name, pp = RF.parsePath(path, pid); return pp ? { path, id: pp.id, name: pp.name, size: +r.metadata?.size || 0, type: r.metadata?.mimetype || RF.typeOf(pp.name).mime, at: r.created_at || null } : null; }).filter(Boolean) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    if (b.upload) {
      const name = clip(b.upload.name, 200), size = +b.upload.size, t = RF.typeOf(name);
      if (!t) return res.status(400).json({ error: 'Add a PDF, PNG, JPG, DXF or text file.' });
      if (!(size > 0) || size > RF.MAX_BYTES) return res.status(413).json({ error: 'Files can be up to 20 MB.' });
      if ((await st.list(pid) || []).filter(r => r.id).length >= MAX_FILES) return res.status(400).json({ error: 'A project can hold up to ' + MAX_FILES + ' reference files: delete one first.' });
      const id = newId(), path = RF.pathFor(pid, id, name), s = await st.signUpload(path);
      return res.json({ id, path, name: RF.parsePath(path).name, type: t.mime, url: db.url + '/storage/v1' + s.url });
    }
    if (b.media) {
      const path = RF.mediaPath(pid, String(b.media.kind || '') + '/' + String(b.media.key || '')), size = +b.media.size;
      if (!path) return res.status(400).json({ error: 'bad media' });
      if (!(size > 0) || size > RF.MEDIA_MAX) return res.status(413).json({ error: 'Too big to keep for the team (over ' + Math.round(RF.MEDIA_MAX / 2 ** 20) + ' MB).' });
      const s = await mediaStore(db).signUpload(path); return res.json({ path, url: db.url + '/storage/v1' + s.url });
    }
    if (b.unmedia) {
      const paths = (Array.isArray(b.unmedia) ? b.unmedia : [b.unmedia]).map(m => RF.mediaPath(pid, m)).filter(Boolean).slice(0, 100);
      if (paths.length) await mediaStore(db).remove(paths);
      return res.json({ ok: true, removed: paths.length });
    }
    if (b.read) {
      const path = String(b.read.path || ''), pp = RF.parsePath(path, pid); if (!pp) return res.status(400).json({ error: 'bad path' });
      const key = process.env.OPENAI_API_KEY || ''; if (!key && !wantsClaude(b)) return res.status(503).json({ error: 'AI isn’t set up on this site, so the file can’t be read (it’s kept).', ai: false });
      const r = await st.get(path), len = +r.headers.get('content-length') || 0; if (len > RF.MAX_BYTES) return res.status(413).json({ error: 'Files can be up to 20 MB.' });
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > RF.MAX_BYTES) return res.status(413).json({ error: 'Files can be up to 20 MB.' });
      try { return res.json(await readFile(buf, pp.name, { key, model: b.model, provider: b.provider, res })); }
      catch (e) { if (e.status === 422) return res.status(422).json({ error: e.message }); console.error('sitefiles read', e.message); return res.status(502).json({ error: 'The AI couldn’t read this file just now. Try again in a moment.' }); }
    }
    if (b.remove) {
      const paths = (Array.isArray(b.remove) ? b.remove : [b.remove]).map(String).filter(p => RF.parsePath(p, pid)).slice(0, 50);
      if (paths.length) await st.remove(paths);
      return res.json({ ok: true, removed: paths.length });
    }
    return res.status(400).json({ error: 'upload, read or remove' });
  } catch (e) {
    if (noBucket(e)) return res.status(503).json({ error: 'Reference files aren’t set up on this site yet: the site-files storage bucket is missing (run the reference-files migration in Supabase).', setup: 'bucket' });
    console.error('sitefiles', e.message); return res.status(502).json({ error: 'The team’s file storage didn’t answer. Try again in a moment.' });
  }
}
