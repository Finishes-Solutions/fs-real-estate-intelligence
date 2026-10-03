// Write access to the database for the GitHub Actions data workflow, without a stored secret:
// the workflow sends its GitHub OIDC token, this function verifies it (issuer, audience, repository)
// and forwards the request to PostgREST with the service-role key. Only pipeline tables are reachable.
// Body: { method: 'GET'|'POST'|'PATCH', path: 'filings?on_conflict=id', body?: any, prefer?: string }
const ISS = 'https://token.actions.githubusercontent.com';
const REPO = 'finishes-solutions/fs-real-estate-intelligence';
const AUDIENCE = 'fs-real-estate-pipeline';
const TABLES = new Set(['counties', 'filings', 'changes', 'runs', 'geocode_cache', 'rpc/cache_get', 'rpc/db_size',
  'news_articles', 'filing_news', 'imagery_passes', 'weather_daily', 'storm_advisories', 'tracts',
  'crime_incidents', 'rpc/crime_prune', 'rpc/crime_latest']);

const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
let jwks: { keys: JsonWebKey[] & { kid?: string }[] } | null = null, jwksAt = 0;
async function verify(token: string) {
  const [h, p, s] = token.split('.'); if (!s) throw new Error('missing token');
  const head = JSON.parse(new TextDecoder().decode(b64u(h))), claims = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (head.alg !== 'RS256') throw new Error('bad alg');
  // deno-lint-ignore no-explicit-any
  const find = () => jwks && (jwks.keys as any[]).find(k => k.kid === head.kid);
  if (!find() || Date.now() - jwksAt > 36e5) { jwks = await (await fetch(ISS + '/.well-known/jwks')).json(); jwksAt = Date.now(); }
  const jwk = find(); if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(h + '.' + p))) throw new Error('bad signature');
  const now = Date.now() / 1000;
  if (claims.iss !== ISS || claims.exp < now) throw new Error('expired or wrong issuer');
  if (![].concat(claims.aud).includes(AUDIENCE as never)) throw new Error('wrong audience');
  if (String(claims.repository).toLowerCase() !== REPO) throw new Error('wrong repository');
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  try { await verify((req.headers.get('x-github-oidc') || '').trim()); }
  catch (e) { return Response.json({ error: 'unauthorized: ' + (e as Error).message }, { status: 401 }); }
  const { method = 'GET', path = '', body, prefer } = await req.json();
  const table = String(path).split('?')[0];
  if (!TABLES.has(table) || !['GET', 'POST', 'PATCH'].includes(method)) return Response.json({ error: 'not allowed: ' + method + ' ' + table }, { status: 403 });
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/' + path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }
  });
  const t = await r.text();
  return new Response(t && r.status !== 204 ? t : null, { status: r.status, headers: { 'Content-Type': 'application/json' } });
});
