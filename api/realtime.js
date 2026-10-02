// Voice: mints a short-lived OpenAI Realtime client secret so the browser can talk to the model over WebRTC directly.
// The session carries the same map tools as the text chat; the browser executes them.
// POST { context: { coverage, filters } } -> { value: 'ek_…', model, expires_at }
import { realtimeTools, systemPrompt } from '../lib/agent-tools.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

const MODELS = [process.env.OPENAI_REALTIME_MODEL, 'gpt-realtime-2.1', 'gpt-realtime'].filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (process.env.VOICE_ENABLED === 'false') return res.status(503).json({ error: 'Voice is turned off on this deployment.' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 3, perDay: 30 })) return;
  const key = needKey(res); if (!key) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const ctx = body.context || {};
  const instructions = systemPrompt({ coverage: clip(ctx.coverage, 600), filters: clip(ctx.filters, 400) }) +
    '\nYou are speaking out loud: answer in one or two short spoken sentences, say numbers naturally ("about four point two million"), and do not read out TABS ids unless asked. Act on the map with tools while you talk.';
  let last = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 120 }, session: {
        type: 'realtime', model, instructions, tools: realtimeTools(), tool_choice: 'auto', max_output_tokens: 1200,
        audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'semantic_vad' } }, output: { voice: process.env.OPENAI_VOICE || 'marin' } } } })
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.value) return res.json({ value: d.value, expires_at: d.expires_at, model });
    last = d.error?.message || 'HTTP ' + r.status;
    if (r.status === 401) break;
  }
  console.error('realtime session failed', last);
  return res.status(502).json({ error: 'Couldn’t start a voice session.' });
}
