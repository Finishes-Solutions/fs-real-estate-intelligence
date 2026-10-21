// A project's reference files (a survey, existing floor plans, an earlier site plan…), kept in a private Supabase
// storage bucket (site-files) through the secret key, like the field photos (api/field.js), and read by the AI into
// facts (lib/sitefiles.mjs). The file itself goes from the browser straight to storage on a one-time signed link, so
// a 20 MB survey never passes through this function's request body; this function lists, links, reads and deletes.
//   GET  ?pid=<project>                          -> { files: [{ path, id, name, size, type, at }] }
//   GET  ?pid=<project>&open=<path>               -> { url }  a link to the file, good for ten minutes
//   POST { pid, upload: { name, size } }          -> { id, path, url }  a one-time link to PUT the file to
//   POST { pid, read: { path } }                  -> { read: { kind, title, readable, unreadable, summary }, facts: [...] }
//   POST { pid, remove: [path] }                  -> { ok, removed }
// Paths are projects/<pid>/<file id>__<safe name>; a path for another project, or any other shape, is refused.
// Not set up (no secret key, or no bucket yet): 503 with setup ('key' | 'bucket') and the browser says so.
// Uses the same optional team passcode as the notes and projects (FIELD_ACCESS_CODE, header x-field-code).
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { conn as fieldConn } from './field.js';
import { chatJSON, pickModel, withModel, withRoom } from '../lib/openai.mjs';
import * as RF from '../lib/sitefiles.mjs';

const B = RF.BUCKET, MAX_FILES = 50, PID = /^[\w-]{3,60}$/;
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const J = { 'Content-Type': 'application/json' };
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
let modelP = null;
const model0 = key => (modelP ||= pickModel(key, process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));
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
export async function readFile(buf, name, { key, model = null, res = null } = {}) {
  const c = contentFor(buf, name); if (!c) { const e = new Error('That file isn’t a ' + (RF.typeOf(name)?.ext || '').toUpperCase() + ' the AI can read (it may be damaged, or saved in another format).'); e.status = 422; throw e; }
  const user = 'Reference file: ' + clip(name, 120) + ' (' + RF.typeOf(name).how + '). Read it and list its facts.' + (c.text ? '\n\n' + c.text : '');
  const t0 = Date.now(), r = await withModel(key, typeof model === 'string' ? model : null, () => model0(key), m => withRoom(o => chatJSON({ key, model: m, feature: 'siteplan', system: RF.READ_SYSTEM, user, name: 'reference_facts', schema: RF.READ_SCHEMA, images: c.images || [], files: c.files || [], ...o }), { maxTokens: 16000, effort: 'medium', t0 }), m => res?.setHeader?.('X-AI-Model', m));
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
    if (b.read) {
      const path = String(b.read.path || ''), pp = RF.parsePath(path, pid); if (!pp) return res.status(400).json({ error: 'bad path' });
      const key = process.env.OPENAI_API_KEY; if (!key) return res.status(503).json({ error: 'AI isn’t set up on this site, so the file can’t be read (it’s kept).', ai: false });
      const r = await st.get(path), len = +r.headers.get('content-length') || 0; if (len > RF.MAX_BYTES) return res.status(413).json({ error: 'Files can be up to 20 MB.' });
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > RF.MAX_BYTES) return res.status(413).json({ error: 'Files can be up to 20 MB.' });
      try { return res.json(await readFile(buf, pp.name, { key, model: b.model, res })); }
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
