// The AI models Settings › AI model offers: the providers (OpenAI on; Anthropic listed, not yet switched on), the
// server's default model, and the chat models this key can use, newest first (lib/aimodels.mjs). The pick itself is
// kept on the device and sent with each AI request (api/siteplan, api/chat, api/brief), which use it only when the
// key can.
//   GET -> { providers, default, models: [{ id, created }] }
import { pickModel, availableModels } from '../lib/openai.mjs';
import { PROVIDERS, chatModels } from '../lib/aimodels.mjs';
import { rateLimit, needKey } from './_lib/guard.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!rateLimit(req, res, { perMinute: 12, perDay: 300 })) return;
  const key = needKey(res); if (!key) return;
  try {
    const [def, list] = await Promise.all([pickModel(key, process.env.OPENAI_MODEL), availableModels(key)]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.json({ providers: PROVIDERS, default: def, models: chatModels(list) });
  } catch (e) {
    console.error('models', e.message);
    return res.status(502).json({ error: 'Couldn’t reach OpenAI to list the models just now.' });
  }
}
