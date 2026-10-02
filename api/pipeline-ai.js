// AI tagging for the GitHub Actions data workflow, using this site's OpenAI key so the key lives only in Vercel.
// Only the workflow can call it: it must send a GitHub OIDC token issued to this repository (verified here).
// POST { items: [filing inputs] } -> { data: { items: [...] }, usage }
import { chatJSON, pickModel } from '../lib/openai.mjs';
import { SCHEMA, SYSTEM, CHUNK } from '../lib/enrich-spec.mjs';
import { verifyGitHub } from '../lib/oidc.mjs';
import { needKey } from './_lib/guard.mjs';

let modelP = null;
const model = key => (modelP ||= pickModel(key, process.env.OPENAI_ENRICH_MODEL || process.env.OPENAI_MODEL).catch(e => { modelP = null; throw e; }));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try { await verifyGitHub(req.headers['x-github-oidc']); } catch (e) { return res.status(401).json({ error: 'unauthorized: ' + e.message }); }
  const key = needKey(res); if (!key) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const items = Array.isArray(body.items) ? body.items.slice(0, CHUNK + 5) : [];
  if (!items.length) return res.status(400).json({ error: 'items required' });
  try {
    const r = await chatJSON({ key, model: await model(key), system: SYSTEM, user: JSON.stringify(items).slice(0, 60000), name: 'filings', schema: SCHEMA, maxTokens: 24000 });
    return res.json({ data: r.data, usage: r.usage });
  } catch (e) {
    console.error('pipeline-ai failed', e.message);
    return res.status(502).json({ error: e.message.slice(0, 300) });
  }
}
