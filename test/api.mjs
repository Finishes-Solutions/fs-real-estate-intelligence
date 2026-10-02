// Offline tests for the Vercel functions with a mocked OpenAI API. Run: node test/fixture.mjs && node test/api.mjs
import assert from 'node:assert/strict';
process.env.DATA_DIR = 'test/.data'; process.env.OPENAI_API_KEY = 'sk-test'; process.env.OPENAI_MODEL = 'gpt-test';
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/models/')) return json({ id: 'gpt-test' });
  if (url.endsWith('/chat/completions')) {
    const b = JSON.parse(opts.body);
    if (b.response_format?.json_schema?.name === 'map_filters') {
      const q = b.messages[1].content;
      const base = { intent: 'filter', counties: null, types: null, uses: null, min_value: null, max_value: null, keywords: null, developer: null, date_field: null, date_from: null, date_to: null, near_place: null, near_miles: null, changed: null, keep_current: false, note: 'ok' };
      const out = /weather/.test(q) ? { ...base, intent: 'unrelated', note: 'Not about filings.' }
        : { ...base, uses: ['Medical'], min_value: 2e6, developer: 'Hines', date_field: 'start', date_from: '2026-01', date_to: 'bad', near_place: 'Katy', near_miles: 500 };
      return json({ choices: [{ message: { content: JSON.stringify(out) } }], usage: {} });
    }
    return json({ choices: [{ message: { content: 'Answer citing [TABS1].' } }] });
  }
  return realFetch(url, opts);
};
function mockRes() { const r = { code: 200, headers: {}, body: null, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, send(s) { r.body = s; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; }
const req = (o) => ({ method: 'POST', headers: { host: 'x.test', 'x-forwarded-for': o.ip || '1.1.1.1' }, query: {}, url: '/', ...o });

const ask = (await import('../api/ask.js')).default;
let res = mockRes(); await ask(req({ body: { phase: 'filter', question: 'medical over 2M by Hines near Katy starting 2026', current: { c: ['Harris'] } } }), res);
assert.equal(res.code, 200, JSON.stringify(res.body));
assert.deepEqual(res.body.spec.u, ['Medical']); assert.equal(res.body.spec.min, 2000000);
assert.equal(res.body.spec.who?.k, 'dev'); assert.equal(res.body.spec.who.v, 'hines interests');
assert.deepEqual(res.body.spec.d, { f: 'start', from: '2026-01', to: '' }, 'invalid month dropped');
assert.equal(res.body.place.mi, 60, 'radius clamped'); assert.equal(res.body.spec.c, undefined, 'keep_current=false starts fresh');
res = mockRes(); await ask(req({ body: { phase: 'filter', question: 'what is the weather' }, ip: '2.2.2.2' }), res);
assert.equal(res.body.intent, 'unrelated');
res = mockRes(); await ask(req({ body: { phase: 'answer', question: 'q', summary: { count: 1 }, rows: Array(50).fill({ id: 'X', name: 'y'.repeat(999) }) }, ip: '3.3.3.3' }), res);
assert.equal(res.body.answer, 'Answer citing [TABS1].');
const sent = calls.filter(c => c.url.endsWith('/chat/completions')).pop().body.messages[1].content;
assert.ok(!sent.includes('y'.repeat(201)), 'row strings clipped'); assert.equal((sent.match(/"id":"X"/g) || []).length, 30, 'rows capped at 30');
res = mockRes(); await ask(req({ body: { question: '' }, ip: '4.4.4.4' }), res); assert.equal(res.code, 400);
res = mockRes(); await ask(req({ method: 'GET', ip: '4.4.4.5' }), res); assert.equal(res.code, 405);
res = mockRes(); await ask(req({ headers: { host: 'x.test', origin: 'https://evil.test', 'x-forwarded-for': '5.5.5.5' }, body: { question: 'hi' } }), res); assert.equal(res.code, 403);
let last; for (let i = 0; i < 8; i++) { last = mockRes(); await ask(req({ body: { phase: 'filter', question: 'medical' }, ip: '9.9.9.9' }), last); }
assert.equal(last.code, 429, 'rate limited');

const brief = (await import('../api/brief.js')).default;
const data = JSON.parse(await (await import('node:fs/promises')).readFile('test/.data/filings.json', 'utf8'));
res = mockRes(); await brief(req({ method: 'GET', query: { id: data.filings[0].id }, ip: '6.6.6.6' }), res);
assert.equal(res.code, 200, JSON.stringify(res.body)); assert.ok(res.body.brief); assert.match(res.headers['Cache-Control'], /s-maxage/);
const facts = JSON.parse(calls.filter(c => c.url.endsWith('/chat/completions')).pop().body.messages[1].content);
assert.ok(facts.filing.id && facts.nearby2mi && 'tract' in facts); assert.equal(facts.filing.lat, undefined);
res = mockRes(); await brief(req({ method: 'GET', query: { id: '../etc' }, ip: '6.6.6.7' }), res); assert.equal(res.code, 400);
res = mockRes(); await brief(req({ method: 'GET', query: { id: 'TABSNOPE' }, ip: '6.6.6.8' }), res); assert.equal(res.code, 404);

const feed = (await import('../api/feed.js')).default;
res = mockRes(); await feed(req({ method: 'GET', url: '/api/feed?c=Harris&u=Medical&min=1000000' }), res);
assert.equal(res.code, 200); assert.match(res.headers['Content-Type'], /rss/);
const items = (res.body.match(/<item>/g) || []).length, expect = data.filings.filter(f => f.county === 'Harris' && f.use === 'Medical' && f.cost >= 1e6).length;
assert.equal(items, Math.min(100, expect), 'feed matches filter'); assert.ok(!/<script/i.test(res.body));
console.log('api tests passed:', calls.length, 'mocked calls, feed items', items);
