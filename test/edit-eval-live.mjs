// Manual check of the AI's reading of EDIT requests: the edit corpus (test/fixtures/edit-corpus.mjs) said through the MCP's
// plan_edit with the AI on (the app's Change With AI step, api/siteplan.js mode 'edit', the same instructions and schema
// the app uses, and the same reading of the words before and after it: lib/editread.mjs), each edited plan scored by
// scripts/edit-corpus.mjs on its own geometry. Not part of `npm test` (it needs a key and costs a little).
//   node test/edit-eval-live.mjs --env ../.env.local [--only E01,E1] [--cat vague] [--fresh] [--par 4] [--json out.json] [--out table.md] [--png dir --tag live]
//   ANTHROPIC_API_KEY=… node test/edit-eval-live.mjs --provider anthropic [--model claude-…]
// The keys are read from the env file into this process only (never printed or written); database variables are dropped.
import fs from 'node:fs';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (arg('--env')) for (const line of fs.readFileSync(arg('--env'), 'utf8').split(/\r?\n/)) { const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); }
for (const k of Object.keys(process.env)) if (/^SUPABASE|^NEXT_PUBLIC_SUPABASE/.test(k)) delete process.env[k]; // (no usage rows written from an eval)
const provider = arg('--provider') || (process.env.OPENAI_API_KEY ? 'openai' : 'anthropic');
if (provider === 'openai' && !process.env.OPENAI_API_KEY) { console.error('Set OPENAI_API_KEY (or ANTHROPIC_API_KEY with --provider anthropic) to run the live eval.'); process.exit(1); }
if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY to run the live eval with Claude.'); process.exit(1); }
if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'unused';
// the tokens each answer used, read off the provider's replies (a cost estimate; nothing recorded anywhere)
const used = { in: 0, out: 0, n: 0 }, fetch0 = globalThis.fetch;
globalThis.fetch = async (...a) => { const r = await fetch0(...a); try { const j = await r.clone().json(), u = j?.usage; if (u) { used.n++; used.in += +(u.prompt_tokens ?? u.input_tokens ?? 0); used.out += +(u.completion_tokens ?? u.output_tokens ?? 0); } } catch { /* not JSON */ } return r; };
const { siteAI } = await import('../api/siteplan.js');
const EC = await import('../scripts/edit-corpus.mjs');

const only = arg('--only'), cat = arg('--cat'), model = arg('--model') || null, PNG = arg('--png');
const LIST = EC.pickSet(process.argv).filter(c => (!only || only.split(',').some(x => c.id.startsWith(x))) && (!cat || c.cat === cat)).slice(0, +arg('--max') || 1000);
const bases = await EC.baseRecords([...new Set(LIST.map(c => c.base))]), env = await EC.setup(), ROWS = new Array(LIST.length), drawn = [];
let calls = 0, models = new Set(), next = 0;
const ai = async b => { calls++; const r = await siteAI({ ...b, ...(provider === 'anthropic' ? { provider: 'anthropic' } : {}), ...(model ? { model } : {}) }); if (r.model) models.add(r.model); return r; };
// one at a time inside the plan store (plan_edit reads and writes it), the model's answers awaited a few at a time
async function one(c, k) {
  const t0 = Date.now(), r = await EC.runEdit(env, c, bases, { ai }), row = EC.scoreEdit(c, r.base, r.after, r.text); ROWS[k] = row;
  console.log((row.ok ? 'ok   ' : 'MISS ') + c.id.padEnd(4), (Date.now() - t0 + 'ms').padStart(7), c.ask.slice(0, 70), row.ok ? '' : '\n       ' + row.outcome.filter(x => !x.ok).map(x => x.name + ' → ' + x.got).join(' | ') + (row.honest ? '' : '  [not said]') + '\n       ' + (r.text.match(/^Read by: .*$/m)?.[0] || '').slice(0, 260));
  if (PNG && r.after) drawn.push({ c, base: r.base, after: r.after, row });
}
await Promise.all(Array.from({ length: Math.max(1, +arg('--par') || 4) }, async () => { while (next < LIST.length) { const k = next++; await one(LIST[k], k); } }));
const rows = ROWS.filter(Boolean), md = EC.table(rows, 'AI path (' + ([...models][0] || provider) + ')');
console.log('\n' + md + '\n\n' + calls + ' calls to the model; ' + used.n + ' answers read: ' + used.in + ' tokens in, ' + used.out + ' out (gpt-6-luna at $0.10 / $0.50 a million: about $' + (used.in / 1e6 * 0.1 + used.out / 1e6 * 0.5).toFixed(3) + ')');
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(rows, null, 1));
if (arg('--out')) fs.writeFileSync(arg('--out'), md + '\n\n' + EC.failures(rows).join('\n') + '\n');
if (PNG) await EC.drawPairs(drawn, PNG, arg('--tag'));
