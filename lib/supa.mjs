// Minimal Supabase (PostgREST) client for the data pipeline. Two ways in:
//   1. SUPABASE_URL + SUPABASE_SECRET_KEY (sb_secret_...) or SUPABASE_SERVICE_ROLE_KEY (legacy JWT): direct
//   2. SUPABASE_URL inside GitHub Actions with `id-token: write` and no key: through the `pipeline` edge function,
//      authenticated by the workflow's GitHub OIDC token (no stored secret).
import { canMintToken, idToken } from './oidc.mjs';

export function supa(env = process.env) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, ''), key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !(key || canMintToken(env))) return null;
  const headers = key ? { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}) } : null;
  const send = async (path, opts) => {
    if (headers) return fetch(url + '/rest/v1/' + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    const prefer = opts.headers && opts.headers.Prefer;
    return fetch(url + '/functions/v1/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-github-oidc': await idToken(undefined, env) },
      body: JSON.stringify({ method: opts.method || 'GET', path, body: opts.body === undefined ? undefined : JSON.parse(opts.body), prefer }) });
  };

  // Postgres text and jsonb refuse NUL (\u0000); TDLR text occasionally carries one. Strip it from every value we write.
  const clean = rows => JSON.stringify(rows, (k, v) => typeof v === 'string' && v.includes('\u0000') ? v.replace(/\u0000/g, '') : v);
  // opts.deadline (epoch ms): the caller's time budget (an API function must answer before Vercel stops it); attempts are cut
  // off at the deadline and no retry starts that can't finish in time. A statement timeout (Postgres 57014) is never
  // retried: the same query would time out again. Such errors carry .timeout = true.
  async function req(path, opts = {}, tries = 5) {
    const { deadline, ...o } = opts, what = 'supabase ' + (o.method || 'GET') + ' ' + path.split('?')[0] + ': ';
    const late = () => Object.assign(new Error(what + 'timed out'), { timeout: true });
    for (let i = 0; ; i++) {
      let r, err, body = '';
      const left = deadline ? deadline - Date.now() : null; if (left != null && left < 50) throw late();
      try { r = await send(path, left != null ? { ...o, signal: AbortSignal.timeout(left) } : o); } catch (e) { err = e; if (left != null && /abort|timeout/i.test(e.name + e.message) && Date.now() >= deadline - 60) throw late(); }
      if (r && r.ok) { const t = await r.text(); return t ? JSON.parse(t) : null; }
      if (r) body = (await r.text()).slice(0, 300);
      const stmt = /57014|statement timeout/.test(body);
      if (stmt) throw Object.assign(new Error(what + r.status + ' ' + body), { timeout: true });
      const transient = !r || r.status === 429 || r.status >= 500, wait = 1000 * 2 ** i;
      if (!transient || i >= tries - 1 || (deadline && Date.now() + wait + 500 > deadline)) throw new Error(what + (r ? r.status + ' ' + body : err.message));
      await new Promise(res => setTimeout(res, wait));
    }
  }
  return {
    via: headers ? 'key' : 'github-oidc',
    select: (table, query = '', { deadline } = {}) => req(table + (query ? '?' + query : ''), { deadline }),
    // all rows matching query, paged (PostgREST caps responses at 1000 rows by default)
    async selectAll(table, query = '', page = 1000) {
      const out = [];
      for (let off = 0; ; off += page) {
        const rows = await req(table + '?' + query + (query ? '&' : '') + 'limit=' + page + '&offset=' + off);
        out.push(...rows); if (rows.length < page) return out;
      }
    },
    async upsert(table, rows, onConflict, chunk = 500) {
      for (let i = 0; i < rows.length; i += chunk)
        await req(table + (onConflict ? '?on_conflict=' + onConflict : ''), { method: 'POST', body: clean(rows.slice(i, i + chunk)), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    },
    async insert(table, rows, chunk = 500) {
      for (let i = 0; i < rows.length; i += chunk) await req(table, { method: 'POST', body: clean(rows.slice(i, i + chunk)), headers: { Prefer: 'return=minimal' } });
    },
    async insertOne(table, row) { return (await req(table, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }))[0]; },
    update: (table, query, patch) => req(table + '?' + query, { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' } }),
    rpc: (fn, args, { deadline } = {}) => req('rpc/' + fn, { method: 'POST', body: JSON.stringify(args), deadline }),
    // cache helpers: { key: data } for the given keys / write a { key: data } map
    async cacheGet(tbl, keys) {
      const out = {};
      for (let i = 0; i < keys.length; i += 2000) Object.assign(out, await req('rpc/cache_get', { method: 'POST', body: JSON.stringify({ tbl, keys: keys.slice(i, i + 2000) }) }));
      return out;
    },
    cachePut(tbl, map) {
      const at = new Date().toISOString().slice(0, 10);
      return this.upsert(tbl, Object.entries(map).map(([k, data]) => ({ k, data, at })), 'k');
    }
  };
}
