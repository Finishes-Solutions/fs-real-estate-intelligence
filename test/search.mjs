// Offline tests for api/search.js (web search through the OpenAI Responses API, mocked).
import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'sk-test';
const reply = { output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', content: [{ type: 'output_text', text: 'JPMorgan Chase Tower is 1,002 ft tall and was completed in 1981.',
  annotations: [{ type: 'url_citation', url: 'https://en.wikipedia.org/wiki/JPMorgan_Chase_Tower_(Houston)?utm_source=openai', title: 'JPMorgan Chase Tower (Houston)' }, { type: 'url_citation', url: 'https://www.skyscrapercenter.com/building/x', title: 'CTBUH' },
    { type: 'url_citation', url: 'https://en.wikipedia.org/wiki/JPMorgan_Chase_Tower_(Houston)?utm_source=openai', title: 'dup' }] }] }] };
const sent = []; let mode = 'ok';
globalThis.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body); sent.push(b);
  if (mode === 'old-tool' && b.tools[0].type === 'web_search') return Response.json({ error: { message: "Invalid value: 'web_search'. Supported tools: web_search_preview" } }, { status: 400 });
  if (mode === 'down') return Response.json({ error: { message: 'server error' } }, { status: 500 });
  if (mode === 'locate') return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here it is:\n```json\n{"name":"Terminal B","within":"George Bush Intercontinental Airport","address":"","city":"Houston","lat":29.9902,"lon":-95.3368}\n```', annotations: [] }] }] });
  if (mode === 'locate-none') return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'I could not find that place.', annotations: [] }] }] });
  return Response.json(reply);
};
const { default: handler, parseSearch } = await import('../api/search.js');
const res = () => { const r = { code: 200, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader() {} }; return r; };
const p = parseSearch(reply); assert.equal(p.sources.length, 2, 'citations de-duplicated'); assert.equal(p.sources[0].site, 'en.wikipedia.org'); assert.ok(!p.sources[0].url.includes('utm_source'));
let r = res(); await handler({ method: 'POST', headers: {}, body: { query: 'How tall is JPMorgan Chase Tower Houston' } }, r);
assert.equal(r.code, 200); assert.match(r.body.answer, /1,002/); assert.equal(sent[0].tools[0].type, 'web_search'); assert.equal(sent[0].tool_choice, 'required'); assert.equal(sent[0].store, false);
mode = 'old-tool'; sent.length = 0; r = res(); await handler({ method: 'POST', headers: {}, body: { query: 'tower height' } }, r);
assert.equal(r.code, 200); assert.deepEqual(sent.map(b => b.tools[0].type), ['web_search', 'web_search_preview'], 'falls back to the preview tool name');
mode = 'down'; r = res(); await handler({ method: 'POST', headers: {}, body: { query: 'tower height' } }, r); assert.equal(r.code, 502);
r = res(); await handler({ method: 'POST', headers: {}, body: { query: 'x' } }, r); assert.equal(r.code, 400);
r = res(); await handler({ method: 'GET', headers: {} }, r); assert.equal(r.code, 405);
// the Houston location bias only applies while the user is looking at the home region
assert.ok(sent.some(b => b.tools[0].user_location?.city === 'Houston'), 'local by default');
mode = 'ok'; sent.length = 0; r = res(); await handler({ method: 'POST', headers: {}, body: { query: 'what is being built in Lyon', local: false } }, r);
assert.ok(sent.length && sent.every(b => !b.tools[0].user_location), 'no Houston bias for a question about elsewhere');
// locate: where a place is, as JSON the map checks against OpenStreetMap
const { parseLocate } = await import('../api/search.js');
mode = 'locate'; sent.length = 0; r = res(); await handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' }, body: { mode: 'locate', query: 'Terminal B at George Bush airport' } }, r);
assert.equal(r.code, 200); assert.equal(r.body.name, 'Terminal B'); assert.equal(r.body.within, 'George Bush Intercontinental Airport'); assert.equal(r.body.lat, 29.9902);
assert.match(sent[0].instructions, /ONLY a JSON object/); assert.equal(sent[0].tool_choice, 'required');
mode = 'locate-none'; r = res(); await handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' }, body: { mode: 'locate', query: 'Nowhere Plaza' } }, r); assert.equal(r.code, 404);
assert.deepEqual(parseLocate('{"name":"X","lat":"abc","lon":null}'), { name: 'X', within: '', address: '', city: '', lat: null, lon: null });
assert.equal(parseLocate('{"name":"","lat":0,"lon":0}'), null, 'no name and null-island coordinates is nothing'); assert.equal(parseLocate('not json {'), null);
assert.equal(parseLocate('{"name":"X","lat":95,"lon":10}').lat, null, 'impossible coordinates are dropped');
mode = 'ok';
// the tool is for explicit requests and for current facts about places the filings don't cover, never for map data
const { TOOLS, systemPrompt } = await import('../lib/agent-tools.mjs');
const wd = TOOLS.find(t => t.name === 'web_search').description;
assert.match(wd, /ONLY call this when the user explicitly asks/); assert.match(wd, /places outside the filings data/); assert.match(wd, /Never call it for map data/);
assert.match(systemPrompt(), /when the user asks you to .*or for current facts about places the filings don't cover/);
assert.match(systemPrompt(), /The map covers the whole world/); assert.match(systemPrompt(), /never pick one yourself/);
console.log('search tests passed');
