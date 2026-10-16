// Which AI model answers: the providers the app can use and the chat models a key offers, shared by the server (which
// checks a picked model before using it) and Settings › AI model (which lists them). No DOM and no network here.
// For now only OpenAI is switched on; Anthropic is listed so the choice is visible, and needs its own key and client
// before it can be turned on. Voice (Realtime) and place search keep their own models: they need features a plain chat
// model doesn't have.
export const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', on: true },
  { id: 'anthropic', label: 'Anthropic (Claude)', on: false, note: 'Anthropic (Claude) comes later: it needs its own API key on the server before it can be switched on.' }
];
export const MODEL_KEY = 'fs-ai-model'; // the model picked on this device ('' or missing = the server's default)
// chat models only: not audio, realtime, speech, images, embeddings, moderation, search or code-only models, and not
// dated snapshots (gpt-4o-2024-08-06) when the plain name is there to pick
const SKIP = /(audio|realtime|tts|transcribe|whisper|dall-e|image|embedding|moderation|search|instruct|babbage|davinci|computer-use|codex|-\d{4}-\d{2}-\d{2}$|-\d{4}$)/i;
// and only the ones every AI feature here works with: structured (JSON schema) answers, drawings in, a reasoning level.
// Left out: the -pro models (OpenAI serves them through its Responses API only), the ChatGPT -chat-latest aliases, live
// (voice) models, and GPT-4, GPT-4 Turbo and GPT-3.5 (no structured answers)
const UNFIT = /(-pro$|-pro-|chat-latest|^gpt-live|^chatgpt-|^gpt-3|^gpt-4$|^gpt-4-)/i;
export const providerOf = id => /^(gpt-|o\d|chatgpt-)/i.test(id || '') ? 'openai' : /^claude-/i.test(id || '') ? 'anthropic' : null;
export const isChatModel = id => typeof id === 'string' && id.length < 80 && providerOf(id) === 'openai' && !SKIP.test(id) && !UNFIT.test(id);
// a key's model list (OpenAI GET /v1/models data) as the picker shows it: chat models, newest first
export const chatModels = list => (Array.isArray(list) ? list : []).filter(m => isChatModel(m?.id)).sort((a, b) => (b.created || 0) - (a.created || 0) || a.id.localeCompare(b.id)).map(m => ({ id: m.id, created: m.created || null }));
// the model to ask for: the one picked, if it's a model the server could use, else '' (the server's default)
export const pickedModel = v => typeof v === 'string' && isChatModel(v.trim()) ? v.trim() : '';
