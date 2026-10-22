// The AI models Settings › AI model offers for each feature (lib/aimodels.mjs AI_FEATURES): the OpenAI models this key
// can use, by kind (chat models for site plans, Ask AI, briefs, reference files and place search; live voice models;
// image models), newest first, and the model each feature uses when none is picked. Claude's list comes from api/planset
// (its key, its models). The picks themselves are kept on the device and sent with each AI request, which uses them
// only when the key can.
//   GET -> { providers, default, models: [{ id, created }], realtime: [...], image: [...], defaults: { feature: model } }
import { pickModel, availableModels, DEFAULT_MODEL, FALLBACK_MODELS } from '../lib/openai.mjs';
import { PROVIDERS, chatModels, kindModels } from '../lib/aimodels.mjs';
import { pickImageModel } from '../lib/render.mjs';
import { rateLimit, needKey } from './_lib/guard.mjs';

// the first of a feature's own model list this key has (what it answers with when nothing is picked)
const firstOf = (ids, list) => ids.filter(Boolean).find(id => list.some(m => m.id === id)) || ids.filter(Boolean)[0] || null;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!rateLimit(req, res, { perMinute: 12, perDay: 300 })) return;
  const key = needKey(res); if (!key) return;
  try {
    const E = process.env, [def, list] = await Promise.all([pickModel(key, E.OPENAI_MODEL), availableModels(key)]);
    const defaults = { siteplan: def, brief: def, files: def, chat: firstOf([E.OPENAI_CHAT_MODEL || E.OPENAI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS], list),
      search: firstOf([E.OPENAI_SEARCH_MODEL, 'gpt-5-mini', 'gpt-4.1-mini'], list), voice: firstOf([E.OPENAI_REALTIME_MODEL, 'gpt-realtime-2.1', 'gpt-realtime'], list),
      render: E.OPENAI_IMAGE_MODEL || pickImageModel(list) };
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.json({ providers: PROVIDERS, default: def, models: chatModels(list), realtime: kindModels(list, 'realtime'), image: kindModels(list, 'image'), defaults });
  } catch (e) {
    console.error('models', e.message);
    return res.status(502).json({ error: 'Couldn’t reach OpenAI to list the models just now.' });
  }
}
