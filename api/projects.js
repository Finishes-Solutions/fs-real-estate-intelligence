// Team projects and site plans without sign-in, like the field notes: the browser keeps its own copy (src/siteplan.js)
// and syncs through here; this talks to Supabase (site_projects) with the secret key. Last edit wins.
//   GET ?index=1                          -> { index: [{ id, updated, deleted }] }
//   GET ?ids=a,b                          -> { projects: [doc], more: [id] }   (more: didn't fit in this answer)
//   GET                                   -> { projects: [doc], deleted: [id] }   (the old answer: 413 when too big)
//   POST { projects: [doc], deletes: [id], name } -> { ok, saved, skipped, savedIds, newerIds, tooBig }   (a copy older than the team's is skipped)
// Uses the same optional team passcode as the notes (FIELD_ACCESS_CODE, header x-field-code).
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { conn as fieldConn } from './field.js';
import { storage } from './_lib/storage.mjs';
import * as RF from '../lib/sitefiles.mjs';

const ID = /^[\w-]{3,60}$/;
// A project up to FULL characters is kept whole. Up to INLINE it sits in the row itself (the table allows about 600 KB
// a row); bigger, the whole document goes to the private project-media bucket at <id>/doc/project.json and the row
// keeps a small summary marked `big` (what lists and searches read). Requests and answers stay under Vercel's 4.5 MB.
export const INLINE = 450000, FULL = 4000000, ANSWER = 3500000;
const MAX_DOC = FULL;
const iso = v => { const t = Date.parse(v); return isFinite(t) ? new Date(t).toISOString() : null; };
// each version of a big project is its own file (so a save that loses a race never changes the copy the row points to)
export const docPath = (id, updated) => id + '/doc/' + String(Date.parse(updated) || Date.now()) + '.json';

