// Voice: mints a short-lived OpenAI Realtime client secret so the browser can talk to the model over WebRTC directly.
// The session carries the same map tools as the text chat; the browser executes them.
// POST { context: { coverage, filters } } -> { value: 'ek_…', model, expires_at }
import { realtimeTools, systemPrompt, VOICE_STYLE } from '../lib/agent-tools.mjs';
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

const MODELS = [process.env.OPENAI_REALTIME_MODEL, 'gpt-realtime-2.1', 'gpt-realtime'].filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (process.env.VOICE_ENABLED === 'false') return res.status(503).json({ error: 'Voice is turned off on this deployment.' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 3, perDay: 30 })) return;
  const key = needKey(res); if (!key) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const ctx = body.context || {};
  const instructions = systemPrompt({ coverage: clip(ctx.coverage, 600), filters: clip(ctx.filters, 400), screen: clip(ctx.screen, 2500) }) + VOICE_STYLE;
  // vocabulary hint for the transcriber: a short list of names it would otherwise mishear. Kept short on purpose: on
  // silence or noise gpt-4o-transcribe can "hear" its hint read back, and a 60-name list came back as a burst of place
  // names the user never said. A dozen names echo far less; other names are fixed after the fact by the geocoders.
  const extra = String(ctx.vocab || '').split(',').map(x => x.trim()).filter(x => x && x.length < 40 && !/county$/i.test(x)).slice(0, 6);
  const vocab = clip(['Houston, Texas commercial real estate. Katy, Cypress, Sugar Land, The Woodlands, Pearland, Conroe, Tomball, Fulshear', ...extra, 'TDLR, TABS, multifamily'].join(', '), 400);
  let last = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 120 }, session: {
        type: 'realtime', model, instructions, tools: realtimeTools(), tool_choice: 'auto', max_output_tokens: 2000,
        audio: { input: { transcription: { model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe', language: 'en', prompt: vocab },
          noise_reduction: { type: 'near_field' },
          // reply when the speaker finishes a thought (medium waits out mid-sentence pauses); talking over the reply interrupts it
          // create_response off: the browser starts the reply once the transcript shows a real request (noise and
          // echoes of the hint list are dropped instead of answered), and the user's words always show before the reply
          turn_detection: { type: 'semantic_vad', eagerness: 'medium', create_response: false, interrupt_response: true } }, output: { voice: process.env.OPENAI_VOICE || 'marin' } } } })
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.value) return res.json({ value: d.value, expires_at: d.expires_at, model, vocab });
    last = d.error?.message || 'HTTP ' + r.status;
    if (r.status === 401) break;
  }
  console.error('realtime session failed', last);
  return res.status(502).json({ error: 'Couldn’t start a voice session.' });
}
