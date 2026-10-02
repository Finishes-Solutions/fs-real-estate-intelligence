// AI enrichment: classify each filing (use, tenant, developer, design team, units, one-line summary).
// Results are cached by ProjectNumber + a hash of the text sent, so each filing is processed once
// unless its TABS record changes. Filings are sent in chunks to amortize the instructions.
import { pool, log, hash } from './util.mjs';
import { chatJSON, pickModel } from '../lib/openai.mjs';
import { USES } from '../lib/taxonomy.mjs';

const CHUNK = 15;
const str = { type: 'string' };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'use', 'subtype', 'tenant', 'developer', 'architect', 'gc', 'units', 'summary'],
    properties: {
      id: str,
      use: { type: 'string', enum: USES },
      subtype: { type: 'string', description: 'Short specific type, e.g. "urgent care", "QSR with drive-thru", "Class A office", "tilt-wall warehouse". Empty if unclear.' },
      tenant: { type: 'string', description: 'Brand, tenant or operator named in the filing (e.g. "H-E-B", "Chick-fil-A", "Memorial Hermann"). Empty if none.' },
      developer: { type: 'string', description: 'Owner/developer organization in clean title case without LLC/Inc suffixes. Empty if only an individual or unknown.' },
      architect: { type: 'string', description: 'Design / architecture firm if named. Empty otherwise.' },
      gc: { type: 'string', description: 'General contractor if named. Empty otherwise.' },
      units: { type: ['integer', 'null'], description: 'Residential units / beds / keys if stated, else null.' },
      summary: { type: 'string', description: 'One plain sentence (max 140 characters) on what is being built.' }
    } } } }
};
const SYSTEM = `You classify Texas TDLR accessibility (TABS) construction registrations for a real estate developer's market-intelligence map.
For every filing in the input, return exactly one item with the same id. Use only facts in the filing text; never guess names that are not present.
"use" is the primary real estate use. Owners that are cities, counties, ISDs or the state are Government or Education. Apartments and build-to-rent are Multifamily.`;

const inputOf = r => ({ id: r.ProjectNumber, name: r.ProjectName || '', facility: r.facility || '', tenant: r.tenant || '', owner: r.owner || '', design: r.design || '',
  type: r.TypeOfWork, cost: r.EstimatedCost || 0, sqft: r.sqft || '', scope: (r.scope || '').slice(0, 700) });
export const aiKey = r => r.ProjectNumber + ':' + hash(JSON.stringify(inputOf(r)));

export async function enrich(rows, cache) {
  const key = process.env.OPENAI_API_KEY;
  const todo = rows.filter(r => !cache[aiKey(r)]);
  const max = +(process.env.AI_MAX_ROWS || 40000);
  if (!key) { log('enrich: OPENAI_API_KEY not set, skipping', todo.length, 'filings'); return; }
  if (!todo.length) { log('enrich: all', rows.length, 'cached'); return; }
  const model = await pickModel(key, process.env.OPENAI_ENRICH_MODEL || process.env.OPENAI_MODEL);
  const batch = todo.slice(0, max), chunks = [];
  for (let i = 0; i < batch.length; i += CHUNK) chunks.push(batch.slice(i, i + CHUNK));
  log('enrich: model', model, '| cached', rows.length - todo.length, '| sending', batch.length, 'in', chunks.length, 'requests');
  let tin = 0, tout = 0, failed = 0, done = 0;
  const stamp = new Date().toISOString().slice(0, 10);
  await pool(chunks, +(process.env.AI_CONCURRENCY || 6), async ch => {
    try {
      const { data, usage } = await chatJSON({ key, model, system: SYSTEM, user: JSON.stringify(ch.map(inputOf)), name: 'filings', schema: SCHEMA, maxTokens: 8000 });
      tin += usage?.prompt_tokens || 0; tout += usage?.completion_tokens || 0;
      const byId = Object.fromEntries((data.items || []).map(x => [x.id, x]));
      for (const r of ch) { const x = byId[r.ProjectNumber]; if (!x) { failed++; continue; } const { id, ...v } = x; cache[aiKey(r)] = { ...v, at: stamp }; }
    } catch (e) { failed += ch.length; log('enrich chunk failed:', e.message); if (/401/.test(e.message)) throw e; }
    if (++done % 50 === 0) log('enrich progress', done, '/', chunks.length);
  });
  log('enrich: done, failed', failed, '| tokens in', tin, 'out', tout);
}

export function aiFields(r, cache) { return cache[aiKey(r)] || null; }
