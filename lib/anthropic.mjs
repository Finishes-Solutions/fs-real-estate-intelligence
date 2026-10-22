// Claude (Anthropic) for plan sets, and for site plans when Settings › AI model › Site plans picks Claude, through the
// official SDK: the models a key can use, the model and effort a request gets, and structured JSON answers. Server only. Key: ANTHROPIC_API_KEY; model: the one picked in Settings when the key
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
// Claude's structured output takes at most 16 fields that can be null (or another union) and 24 optional ones per
// request ("Schema is too complex for compilation" past them); the site plan's program and review schemas have far
// more. Those go as the schema written into the instructions instead, and the answer is read and topped up (conform).
export function schemaLoad(schema) {
  let unions = 0, optional = 0;
  const walk = x => {
    if (!x || typeof x !== 'object') return;
    if (x.properties) { const req = new Set(x.required || []); for (const [k, p] of Object.entries(x.properties)) { if (!req.has(k)) optional++; if (Array.isArray(p?.type) || p?.anyOf) unions++; walk(p); } }
    if (x.items) walk(x.items); (x.anyOf || []).forEach(walk);
  };
  walk(schema); return { unions, optional };
}
export const fitsStrict = schema => { const l = schemaLoad(schema); return l.unions <= 16 && l.optional <= 24; };
// an answer read from text, given the shape the strict schema would have guaranteed: each required field that's missing
// is null where the schema allows it, [] for a list, an object filled the same way; anything else is left as it came
// (the callers clean every value, as they do the OpenAI answers)
export function conform(schema, v) {
  const types = s => Array.isArray(s?.type) ? s.type : [s?.type];
  if (types(schema).includes('object') && v && typeof v === 'object' && !Array.isArray(v) && schema.properties) {
    const out = { ...v };
    for (const k of schema.required || Object.keys(schema.properties)) {
      const p = schema.properties[k], t = types(p);
      if (out[k] === undefined) out[k] = t.includes('null') ? null : t.includes('array') ? [] : t.includes('object') ? conform(p, {}) : undefined;
      else out[k] = conform(p, out[k]);
      if (out[k] === undefined) delete out[k];
    }
    return out;
  }
  if (types(schema).includes('array') && Array.isArray(v) && schema.items) return v.map(x => conform(schema.items, x));
  return v;
}
// the JSON object in a text answer (a fenced block, or the outermost braces)
export function jsonIn(text) {
  const t = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t);
}
const SCHEMA_NOTE = '\n\nAnswer with one JSON object and nothing else (no prose, no code fence), matching this JSON schema exactly: every property present, null where the schema allows null and nothing applies, only the values an enum lists.\n';
// an image the OpenAI call would take (a data URL, or https) as a Claude image block
const imageBlock = url => { const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(url || ''); return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : /^https:\/\//.test(url || '') ? { type: 'image', source: { type: 'url', url } } : null; };

// One structured answer: the parsed JSON matching `schema` (a JSON schema, every object closed with
// additionalProperties: false). images: data or https URLs Claude looks at with the text (layout drawings).
// A schema past the structured-output limits (fitsStrict), or one Claude says is too complex, is written into the
// system prompt instead. A cut-off answer throws with cutOff set (lib/openai.mjs withRoom asks again with more room).
// -> { data, model, usage, fellBack }
export async function claudeJSON({ key, model, effort = DEFAULT_EFFORT, system, user, schema, maxTokens = 32000, signal, feature = 'planset', images = [] }) {
  const imgs = images.map(imageBlock).filter(Boolean), content = imgs.length ? [...imgs, { type: 'text', text: user }] : user;
  const build = strict => ({ model, max_tokens: maxTokens, system: [{ type: 'text', text: strict ? system : system + SCHEMA_NOTE + JSON.stringify(schema), cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }],
    thinking: { type: 'adaptive' }, output_config: strict ? { effort, format: { type: 'json_schema', schema } } : { effort } });
  const c = claude(key);
  const send = p => c.beta.messages.stream(p, { signal }).finalMessage();
  let strict = fitsStrict(schema), msg, params = { ...build(strict), betas: [FALLBACK_BETA], fallbacks: 'default' };
  for (let i = 0; i < 4; i++) {
    try { msg = await send(params); break; }
    catch (e) {
      const m = String(e?.message || ''), bad = e?.status === 400;
      // an older model that won't take one of the newer options: drop it and ask again (the request only)
      if (bad && /fallback/i.test(m) && params.fallbacks) { const { betas, fallbacks, ...rest } = params; params = rest; continue; }
      if (bad && /thinking|effort/i.test(m) && params.thinking) { const { thinking, ...rest } = params; params = { ...rest, output_config: params.output_config.format ? { format: params.output_config.format } : {} }; continue; }
      // a schema the API can't compile after all: the schema in the instructions
      if (bad && strict && /schema|too complex|compil/i.test(m)) { strict = false; const { system: s0, output_config, ...rest } = params, nb = build(false); params = { ...rest, system: nb.system, output_config: output_config.effort ? { effort: output_config.effort } : {} }; continue; }
      throw e;
    }
  }
  await recordUsage(msg.model || model, usageOf(msg.usage), feature);
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined to answer' + (msg.stop_details?.category ? ' (' + msg.stop_details.category + ')' : '')), { refusal: true });
  if (msg.stop_reason === 'max_tokens') throw Object.assign(new Error('Claude’s answer was cut off (it ran past ' + maxTokens + ' tokens)'), { cutOff: true });
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let data; try { data = strict ? JSON.parse(text) : conform(schema, jsonIn(text)); } catch (e) { throw new Error('Claude’s answer wasn’t valid JSON'); }
  const fellBack = (msg.content || []).some(b => b.type === 'fallback') || (msg.usage?.iterations || []).some(x => x.type === 'fallback_message');
  return { data, model: msg.model || model, usage: msg.usage, fellBack };
}
