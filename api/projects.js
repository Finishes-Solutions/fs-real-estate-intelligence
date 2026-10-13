// Team projects and site plans without sign-in, like the field notes: the browser keeps its own copy (src/siteplan.js)
// and syncs through here; this talks to Supabase (site_projects) with the secret key. Last edit wins.
//   GET                                   -> { projects: [doc], deleted: [id] }
//   POST { projects: [doc], deletes: [id], name } -> { ok, saved, skipped }   (a copy older than the team's is skipped)
// Uses the same optional team passcode as the notes (FIELD_ACCESS_CODE, header x-field-code).
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { conn as fieldConn } from './field.js';

const ID = /^[\w-]{3,60}$/, MAX_DOC = 500000;
const iso = v => { const t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : null; };

export function cleanProject(p, name) {
  if (!p || typeof p !== 'object' || !ID.test(String(p.id || ''))) return null;
  const updated = iso(p.updated) || new Date().toISOString(), doc = { ...p, id: String(p.id), name: clip(p.name, 200), updated };
  const json = JSON.stringify(doc); if (json.length > MAX_DOC) return null;
  return { id: doc.id, name: doc.name, doc, deleted: false, updated_by: clip(name || p.by || '', 80) || null, updated_at: updated };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 60, perDay: 3000 })) return;
  res.setHeader('Cache-Control', 'no-store');
  const code = process.env.FIELD_ACCESS_CODE;
  if (code && String(req.headers['x-field-code'] || '') !== code) return res.status(401).json({ error: 'Enter the team passcode.', passcode: true });
  const db = fieldConn(); if (!db) return res.status(503).json({ error: 'Team sharing needs SUPABASE_SECRET_KEY on the site.', local: true });
  const missing = e => /PGRST205|42P01|site_projects/.test(e.message) && /404|does not exist|Could not find/i.test(e.message);
  try {
    if (req.method === 'GET') {
      const rows = await db.json('/rest/v1/site_projects?select=id,doc,deleted,updated_at&order=updated_at.desc&limit=500');
      return res.json({ projects: rows.filter(r => !r.deleted).map(r => r.doc), deleted: rows.filter(r => r.deleted).map(r => r.id) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}), name = clip(b.name, 80).trim();
    const rows = (Array.isArray(b.projects) ? b.projects : []).slice(0, 100).map(p => cleanProject(p, name)).filter(Boolean);
    const dels = (Array.isArray(b.deletes) ? b.deletes : []).map(String).filter(id => ID.test(id)).slice(0, 200);
    const ids = [...new Set(rows.map(r => r.id).concat(dels))];
    // last edit wins: don't let an older copy from an offline device overwrite a newer one
    const have = ids.length ? await db.json('/rest/v1/site_projects?select=id,updated_at&id=in.(' + ids.map(i => '"' + i + '"').join(',') + ')') : [];
    const newer = new Map(have.map(r => [r.id, Date.parse(r.updated_at)]));
    const save = rows.filter(r => !(newer.get(r.id) > Date.parse(r.updated_at)));
    const tomb = dels.map(id => ({ id, name: '', doc: { id, deleted: true }, deleted: true, updated_by: name || null, updated_at: new Date().toISOString() }));
    if (save.length || tomb.length) await db.call('/rest/v1/site_projects?on_conflict=id', { method: 'POST', body: JSON.stringify([...save, ...tomb]), headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
    return res.json({ ok: true, saved: save.length, skipped: rows.length - save.length, deleted: tomb.length });
  } catch (e) {
    if (missing(e)) return res.status(503).json({ error: 'Team sharing for projects isn’t set up yet (the site_projects table is missing).', local: true });
    console.error('projects', e.message); return res.status(502).json({ error: 'The team database didn’t answer. Your changes are kept on this device and will retry.' });
  }
}
