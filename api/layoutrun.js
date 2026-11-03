// Reproducible layout runs for the website and other callers (the same code as the MCP layout tools,
// lib/mcp/layoutrun.mjs). Pure computation: no AI, no network, no secrets.
//   POST { mode: 'run', brief } | { mode: 'run', request, ring_ft | geojson, front_edge?, ... } -> run record
//   POST { mode: 'replay', record }                     -> { identical, diffs, record }
//   POST { mode: 'edit', record, words? | edits?, selection?, option? } -> { ok, record?, conflicts, interpreted, comparisons }
//   POST { mode: 'undo', record }                       -> { ok, record }
//   POST { mode: 'caps' }                               -> { caps }
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import * as ED from '../lib/layoutedit.mjs';
import { capsTable } from '../lib/layoutcaps.mjs';
import { briefFromArgs } from '../lib/mcp/layoutrun.mjs';
import { UserError } from '../lib/mcp/resolve.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 20, perDay: 600 })) return;
  let b; try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { return res.status(400).json({ error: 'Body is not JSON' }); }
  try {
    if (b.mode === 'caps') return res.json({ caps: capsTable() });
    if (b.mode === 'replay') { const r = RUN.replayRun(b.record); return res.json({ identical: r.identical, diffs: r.diffs, record: r.record }); }
    if (b.mode === 'edit') {
      const parsed = b.edits ? { edits: b.edits, unclear: [] } : ED.editFromWords(b.words || '', { selection: b.selection || [] });
      const bad = parsed.edits.map(e => ED.validateEdit(e)).find(v => !v.ok); if (bad) return res.status(400).json({ error: bad.errors.join('; ') });
      if (!parsed.edits.length) return res.json({ ok: false, conflicts: parsed.unclear.length ? parsed.unclear : ['No edit understood.'], edits: [] });
      const r = ED.applyEdits(b.record, parsed.edits, { at: +b.option || 1 }); return res.json({ ...r, edits: parsed.edits, unclear: parsed.unclear });
    }
    if (b.mode === 'undo') return res.json(ED.undo(b.record));
    return res.json(RUN.runBrief(briefFromArgs(b)));
  } catch (e) { return res.status(e instanceof UserError ? 400 : 500).json({ error: String(e?.message || e).slice(0, 300) }); }
}
