// Which AI model answers: the providers the app can use, the AI features and which providers each can use, and the
// models a key offers, shared by the server (which checks a picked model before using it) and Settings › AI model
// (which lists them). No DOM and no network here.
// Each feature has its own pick on the device (aiPick): OpenAI or Anthropic (Claude, with its own key ANTHROPIC_API_KEY)
// where both can do the job, and the model. Voice and renderings are OpenAI only (Claude has no live speech or image
// making), and so is place search (it uses OpenAI's web search). Plan sets are Claude only, with their own model and
// effort (PLANSET_MODEL_KEY).
export const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', on: true },
  { id: 'anthropic', label: 'Anthropic (Claude)', on: true }
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

// ---------- Claude, for plan sets ----------
// The model and effort picked for plan sets on this device ('' = the server's default, ANTHROPIC_MODEL / ANTHROPIC_EFFORT)
export const PLANSET_MODEL_KEY = 'fs-planset-model', PLANSET_EFFORT_KEY = 'fs-planset-effort';
export const DEFAULT_CLAUDE = 'claude-opus-5-5';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'], DEFAULT_EFFORT = 'medium'; // medium decided Oct 19
export const isClaudeModel = id => typeof id === 'string' && id.length < 80 && /^claude-[a-z0-9][a-z0-9.-]*$/i.test(id);
// a key's model list (Anthropic GET /v1/models data: { id, display_name, created_at }) as the picker shows it, newest first
export const claudeModels = list => (Array.isArray(list) ? list : []).filter(m => isClaudeModel(m?.id))
  .map(m => ({ id: m.id, name: typeof m.display_name === 'string' ? m.display_name.slice(0, 60) : m.id, created: Date.parse(m.created_at) || null }))
  .sort((a, b) => (b.created || 0) - (a.created || 0) || a.id.localeCompare(b.id));
export const pickedClaude = v => typeof v === 'string' && isClaudeModel(v.trim()) ? v.trim() : '';
export const pickedEffort = v => EFFORTS.includes(v) ? v : '';

// ---------- each feature's AI ----------
// kind: which OpenAI models fit it (chat: lib chatModels; realtime: live voice; image: GPT Image)
export const AI_FEATURES = [
  { id: 'siteplan', label: 'Site plans', hint: 'Build with AI, Change With AI, Ask about the plan, What Should Go Here?', providers: ['openai', 'anthropic'], kind: 'chat' },
  { id: 'chat', label: 'Ask AI', hint: 'The typed assistant and its map tools', providers: ['openai', 'anthropic'], kind: 'chat' },
  { id: 'brief', label: 'Filing briefs', hint: 'The AI brief on a filing’s card', providers: ['openai', 'anthropic'], kind: 'chat' },
  { id: 'files', label: 'Reference files', hint: 'Reading a project’s surveys, plans and PDFs into facts', providers: ['openai', 'anthropic'], kind: 'chat' },
  { id: 'search', label: 'Place search', hint: 'Finding places the map’s address search doesn’t know (OpenAI web search)', providers: ['openai'], kind: 'chat' },
  { id: 'voice', label: 'Voice', hint: 'Talking to the assistant (OpenAI’s live voice models)', providers: ['openai'], kind: 'realtime' },
  { id: 'render', label: 'Renderings', hint: 'Photoreal renderings of a site plan (OpenAI’s image models)', providers: ['openai'], kind: 'image' }
];
export const featureOf = id => AI_FEATURES.find(f => f.id === id) || null;
export const aiPickKey = id => 'fs-ai-' + id; // { provider, model } as JSON, kept on the device
// the OpenAI models a voice or rendering can use (dated snapshots left out when the plain name is there)
export const isRealtimeModel = id => typeof id === 'string' && id.length < 80 && /^gpt-realtime(?:-[\w.]+)?$/.test(id) && !/-\d{4}-\d{2}-\d{2}$/.test(id);
export const isImageModel = id => typeof id === 'string' && id.length < 80 && /^gpt-image-[\w.-]+$/.test(id) && !/-\d{4}-\d{2}-\d{2}$/.test(id);
const fits = { chat: isChatModel, realtime: isRealtimeModel, image: isImageModel };
export const kindModels = (list, kind) => kind === 'chat' ? chatModels(list) : (Array.isArray(list) ? list : []).filter(m => fits[kind]?.(m?.id)).sort((a, b) => (b.created || 0) - (a.created || 0) || a.id.localeCompare(b.id)).map(m => ({ id: m.id, created: m.created || null }));
// a feature's pick as kept (raw: the stored JSON), made safe: a provider the feature can use, and a model of that
// provider and kind ('' = the server's default). legacy: what this device picked before per-feature picks (the one
// OpenAI model for everything, MODEL_KEY; site plans' provider and Claude model, SITEPLAN_*_KEY), used until a pick is made
export function readPick(id, raw, legacy = {}) {
  const f = featureOf(id); if (!f) return { provider: 'openai', model: '' };
  let v = null; try { v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
  if (!v || typeof v !== 'object') v = id === 'siteplan' && legacy.siteplanProvider === 'anthropic' ? { provider: 'anthropic', model: legacy.siteplanClaude || '' } : { provider: 'openai', model: f.kind === 'chat' && id !== 'search' ? legacy.model || '' : '' };
  const provider = f.providers.includes(v.provider) ? v.provider : f.providers[0];
  const m = typeof v.model === 'string' ? v.model.trim() : '', model = provider === 'anthropic' ? pickedClaude(m) : fits[f.kind]?.(m) ? m : '';
  return { provider, model };
}
// what a request carries about its AI: { provider: 'anthropic', model? } for Claude, { model } for a picked OpenAI
// model, {} for the server's OpenAI default
export const aiRequest = pick => pick?.provider === 'anthropic' ? { provider: 'anthropic', ...(pickedClaude(pick.model) ? { model: pickedClaude(pick.model) } : {}) } : pick?.model ? { model: pick.model } : {};

// ---------- before per-feature picks (read once, as the legacy picks above) ----------
export const SITEPLAN_PROVIDER_KEY = 'fs-siteplan-provider', SITEPLAN_CLAUDE_KEY = 'fs-siteplan-claude';
