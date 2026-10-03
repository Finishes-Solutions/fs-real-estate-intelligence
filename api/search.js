// Web search for the assistant, only when the user asks for it ("look it up", "search the web", "google it").
// One OpenAI Responses call with the built-in web search tool and low reasoning effort, so it answers in a few seconds.
// POST { query, near? } -> { answer, sources: [{ title, url }] }
// POST { mode: 'locate', query } -> { name, within, address, city, lat, lon, sources }: where a place is, for the map when
//   OpenStreetMap doesn't know it by the words used ("Terminal B at George Bush airport"); the app checks it against the map.
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

const LOCATE = 'Find the place the user means (fix nicknames and old names to the official current name) and reply with ONLY a JSON object, no other text: ' +
  '{"name": official current name of the place itself, "within": the larger place it is part of (airport, campus, mall, park) or "", "address": street address or "", "city": city or "", "lat": latitude or null, "lon": longitude or null}. ' +
  'Use null for coordinates you are not sure of; never guess.';
// the model's JSON (possibly fenced or with a sentence around it) -> a clean place, or null
export function parseLocate(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/); if (!m) return null;
  let d; try { d = JSON.parse(m[0]); } catch (e) { return null; }
  const str = v => typeof v === 'string' ? clip(v.trim(), 120) : '', num = v => v === null || v === '' || v === undefined || !isFinite(+v) ? null : +v;
  const out = { name: str(d.name), within: str(d.within), address: str(d.address), city: str(d.city), lat: num(d.lat), lon: num(d.lon) };
  if (out.lat == null || out.lon == null || Math.abs(out.lat) > 90 || Math.abs(out.lon) > 180 || (out.lat === 0 && out.lon === 0)) out.lat = out.lon = null;
  return out.name || out.lat != null ? out : null;
}

export async function webSearch(key, query, near, local = true, instructions) {
  let last = '';
  for (const model of MODELS) {
    for (const tool of ['web_search', 'web_search_preview']) {
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', signal: AbortSignal.timeout(45000), headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, // Houston bias only while the user is looking at the home region; a question about Lyon gets no US slant
          tools: [{ type: tool, search_context_size: 'low', ...(local ? { user_location: { type: 'approximate', country: 'US', region: 'Texas', city: 'Houston' } } : {}) }],
          tool_choice: 'required', max_output_tokens: 1200, store: false, ...(/^gpt-5|^o\d/.test(model) ? { reasoning: { effort: 'low' } } : {}),
          instructions: instructions || 'Search the web and answer in 2-4 plain sentences (no markdown). Give specific facts with dates and figures when sources have them, and say when sources disagree or a figure is an estimate. Prefer official, news and primary sources.',
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
  if (body.mode === 'locate') {
    try { const r = await webSearch(key, query, near, true, LOCATE), p = parseLocate(r.answer); if (!p) return res.status(404).json({ error: 'not found' });
      return res.json({ query, ...p, sources: r.sources }); }
    catch (e) { console.error('locate', e.message); return res.status(502).json({ error: 'The web search didn’t work just now.' }); }
  }
  try { return res.json({ query, ...(await webSearch(key, query, near, body.local !== false)) }); }
  catch (e) { console.error('search', e.message); return res.status(502).json({ error: 'The web search didn’t work just now. Try again in a moment.' }); }
}
