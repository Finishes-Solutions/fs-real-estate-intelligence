// AI enrichment: classify each filing (use, tenant, developer, design team, units, one-line summary).
// Results are cached by ProjectNumber + a hash of the text sent, so each filing is processed once
// unless its TABS record changes. Filings are sent in chunks to amortize the instructions.
import { pool, log, hash } from './util.mjs';
import { chatJSON, pickModel } from '../lib/openai.mjs';
import { SCHEMA, SYSTEM, CHUNK } from '../lib/enrich-spec.mjs';
import { canMintToken, idToken } from '../lib/oidc.mjs';

const inputOf = r => ({ id: r.ProjectNumber, name: r.ProjectName || '', facility: r.facility || '', tenant: r.tenant || '', owner: r.owner || '', design: r.design || '',
  type: r.TypeOfWork, cost: r.EstimatedCost || 0, sqft: r.sqft || '', scope: (r.scope || '').slice(0, 700) });
export const aiKey = r => r.ProjectNumber + ':' + hash(JSON.stringify(inputOf(r)));

// onSave (optional): called with { key: fields } after each answered chunk, so long runs persist progress.
export async function enrich(rows, cache, { onSave } = {}) {
  const key = process.env.OPENAI_API_KEY, proxy = !key && process.env.AI_PROXY_URL && canMintToken() ? process.env.AI_PROXY_URL : null;
  const todo = rows.filter(r => !cache[aiKey(r)]);
  const max = +(process.env.AI_MAX_ROWS || 40000);
  if (!key && !proxy) { log('enrich: OPENAI_API_KEY not set (and no AI_PROXY_URL), skipping', todo.length, 'filings'); return; }
  if (!todo.length) { log('enrich: all', rows.length, 'cached'); return; }
  const model = proxy ? 'site proxy ' + proxy : await pickModel(key, process.env.OPENAI_ENRICH_MODEL || process.env.OPENAI_MODEL);
  // through the site's /api/pipeline-ai (it holds the OpenAI key; this workflow proves itself with its GitHub OIDC token)
  const viaProxy = async items => {
    for (let i = 0; ; i++) {
      const r = await fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-github-oidc': await idToken() }, body: JSON.stringify({ items }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return d;
      if (r.status === 401 || r.status === 403 || i >= 3) throw new Error('AI proxy ' + r.status + ': ' + (d.error || ''));
      await new Promise(res => setTimeout(res, 3000 * (i + 1)));
    }
  };
  const batch = todo.slice(0, max), chunks = [];
  for (let i = 0; i < batch.length; i += CHUNK) chunks.push(batch.slice(i, i + CHUNK));
  log('enrich: model', model, '| cached', rows.length - todo.length, '| sending', batch.length, 'in', chunks.length, 'requests');
  let tin = 0, tout = 0, failed = 0, done = 0;
  const stamp = new Date().toISOString().slice(0, 10);
  await pool(chunks, +(process.env.AI_CONCURRENCY || 6), async ch => {
    try {
      const { data, usage } = proxy ? await viaProxy(ch.map(inputOf))
        : await chatJSON({ key, model, system: SYSTEM, user: JSON.stringify(ch.map(inputOf)), name: 'filings', schema: SCHEMA, maxTokens: 24000 });
      tin += usage?.prompt_tokens || 0; tout += usage?.completion_tokens || 0;
      const byId = Object.fromEntries((data.items || []).map(x => [x.id, x]));
      const got = {};
      for (const r of ch) { const x = byId[r.ProjectNumber]; if (!x) { failed++; continue; } const { id, ...v } = x; got[aiKey(r)] = cache[aiKey(r)] = { ...v, at: stamp }; }
      if (onSave) await onSave(got);
    } catch (e) { failed += ch.length; log('enrich chunk failed:', e.message); if (/401|403/.test(e.message)) throw e; }
    if (++done % 50 === 0) log('enrich progress', done, '/', chunks.length);
  });
  log('enrich: done, failed', failed, '| tokens in', tin, 'out', tout);
  return { tokensIn: tin, tokensOut: tout, failed, sent: batch.length };
}

export function aiFields(r, cache) { return cache[aiKey(r)] || null; }
