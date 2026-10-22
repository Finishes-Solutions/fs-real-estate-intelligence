// Which AI answers a request, for the features that can use either provider (Settings › AI model: site plans, Ask AI,
// filing briefs, reference files). The request says { provider: 'anthropic', model? } for Claude (the model picked when
// the Claude key has it, else ANTHROPIC_MODEL, else Claude Opus 5.5: lib/anthropic.mjs useClaude) or { model? } for
// OpenAI (the model picked when the OpenAI key has it, else the feature's server default: lib/openai.mjs withModel).
// No ANTHROPIC_API_KEY, or a call Claude turns away as malformed (400 / 404): OpenAI's default answers, as for a picked
// OpenAI model that can't. The answering model is said in the X-AI-Model header. Server only.
import { chatJSON as openaiJSON, chatText as openaiText, pickModel, withModel } from './openai.mjs';
import { claudeJSON, claudeText, useClaude } from './anthropic.mjs';
import { isClaudeModel } from './aimodels.mjs';

export const claudeKey = () => process.env.ANTHROPIC_API_KEY || '';
export const wantsClaude = b => b?.provider === 'anthropic' && !!claudeKey();

// a feature's router: envModel() names the OpenAI default it starts from (OPENAI_MODEL, OPENAI_CHAT_MODEL…), checked once
// per instance against the key (lib/openai.mjs pickModel)
export function router(envModel = () => process.env.OPENAI_MODEL) {
  let modelP = null;
  const model0 = key => (modelP ||= pickModel(key, envModel()).catch(e => { modelP = null; throw e; }));
  // run(model) makes the call with the model it's given; b: the request's { provider, model }
  const ai = async (key, b, res, run) => {
    const say = m => res?.setHeader?.('X-AI-Model', m), picked = typeof b?.model === 'string' ? b.model : null;
    if (b?.provider !== 'anthropic') return withModel(key, picked, () => model0(key), run, say); // (a picked model that can't serve the call: the default answers)
    if (!claudeKey()) return withModel(key, null, () => model0(key), run, say);
    const m = await useClaude(claudeKey(), picked); say(m);
    try { return await run(m); }
    catch (e) { if (e?.status !== 400 && e?.status !== 404) throw e; const d = await model0(key); console.warn('claude', m, 'failed, using', d, ':', e.message); say(d); return run(d); }
  };
  return { ai, model0 };
}

// one structured answer from whichever provider the model is: Claude gets twice the room (its thinking is always on and
// shares max_tokens with the answer; only what it uses is billed) and the Claude key
export const chatJSON = o => isClaudeModel(o.model) ? claudeJSON({ ...o, key: claudeKey(), maxTokens: Math.min(128000, (o.maxTokens || 4000) * 2) }) : openaiJSON(o);
// plain text, the same way
export const chatText = o => isClaudeModel(o.model) ? claudeText({ ...o, key: claudeKey(), maxTokens: Math.min(128000, (o.maxTokens || 1200) * 2) }) : openaiText(o);
