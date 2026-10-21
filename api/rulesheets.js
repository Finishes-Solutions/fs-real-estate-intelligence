// The team's street rule sheets: one per jurisdiction (a city, a county, a city's ETJ in a county, a drainage district),
// the AI's reading of its subdivision and drainage rules with a source for each value and what people confirmed or edited
// (lib/rulesheet.mjs), so the second site in Waller County doesn't look the rules up again. Like the building library
// (api/buildingtypes.js): the browser keeps its own copy and syncs through here; this talks to Supabase (site_rule_sheets)
// with the secret key. Last edit wins; a deleted sheet stays as a tombstone.
//   GET                                          -> { sheets: [doc], deleted: [key] }
//   POST { sheets: [doc], deletes: [key], name } -> { ok, saved, skipped, deleted }   (a copy older than the team's is skipped)
// Uses the same optional team passcode (FIELD_ACCESS_CODE, header x-field-code). No table yet (404 / 42P01): 503 with
// local: true, and the browser keeps its sheets on the device.
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { conn as fieldConn } from './field.js';
import { sheetIn } from '../lib/rulesheet.mjs';

const KEY = /^[a-z0-9:|_-]{3,120}$/, MAX_DOC = 60000;

// a sheet as a row: cleaned (lib/rulesheet.mjs sheetIn), who saved it last and when
export function cleanSheet(s, name) {
  const doc = sheetIn(s); if (!doc) return null;
  if (name && !doc.by) doc.by = clip(name, 80);
  if (JSON.stringify(doc).length > MAX_DOC) return null;
  return { key: doc.key, name: doc.name, doc, deleted: false, updated_by: clip(name || doc.by || '', 80) || null, updated_at: doc.updated };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 60, perDay: 3000 })) return;
  res.setHeader('Cache-Control', 'no-store');
  const code = process.env.FIELD_ACCESS_CODE;
  if (code && String(req.headers['x-field-code'] || '') !== code) return res.status(401).json({ error: 'Enter the team passcode.', passcode: true });
  const db = fieldConn(); if (!db) return res.status(503).json({ error: 'The team rule sheets need SUPABASE_SECRET_KEY on the site.', local: true });
  const missing = e => /PGRST205|42P01|site_rule_sheets/.test(e.message) && /404|does not exist|Could not find/i.test(e.message);
  try {
    if (req.method === 'GET') {
      const rows = await db.json('/rest/v1/site_rule_sheets?select=key,doc,deleted,updated_by,updated_at&order=updated_at.desc&limit=500');
      return res.json({ sheets: rows.filter(r => !r.deleted).map(r => ({ ...r.doc, by: r.doc?.by || r.updated_by || '' })), deleted: rows.filter(r => r.deleted).map(r => r.key) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}), name = clip(b.name, 80).trim();
    const rows = (Array.isArray(b.sheets) ? b.sheets : []).slice(0, 50).map(s => cleanSheet(s, name)).filter(Boolean);
    const dels = (Array.isArray(b.deletes) ? b.deletes : []).map(String).filter(k => KEY.test(k)).slice(0, 100);
    const keys = [...new Set(rows.map(r => r.key).concat(dels))];
    // last edit wins: an older copy from an offline device doesn't overwrite a newer one (a value confirmed on another device)
    const have = keys.length ? await db.json('/rest/v1/site_rule_sheets?select=key,updated_at&key=in.(' + keys.map(k => '"' + k + '"').join(',') + ')') : [];
    const newer = new Map(have.map(r => [r.key, Date.parse(r.updated_at)]));
    const save = rows.filter(r => !(newer.get(r.key) > Date.parse(r.updated_at)));
    const tomb = dels.map(key => ({ key, name: '', doc: { key, deleted: true }, deleted: true, updated_by: name || null, updated_at: new Date().toISOString() }));
    if (save.length || tomb.length) await db.call('/rest/v1/site_rule_sheets?on_conflict=key', { method: 'POST', body: JSON.stringify([...save, ...tomb]), headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' } });
    return res.json({ ok: true, saved: save.length, skipped: rows.length - save.length, deleted: tomb.length });
  } catch (e) {
    if (missing(e)) return res.status(503).json({ error: 'The team rule sheets aren’t set up yet (the site_rule_sheets table is missing).', local: true });
    console.error('rulesheets', e.message); return res.status(502).json({ error: 'The team database didn’t answer. Your rule sheets are kept on this device and will retry.' });
  }
}
