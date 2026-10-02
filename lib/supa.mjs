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

  async function req(path, opts = {}, tries = 5) {
    for (let i = 0; ; i++) {
      let r, err;
      try { r = await send(path, opts); } catch (e) { err = e; }
      if (r && r.ok) { const t = await r.text(); return t ? JSON.parse(t) : null; }
      const transient = !r || r.status === 429 || r.status >= 500;
      if (!transient || i >= tries - 1) throw new Error('supabase ' + (opts.method || 'GET') + ' ' + path.split('?')[0] + ': ' + (r ? r.status + ' ' + (await r.text()).slice(0, 300) : err.message));
      await new Promise(res => setTimeout(res, 1000 * 2 ** i));
    }
  }
  return {
    via: headers ? 'key' : 'github-oidc',
    select: (table, query = '') => req(table + (query ? '?' + query : '')),
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
        await req(table + (onConflict ? '?on_conflict=' + onConflict : ''), { method: 'POST', body: JSON.stringify(rows.slice(i, i + chunk)), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    },
    async insert(table, rows, chunk = 500) {
      for (let i = 0; i < rows.length; i += chunk) await req(table, { method: 'POST', body: JSON.stringify(rows.slice(i, i + chunk)), headers: { Prefer: 'return=minimal' } });
    },
    async insertOne(table, row) { return (await req(table, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } }))[0]; },
    update: (table, query, patch) => req(table + '?' + query, { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' } }),
    rpc: (fn, args) => req('rpc/' + fn, { method: 'POST', body: JSON.stringify(args) }),
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
