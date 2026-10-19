// The team's building library: building types saved from site plans (an AI-crafted type with its recipe, a building
// sized by hand) that everyone on the team sees under From the building library, as the Team group, and that the AI
// can reuse. Like the team projects (api/projects.js): the browser keeps its own copy and syncs through here; this
// talks to Supabase (site_building_types) with the secret key. Last edit wins; a deleted type stays as a tombstone.
//   GET                                       -> { types: [doc], deleted: [id] }
//   POST { types: [doc], deletes: [id], name } -> { ok, saved, skipped, deleted }   (a copy older than the team's is skipped)
// Uses the same optional team passcode as the notes and projects (FIELD_ACCESS_CODE, header x-field-code). No table yet
// (404 / 42P01): 503 with local: true, and the browser keeps its types on the device.
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { conn as fieldConn } from './field.js';
import { teamTypeIn } from '../lib/customtypes.mjs';

const ID = /^[\w-]{3,60}$/, MAX_DOC = 60000;

// a saved type as a row: the type cleaned (lib/customtypes.mjs teamTypeIn), who saved it last and when
export function cleanType(t, name) {
  const doc = teamTypeIn(t); if (!doc) return null;
  if (name && !doc.by) doc.by = clip(name, 80);
  if (JSON.stringify(doc).length > MAX_DOC) return null;
  return { id: doc.id, name: doc.name, doc, deleted: false, updated_by: clip(name || doc.by || '', 80) || null, updated_at: doc.updated };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 60, perDay: 3000 })) return;
  res.setHeader('Cache-Control', 'no-store');
  const code = process.env.FIELD_ACCESS_CODE;
  if (code && String(req.headers['x-field-code'] || '') !== code) return res.status(401).json({ error: 'Enter the team passcode.', passcode: true });
  const db = fieldConn(); if (!db) return res.status(503).json({ error: 'The team library needs SUPABASE_SECRET_KEY on the site.', local: true });
  const missing = e => /PGRST205|42P01|site_building_types/.test(e.message) && /404|does not exist|Could not find/i.test(e.message);
  try {
    if (req.method === 'GET') {
      const rows = await db.json('/rest/v1/site_building_types?select=id,doc,deleted,updated_by,updated_at&order=updated_at.desc&limit=500');
      return res.json({ types: rows.filter(r => !r.deleted).map(r => ({ ...r.doc, by: r.doc?.by || r.updated_by || '' })), deleted: rows.filter(r => r.deleted).map(r => r.id) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}), name = clip(b.name, 80).trim();
    const rows = (Array.isArray(b.types) ? b.types : []).slice(0, 100).map(t => cleanType(t, name)).filter(Boolean);
    const dels = (Array.isArray(b.deletes) ? b.deletes : []).map(String).filter(id => ID.test(id)).slice(0, 200);
    const ids = [...new Set(rows.map(r => r.id).concat(dels))];
    // last edit wins: an older copy from an offline device doesn't overwrite a newer one (a rename on another device)
    const have = ids.length ? await db.json('/rest/v1/site_building_types?select=id,updated_at&id=in.(' + ids.map(i => '"' + i + '"').join(',') + ')') : [];
    const newer = new Map(have.map(r => [r.id, Date.parse(r.updated_at)]));
    const save = rows.filter(r => !(newer.get(r.id) > Date.parse(r.updated_at)));
    const tomb = dels.map(id => ({ id, name: '', doc: { id, deleted: true }, deleted: true, updated_by: name || null, updated_at: new Date().toISOString() }));
    if (save.length || tomb.length) await db.call('/rest/v1/site_building_types?on_conflict=id', { method: 'POST', body: JSON.stringify([...save, ...tomb]), headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
    return res.json({ ok: true, saved: save.length, skipped: rows.length - save.length, deleted: tomb.length });
  } catch (e) {
    if (missing(e)) return res.status(503).json({ error: 'The team library isn’t set up yet (the site_building_types table is missing).', local: true });
    console.error('buildingtypes', e.message); return res.status(502).json({ error: 'The team database didn’t answer. Your types are kept on this device and will retry.' });
  }
}
