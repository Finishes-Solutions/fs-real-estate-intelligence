// Preload (after test/mock-net.mjs): an in-memory PostgREST for SUPABASE_URL=http://supa.test, persisted to $MOCK_DB between runs.
import fs from 'node:fs';
const FILE = process.env.MOCK_DB, db = FILE && fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const save = () => FILE && fs.writeFileSync(FILE, JSON.stringify(db));
const PK = { counties: 'fips', filings: 'id', geocode_cache: 'k', runs: 'id', changes: 'id' };
const json = (o, s = 200) => new Response(o === null ? null : JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const DEFAULTS = { counties: { status: 'todo', priority: 1000 }, filings: { first_seen: 'now', approx: false, misfiled: false } };
function match(row, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    const [op, ...rest] = v.split('.'), val = rest.join('.'), x = row[k] == null ? null : String(row[k]);
    if (op === 'eq' && x !== val) return false; if (op === 'neq' && x === val) return false;
    if (op === 'gte' && !(x != null && x >= val)) return false; if (op === 'lte' && !(x != null && x <= val)) return false;
  }
  return true;
}
const inner = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.host === 'www2.census.gov') return new Response('NAME\tINTPTLAT\tINTPTLONG\nWaller city\t30.0566\t-95.9269\n');
  if (u.host === 'oidc.test') return json({ value: 'github-oidc-test-token' });
  if (u.host === 'site.test' && u.pathname === '/api/pipeline-ai') { // the site's AI proxy -> mocked OpenAI
    if (opts.headers['x-github-oidc'] !== 'github-oidc-test-token') return json({ error: 'unauthorized' }, 401);
    globalThis.__proxyCalls = (globalThis.__proxyCalls || 0) + 1;
    const items = JSON.parse(opts.body).items;
    return json({ data: { items: items.map(x => ({ id: x.id, use: 'Retail', subtype: '', tenant: '', developer: 'Proxy Dev', architect: '', gc: '', units: null, summary: 'Via proxy.' })) }, usage: { prompt_tokens: 7, completion_tokens: 3 } });
  }
  if (u.host !== 'supa.test') return inner(url, opts);
  if (u.pathname === '/functions/v1/pipeline') { // edge function: OIDC header in, PostgREST call out
    if (opts.headers['x-github-oidc'] !== 'github-oidc-test-token') return json({ error: 'unauthorized' }, 401);
    const b = JSON.parse(opts.body);
    return globalThis.fetch('http://supa.test/rest/v1/' + b.path, { method: b.method, body: b.body === undefined ? undefined : JSON.stringify(b.body), headers: { apikey: 'service', ...(b.prefer ? { Prefer: b.prefer } : {}) } });
  }
  if (!opts.headers?.apikey) return json({ message: 'no key' }, 401);
  const path = u.pathname.replace('/rest/v1/', ''), method = opts.method || 'GET', p = [...u.searchParams];
  if (path === 'rpc/db_size') return json(+(process.env.MOCK_DB_SIZE || JSON.stringify(db).length));
  if (path === 'rpc/cache_get') { const { tbl, keys } = JSON.parse(opts.body), t = db[tbl] || []; const out = {}; for (const r of t) if (keys.includes(r.k)) out[r.k] = r.data; return json(out); }
  const t = db[path] = db[path] || [];
  if (method === 'GET') {
    let rows = t.filter(r => match(r, p)); const o = u.searchParams.get('order');
    if (o) rows = rows.slice().sort((a, b) => { for (const s of o.split(',')) { const [c, d] = s.split('.'); if (a[c] !== b[c]) return (a[c] < b[c] ? -1 : 1) * (d === 'desc' ? -1 : 1); } return 0; });
    const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1000);
    return json(rows.slice(off, off + lim));
  }
  if (method === 'PATCH') { const patch = JSON.parse(opts.body); t.filter(r => match(r, p)).forEach(r => Object.assign(r, patch)); save(); return json(null, 204); }
  if (method === 'POST') {
    const body = [].concat(JSON.parse(opts.body)), pk = PK[path], up = u.searchParams.get('on_conflict'), out = [];
    // like Postgres: integer columns refuse decimals (cost too while MOCK_COST_BIGINT emulates the pre-cents schema)
    if (path === 'filings') for (const row of body) for (const k of process.env.MOCK_COST_BIGINT ? ['cost', 'sqft', 'units'] : ['sqft', 'units']) if (row[k] != null && !Number.isInteger(row[k])) return json({ code: '22P02', message: `invalid input syntax for type bigint: "${row[k]}"` }, 400);
    for (const row of body) {
      const ex = up && t.find(r => r[pk] === row[pk]);
      if (ex) { Object.assign(ex, row); out.push(ex); continue; }
      const n = { ...(DEFAULTS[path] || {}), ...row }; if (pk === 'id' && n.id == null) n.id = t.length + 1; t.push(n); out.push(n);
    }
    save(); return /representation/.test(opts.headers.Prefer || '') ? json(out, 201) : json(null, 201);
  }
  return json({ message: 'unsupported' }, 400);
};
