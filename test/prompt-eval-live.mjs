// Manual check of the AI's reading of site plan requests: the corpus (test/fixtures/prompt-corpus.mjs) sent to the real
// program step (api/siteplan.js, the same instructions and schema as the app), its program laid out exactly as the app
// does (lib/layoutbrief.mjs briefFromProgram with the request's words, lib/layoutrun.mjs runBrief), scored by
// scripts/prompt-corpus.mjs. Not part of `npm test` (it needs a key and costs a little).
//   OPENAI_API_KEY=… [OPENAI_MODEL=…] node test/prompt-eval-live.mjs [--only S0,V1] [--cat spatial] [--max 120] [--json out.json] [--out table.md]
//   ANTHROPIC_API_KEY=… node test/prompt-eval-live.mjs --provider anthropic [--model claude-…]
//   node test/prompt-eval-live.mjs --env ../.env.local   (the keys read from a local env file into this process only)
// Prints the same score table as the words path. Usage is not recorded to the app's database from here.
import fs from 'node:fs';
import { CASES, SITES } from './fixtures/prompt-corpus.mjs';
import { planOf, scoreCase, table, failures } from '../scripts/prompt-corpus.mjs';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
// --env <file>: KEY=value lines read into this process only (a local .env file; never printed or written anywhere)
if (arg('--env')) for (const line of fs.readFileSync(arg('--env'), 'utf8').split(/\r?\n/)) { const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); }
for (const k of Object.keys(process.env)) if (/^SUPABASE|^NEXT_PUBLIC_SUPABASE/.test(k)) delete process.env[k]; // (no usage rows written from an eval)
const provider = arg('--provider') || (process.env.OPENAI_API_KEY ? 'openai' : 'anthropic');
if (provider === 'openai' && !process.env.OPENAI_API_KEY) { console.error('Set OPENAI_API_KEY (or ANTHROPIC_API_KEY with --provider anthropic) to run the live eval.'); process.exit(1); }
if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY to run the live eval with Claude.'); process.exit(1); }
if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'unused'; // (the endpoint asks for one before routing to Claude)
const { siteAI } = await import('../api/siteplan.js');
const B = await import('../lib/layoutbrief.mjs'), RUN = await import('../lib/layoutrun.mjs'), S = await import('../lib/siteplan.mjs');

const only = arg('--only'), cat = arg('--cat'), max = +arg('--max') || 120, model = arg('--model') || null;
// the site as the app describes it to the model: acres, rough size, the streets, which way is north
const COMPASS = ['south', 'east', 'north', 'west'];
function siteFor(id) {
  const s = SITES[id], xs = s.ring.map(p => p[0]), ys = s.ring.map(p => p[1]), w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys);
  const side = (s.streets || []).map(i => COMPASS[i]), front = COMPASS[s.front];
  return { acres: +(S.ringArea(s.ring) / 43560).toFixed(2), widthFt: Math.round(s.front % 2 ? d : w), depthFt: Math.round(s.front % 2 ? w : d), frontageFt: Math.round(S.edgeLen(s.ring, s.front)),
    streets: [{ side: 'front', name: 'Main Road' }, ...side.map(() => ({ side: 'side', name: 'Side Street' }))], shape: 'Rectangle. North is up. The main road runs along the ' + front + ' edge' + (side.length ? '; a side street along the ' + side.join(' and ') + ' edge' : '') + '; the other lines back onto neighbours.' };
}
const rows = []; let calls = 0;
for (const c of CASES.filter(c => (!only || only.split(',').some(x => c.id.startsWith(x))) && (!cat || c.cat === cat)).slice(0, max)) {
  const t0 = Date.now(); let row;
  try {
    calls++;
    const r = await siteAI({ prompt: c.ask, site: siteFor(c.site), ...(provider === 'anthropic' ? { provider: 'anthropic' } : {}), ...(model ? { model } : {}) });
    if (r.status !== 200 || !r.body?.program) throw new Error('AI answered ' + r.status + ': ' + (r.body?.error || 'no program'));
    const plan = { ...planOf(c.site), setbacks: { ...planOf(c.site).setbacks, ...(r.body.setbacks || {}) } }, brief = B.briefFromProgram(r.body.program, plan, { text: c.ask, parser: 'ai' });
    if (r.body.assumptions?.length) brief.request.assumed = [...(brief.request.assumed || []), ...r.body.assumptions];
    const rec = RUN.runBrief(brief); row = { ...scoreCase(c, brief, rec), model: r.model, program: r.body.program };
  } catch (e) { row = { ...scoreCase(c, null, null), error: e.message }; }
  rows.push(row);
  console.log((row.ok ? 'ok   ' : 'MISS ') + c.id.padEnd(4), (Date.now() - t0 + 'ms').padStart(7), c.ask.slice(0, 70), row.error ? '\n       ' + row.error : row.ok ? '' : '\n       ' + [...row.reading, ...row.outcome].filter(x => !x.ok).map(x => x.name + ' → ' + x.got).join(' | '));
}
const md = table(rows, 'AI path (' + (rows.find(r => r.model)?.model || provider) + ')');
console.log('\n' + md + '\n\n' + calls + ' calls to the model');
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(rows, null, 1));
if (arg('--out')) fs.writeFileSync(arg('--out'), md + '\n\n' + failures(rows).join('\n') + '\n');