export function cleanProject(p, name) {
  if (!p || typeof p !== 'object' || !ID.test(String(p.id || ''))) return null;
  const updated = iso(p.updated) || new Date().toISOString(), doc = { ...p, id: String(p.id), name: clip(p.name, 200), updated };
  delete doc.big; // (a summary is never saved over a whole project)
  const json = JSON.stringify(doc); if (json.length > MAX_DOC) return null;
  return { id: doc.id, name: doc.name, doc, deleted: false, updated_by: clip(name || p.by || '', 80) || null, updated_at: updated, size: json.length };
}
// what the row keeps of a project too big for it: the fields lists, searches and the MCP tools read
export function summary(doc, size) {
  const parcels = (doc.parcels || []).map(x => ({ label: x?.label, county: x?.county, key: x?.key }));
  return { id: doc.id, name: doc.name, updated: doc.updated, by: doc.by, status: doc.status, client: doc.client, notes: clip(doc.notes || '', 4000), parcels, big: { size, path: docPath(doc.id, doc.updated) } };
}
// rows ready for the table: a big project's whole document written to the bucket first
export async function stow(db, row) {
  if (!row || row.deleted || row.size <= INLINE) { const { size, ...r } = row || {}; return row ? r : row; }
  await storage(db, RF.MEDIA_BUCKET).put(docPath(row.id, row.doc.updated), JSON.stringify(row.doc), 'application/json');
  const { size, ...r } = row; return { ...r, doc: summary(row.doc, size) };
}
// a row's whole project: the bucket's copy when the row holds only the summary
export async function wholeDoc(db, doc) {
  if (!doc?.big) return doc;
  const r = await storage(db, RF.MEDIA_BUCKET).get(doc.big.path || docPath(doc.id, doc.updated)); return JSON.parse(await r.text());
}
// after a save: the older versions' files go, the newest two kept (one may still be being read)
export async function tidy(db, id) {
  const st = storage(db, RF.MEDIA_BUCKET), files = (await st.list(id + '/doc/')) || [];
  const old = files.map(f => f.name).filter(n => /^\d+\.json$/.test(n)).sort((a, b) => parseInt(b) - parseInt(a)).slice(2);
  if (old.length) await st.remove(old.map(n => id + '/doc/' + n));
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
      const q = req.query || {};
      // ?index=1: every project's id and when it last changed (the browser then asks for the ones it hasn't got)
      if (q.index) { const rows = await db.json('/rest/v1/site_projects?select=id,deleted,updated_at&order=updated_at.desc&limit=5000');
        return res.json({ index: rows.map(r => ({ id: r.id, updated: r.updated_at, deleted: !!r.deleted })) }); }
      // ?ids=a,b: those projects whole, as many as fit in one answer; the rest are named in `more` to ask for again
      if (q.ids) { const ids = [...new Set(String(q.ids).split(',').filter(i => ID.test(i)))].slice(0, 50);
        const rows = ids.length ? await db.json('/rest/v1/site_projects?select=id,doc,deleted,updated_at&id=in.(' + ids.map(i => '"' + i + '"').join(',') + ')') : [];
        const projects = [], more = []; let used = 0;
        for (const r of rows) { if (r.deleted) continue; if (used && used > ANSWER) { more.push(r.id); continue; }
          let d; try { d = await wholeDoc(db, r.doc); } catch (e) { console.error('projects doc', r.id, e.message); continue; }
          const n = JSON.stringify(d).length; if (used && used + n > ANSWER) { more.push(r.id); continue; } used += n; projects.push(d); }
        return res.json({ projects, more }); }
      // (the old answer, for pages still open on the earlier version: everything, whole; refused rather than cut short)
      const rows = await db.json('/rest/v1/site_projects?select=id,doc,deleted,updated_at&order=updated_at.desc&limit=500');
      const projects = []; let used = 0;
      for (const r of rows) { if (r.deleted) continue; const d = await wholeDoc(db, r.doc); used += JSON.stringify(d).length; if (used > ANSWER) return res.status(413).json({ error: 'Reload the page to get the latest version.' }); projects.push(d); }
      return res.json({ projects, deleted: rows.filter(r => r.deleted).map(r => r.id) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}), name = clip(b.name, 80).trim();
    const sent = (Array.isArray(b.projects) ? b.projects : []).slice(0, 100), rows = sent.map(p => cleanProject(p, name)).filter(Boolean);
    const tooBig = sent.filter(p => ID.test(String(p?.id || '')) && !rows.some(r => r.id === String(p.id))).map(p => String(p.id));
    const dels = (Array.isArray(b.deletes) ? b.deletes : []).map(String).filter(id => ID.test(id)).slice(0, 200);
    const ids = [...new Set(rows.map(r => r.id).concat(dels))];
    // last edit wins: don't let an older copy from an offline device overwrite a newer one
    const have = ids.length ? await db.json('/rest/v1/site_projects?select=id,updated_at&id=in.(' + ids.map(i => '"' + i + '"').join(',') + ')') : [];
    const newer = new Map(have.map(r => [r.id, Date.parse(r.updated_at)]));
    const save = rows.filter(r => !(newer.get(r.id) > Date.parse(r.updated_at)));
    const tomb = dels.map(id => ({ id, name: '', doc: { id, deleted: true }, deleted: true, updated_by: name || null, updated_at: new Date().toISOString() }));
    const put = []; for (const r of save) put.push(await stow(db, r));
    if (put.length || tomb.length) await db.call('/rest/v1/site_projects?on_conflict=id', { method: 'POST', body: JSON.stringify([...put, ...tomb]), headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
    for (const r of put) if (r.doc.big) await tidy(db, r.id).catch(() => {});
    for (const t of tomb) await storage(db, RF.MEDIA_BUCKET).list(t.id + '/doc/').then(f => f?.length && storage(db, RF.MEDIA_BUCKET).remove(f.map(x => t.id + '/doc/' + x.name))).catch(() => {}); // (a big project's whole copies go with it)
    // savedIds: in the team's copy now; newerIds: the team has a newer copy (this one wasn't saved); tooBig: over FULL
    return res.json({ ok: true, saved: save.length, skipped: rows.length - save.length, deleted: tomb.length, savedIds: save.map(r => r.id), newerIds: rows.filter(r => !save.includes(r)).map(r => r.id), tooBig });
  } catch (e) {
    if (missing(e)) return res.status(503).json({ error: 'Team sharing for projects isn’t set up yet (the site_projects table is missing).', local: true });
    console.error('projects', e.message); return res.status(502).json({ error: 'The team database didn’t answer. Your changes are kept on this device and will retry.' });
  }
}
