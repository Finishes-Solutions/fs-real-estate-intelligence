// Web search for the assistant, only when the user asks for it ("look it up", "search the web", "google it").
// One OpenAI Responses call with the built-in web search tool and low reasoning effort, so it answers in a few seconds.
// POST { query, near? } -> { answer, sources: [{ title, url }] }
import { rateLimit, sameOrigin, needKey, clip } from './_lib/guard.mjs';

const MODELS = [process.env.OPENAI_SEARCH_MODEL, 'gpt-5-mini', 'gpt-4.1-mini'].filter(Boolean);

// cited pages from the answer's url_citation annotations, de-duplicated, in order
export function parseSearch(d) {
  const parts = (d?.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text');
  const answer = parts.map(c => c.text).join('\n').trim(), seen = new Set(), sources = [];
  for (const a of parts.flatMap(c => c.annotations || [])) {
    if (a.type !== 'url_citation' || !a.url || seen.has(a.url)) continue; seen.add(a.url);
    let host = ''; try { host = new URL(a.url).hostname.replace(/^www\./, ''); } catch (e) { continue; }
    sources.push({ title: clip(a.title || host, 140), url: a.url.replace(/[?&]utm_source=openai$/, ''), site: host });
  }
  return { answer, sources: sources.slice(0, 8) };
}

export async function webSearch(key, query, near, local = true) {
  let last = '';
  for (const model of MODELS) {
    for (const tool of ['web_search', 'web_search_preview']) {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: AbortSignal.timeout(45000), headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, // Houston bias only while the user is looking at the home region; a question about Lyon gets no US slant
          tools: [{ type: tool, search_context_size: 'low', ...(local ? { user_location: { type: 'approximate', country: 'US', region: 'Texas', city: 'Houston' } } : {}) }],
          tool_choice: 'required', max_output_tokens: 1200, store: false, ...(/^gpt-5|^o\d/.test(model) ? { reasoning: { effort: 'low' } } : {}),
          instructions: 'Search the web and answer in 2-4 plain sentences (no markdown). Give specific facts with dates and figures when sources have them, and say when sources disagree or a figure is an estimate. Prefer official, news and primary sources.',
          input: query + (near ? ' (context: ' + near + ')' : '') })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { const out = parseSearch(d); if (out.answer) return out; last = 'empty answer'; break; }
      last = d.error?.message || 'HTTP ' + r.status;
      if (r.status === 401) throw new Error('OpenAI rejected the API key');
      if (!/tool|web_search/i.test(last)) break; // a tool-name problem tries the older name; anything else tries the next model
    }
  }
  throw new Error(last || 'search failed');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 6, perDay: 120 })) return;
  const key = needKey(res); if (!key) return;
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const query = clip(String(body.query || '').trim(), 300), near = clip(String(body.near || '').trim(), 120);
  if (query.length < 3) return res.status(400).json({ error: 'What should I search for?' });
  try { return res.json({ query, ...(await webSearch(key, query, near, body.local !== false)) }); }
  catch (e) { console.error('search', e.message); return res.status(502).json({ error: 'The web search didn’t work just now. Try again in a moment.' }); }
}
