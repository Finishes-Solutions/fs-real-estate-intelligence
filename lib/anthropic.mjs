// Claude (Anthropic) for plan sets, through the official SDK: the models a key can use, the model and effort a request
// gets, and structured JSON answers. Server only. Key: ANTHROPIC_API_KEY; model: the one picked in Settings when the key
// has it, else ANTHROPIC_MODEL, else claude-opus-5-5; effort: the one picked, else ANTHROPIC_EFFORT, else medium.
// Requests stream (a long answer would otherwise hit the SDK's HTTP timeout), think adaptively, keep the system prompt
// cached (a set makes several calls with the same instructions) and ask for Anthropic's default refusal fallback, so a
// false positive on, say, a fire alarm note is answered by another model instead of failing the set.
// Usage is recorded under the Plan sets feature (lib/aiusage.mjs), in the token shape it already reads.
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CLAUDE, DEFAULT_EFFORT, EFFORTS, isClaudeModel } from './aimodels.mjs';
import { recordUsage } from './aiusage.mjs';

let client = null, clientKey = '';
export function claude(key) { if (!client || clientKey !== key) { client = new Anthropic({ apiKey: key, maxRetries: 2 }); clientKey = key; } return client; }
export function _setClient(c, key = 'test') { client = c; clientKey = key; listP = null; } // tests

export const serverModel = (env = process.env) => isClaudeModel(env.ANTHROPIC_MODEL) ? env.ANTHROPIC_MODEL : DEFAULT_CLAUDE;
export const serverEffort = (env = process.env) => EFFORTS.includes(env.ANTHROPIC_EFFORT) ? env.ANTHROPIC_EFFORT : DEFAULT_EFFORT;
export const effortFor = (requested, env = process.env) => EFFORTS.includes(requested) ? requested : serverEffort(env);

// the models this key can use (GET /v1/models), kept for ten minutes per server instance
let listP = null, listAt = 0;
export function claudeModelList(key) {
  if (!listP || Date.now() - listAt > 600000) {
    listAt = Date.now();
    listP = (async () => { const out = []; for await (const m of claude(key).models.list({ limit: 100 })) out.push(m); return out; })().catch(e => { listP = null; throw e; });
  }
  return listP;
}
// the model a request asked for, used only when the key has it; otherwise the server's
export async function useClaude(key, requested, env = process.env) {
  if (requested && isClaudeModel(requested)) { try { if ((await claudeModelList(key)).some(m => m.id === requested)) return requested; } catch (e) { /* the server's */ } }
  return serverModel(env);
}

// Anthropic's usage → the shape lib/aiusage.mjs tokensOf reads: input counts every input token (cache reads and writes
// are reported apart from input_tokens), cached the cache reads
export function usageOf(u) {
  if (!u) return null;
  const n = v => Number.isFinite(+v) && +v > 0 ? +v : 0, read = n(u.cache_read_input_tokens);
  return { input_tokens: n(u.input_tokens) + read + n(u.cache_creation_input_tokens), output_tokens: n(u.output_tokens), input_tokens_details: { cached_tokens: read } };
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
// One structured answer: the parsed JSON matching `schema` (a JSON schema, every object closed with
// additionalProperties: false). -> { data, model, usage, fellBack }
export async function claudeJSON({ key, model, effort = DEFAULT_EFFORT, system, user, schema, maxTokens = 32000, signal, feature = 'planset' }) {
  const base = { model, max_tokens: maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }],
    thinking: { type: 'adaptive' }, output_config: { effort, format: { type: 'json_schema', schema } } };
  const c = claude(key);
  const send = p => c.beta.messages.stream(p, { signal }).finalMessage();
  let msg, params = { ...base, betas: [FALLBACK_BETA], fallbacks: 'default' };
  for (let i = 0; i < 3; i++) {
    try { msg = await send(params); break; }
    catch (e) {
      const m = String(e?.message || ''), bad = e?.status === 400;
      // an older model that won't take one of the newer options: drop it and ask again (the request only)
      if (bad && /fallback/i.test(m) && params.fallbacks) { const { betas, fallbacks, ...rest } = params; params = rest; continue; }
      if (bad && /thinking|effort/i.test(m) && params.thinking) { const { thinking, ...rest } = params; params = { ...rest, output_config: { format: base.output_config.format } }; continue; }
      throw e;
    }
  }
  await recordUsage(msg.model || model, usageOf(msg.usage), feature);
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined to answer' + (msg.stop_details?.category ? ' (' + msg.stop_details.category + ')' : '')), { refusal: true });
  if (msg.stop_reason === 'max_tokens') throw new Error('Claude’s answer was cut off (it ran past ' + maxTokens + ' tokens)');
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let data; try { data = JSON.parse(text); } catch (e) { throw new Error('Claude’s answer wasn’t valid JSON'); }
  const fellBack = (msg.content || []).some(b => b.type === 'fallback') || (msg.usage?.iterations || []).some(x => x.type === 'fallback_message');
  return { data, model: msg.model || model, usage: msg.usage, fellBack };
}
