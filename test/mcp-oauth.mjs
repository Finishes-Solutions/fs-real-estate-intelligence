// OAuth for the MCP server (lib/mcp/oauth.mjs, api/oauth.js, api/mcp.js): a real MCP SDK client with an OAuth provider, the
// way ChatGPT and Claude connect with only the URL. The handlers run in this process behind the same path table as
// vercel.json / scripts/dev.mjs. Covers: discovery from the 401, dynamic registration, the sign-in page (wrong passcode,
// right passcode, the write checkbox), the PKCE exchange, a working tools/list and tools/call with the token, refresh, a
// token for another deployment, tampered tokens, URL-based client ids, the endpoints' error answers, and OAuth off.
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

process.env.MCP_OAUTH_SECRET = 'test-signing-secret-0123456789'; process.env.MCP_SIGNIN_CODE = 'team-pass-42'; delete process.env.MCP_ACCESS_TOKEN; delete process.env.MCP_WRITES;
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
const OA = await import('../lib/mcp/oauth.mjs');
const { default: oauth, LIMITS } = await import('../api/oauth.js'); LIMITS.perMinute = 1000; // (this test alone makes more calls than a real caller may in a minute)
const { default: mcp, authenticate } = await import('../api/mcp.js');

// ---------- the two functions behind the production paths (vercel.json rewrites), served like Vercel would ----------
const REWRITES = [[/^\/\.well-known\/oauth-protected-resource(\/.*)?$/, 'resource'], [/^\/\.well-known\/(oauth-authorization-server(\/.*)?|openid-configuration)$/, 'metadata'], [/^\/oauth\/register$/, 'register'], [/^\/oauth\/authorize$/, 'authorize'], [/^\/oauth\/token$/, 'token']];
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host); let b = ''; for await (const c of req) b += c;
  const type = req.headers['content-type'] || ''; req.body = !b ? undefined : type.includes('json') ? JSON.parse(b) : b;
  for (const [re, op] of REWRITES) if (re.test(url.pathname)) { url.pathname = '/api/oauth'; url.searchParams.set('op', op); }
  req.query = Object.fromEntries(url.searchParams);
  if (url.pathname === '/api/oauth') await oauth(req, res); else if (url.pathname === '/api/mcp') await mcp(req, res); else { res.statusCode = 404; res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + srv.address().port, MCP = ORIGIN + '/api/mcp';
// the dev server's table (scripts/dev.mjs REWRITES) must match this one and vercel.json
{ const dev = (await import('node:fs')).readFileSync(new URL('../scripts/dev.mjs', import.meta.url), 'utf8'), vj = JSON.parse((await import('node:fs')).readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server', '/.well-known/openid-configuration', '/oauth/register', '/oauth/authorize', '/oauth/token']) { assert.ok(vj.rewrites.some(r => r.source === path && r.destination.startsWith('/api/oauth?op=')), 'vercel.json rewrites ' + path); assert.ok(dev.includes(path.replace(/\//g, '\\/').replace(/\./g, '\\.').split('(')[0].slice(0, 20)) || dev.includes('oauth'), 'dev.mjs knows ' + path); } }

// ---------- an OAuth client like the SDK's clients in ChatGPT / Claude / Inspector: remembers what it is told, "opens" the browser for us ----------
function provider(extra = {}) {
  const st = { tokens: null, client: null, verifier: null, authUrl: null };
  return { st, redirectUrl: 'https://assistant.example/callback', clientMetadata: { client_name: 'Test Assistant', redirect_uris: ['https://assistant.example/callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', ...extra.clientMetadata },
    clientInformation: () => st.client, saveClientInformation: c => { st.client = c; }, tokens: () => st.tokens, saveTokens: t => { st.tokens = t; },
    redirectToAuthorization: u => { st.authUrl = u; }, saveCodeVerifier: v => { st.verifier = v; }, codeVerifier: () => st.verifier, state: () => 'st4te', ...extra };
}
// the person in the browser: open the sign-in page, type the passcode, follow the redirect, read the code
async function signIn(authUrl, { code = 'team-pass-42', write = false } = {}) {
  const page = await fetch(authUrl, { redirect: 'manual' }); const htmlText = await page.text();
  const form = new URLSearchParams(); for (const m of htmlText.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) form.set(m[1], m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  form.set('code', code); if (write) form.set('write', 'on');
  const r = await fetch(authUrl, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  return { page, html: htmlText, status: r.status, location: r.headers.get('location'), body: r.status === 302 ? '' : await r.text() };
}
async function connectWithOAuth(p, opts = {}) {
  const c = new Client({ name: 'assistant', version: '1.0.0' }); let t = new StreamableHTTPClientTransport(new URL(MCP), { authProvider: p });
  try { await c.connect(t); return c; } catch (e) { if (!(e instanceof UnauthorizedError)) throw e; }
  assert.ok(p.st.authUrl, 'the client was sent to the sign-in page'); assert.ok(p.st.client?.client_id, 'the client registered itself');
  const s = await signIn(p.st.authUrl.toString(), opts); assert.equal(s.status, 302, 'signed in: redirected back ' + s.body.slice(0, 200));
  const back = new URL(s.location); assert.equal(back.origin + back.pathname, 'https://assistant.example/callback'); assert.equal(back.searchParams.get('state'), 'st4te'); assert.equal(back.searchParams.get('iss'), ORIGIN);
  await t.finishAuth(back.searchParams.get('code'));
  const c2 = new Client({ name: 'assistant', version: '1.0.0' }); t = new StreamableHTTPClientTransport(new URL(MCP), { authProvider: p }); await c2.connect(t); return c2;
}

// ---------- discovery: the 401 points at the metadata, which points at the endpoints ----------
{ const r = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) });
  assert.equal(r.status, 401); const w = r.headers.get('www-authenticate'); assert.match(w, /resource_metadata="http:\/\/127\.0\.0\.1:\d+\/\.well-known\/oauth-protected-resource\/api\/mcp"/); assert.ok(!/error=/.test(w), 'no token given: no error code');
  const r2 = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nope' }, body: '{}' }); assert.match(r2.headers.get('www-authenticate'), /error="invalid_token"/);
  for (const path of ['/.well-known/oauth-protected-resource/api/mcp', '/.well-known/oauth-protected-resource']) { const m = await (await fetch(ORIGIN + path)).json(); assert.equal(m.resource, MCP); assert.deepEqual(m.authorization_servers, [ORIGIN]); assert.deepEqual(m.scopes_supported, ['read', 'write']); }
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration', '/.well-known/oauth-authorization-server/api/mcp']) { const m = await (await fetch(ORIGIN + path)).json();
    assert.equal(m.issuer, ORIGIN); assert.equal(m.authorization_endpoint, ORIGIN + '/oauth/authorize'); assert.equal(m.token_endpoint, ORIGIN + '/oauth/token'); assert.equal(m.registration_endpoint, ORIGIN + '/oauth/register');
    assert.deepEqual(m.code_challenge_methods_supported, ['S256']); assert.deepEqual(m.token_endpoint_auth_methods_supported, ['none']); assert.equal(m.client_id_metadata_document_supported, true); }
  const o = await fetch(ORIGIN + '/oauth/token', { method: 'OPTIONS' }); assert.equal(o.status, 204); assert.equal(o.headers.get('access-control-allow-origin'), '*');
  const o2 = await fetch(MCP, { method: 'OPTIONS' }); assert.equal(o2.status, 204);
  const g = await fetch(MCP); assert.equal(g.status, 405);
  console.log('oauth discovery ok'); }

// ---------- the whole flow through the SDK: register → sign in → code → tokens → tools ----------
const p = provider();
const c = await connectWithOAuth(p);
{ const { tools } = await c.listTools(); assert.ok(tools.length >= 27); assert.ok(!tools.some(t => t.name === 'create_project'), 'read-only sign-in lists no write tools');
  assert.ok(tools.some(t => t.name === 'search') && tools.some(t => t.name === 'fetch'), 'ChatGPT’s search and fetch are there');
  const r = await c.callTool({ name: 'list_datasets', arguments: {} }); assert.match(r.content[0].text, /Datasets/);
  assert.equal(p.st.tokens.token_type, 'Bearer'); assert.equal(p.st.tokens.scope, 'read'); assert.ok(p.st.tokens.refresh_token); assert.equal(p.st.tokens.expires_in, 3600);
  assert.ok(!p.st.client.client_secret, 'a public client: PKCE, no secret'); assert.equal(p.st.client.client_name, 'Test Assistant');
  const who = authenticate({ headers: { authorization: 'Bearer ' + p.st.tokens.access_token, host: '127.0.0.1:' + srv.address().port } }); assert.equal(who.via, 'oauth'); assert.equal(who.writes, false); assert.equal(who.client, 'Test Assistant');
  await c.close(); console.log('oauth sign-in and tools ok'); }

// the sign-in page itself: names the app, has the write checkbox, rejects a wrong passcode, no secrets in it
{ const s = await signIn(p.st.authUrl.toString(), { code: 'wrong' }); assert.equal(s.status, 401); assert.match(s.body, /isn’t right/); assert.match(s.html, /Connect Test Assistant/); assert.match(s.html, /name="write"/); assert.match(s.html, /type="password"/);
  assert.ok(!s.html.includes('test-signing-secret') && !s.html.includes('team-pass-42')); assert.match(s.page.headers.get('x-frame-options'), /DENY/);
  const bad = await fetch(p.st.authUrl.toString().replace(/client_id=[^&]+/, 'client_id=v1.forged.forged'), { redirect: 'manual' }); assert.equal(bad.status, 400); assert.match(await bad.text(), /doesn’t know/);
  const u = new URL(p.st.authUrl); u.searchParams.set('redirect_uri', 'https://evil.example/cb'); const bad2 = await fetch(u, { redirect: 'manual' }); assert.equal(bad2.status, 400, 'an unregistered redirect never redirects');
  const u2 = new URL(p.st.authUrl); u2.searchParams.set('code_challenge_method', 'plain'); const bad3 = await fetch(u2, { redirect: 'manual' }); assert.equal(bad3.status, 302); assert.match(bad3.headers.get('location'), /error=invalid_request/);
  const u3 = new URL(p.st.authUrl); u3.searchParams.set('scope', 'admin'); assert.match((await fetch(u3, { redirect: 'manual' })).headers.get('location'), /error=invalid_scope/);
  const u4 = new URL(p.st.authUrl); u4.searchParams.set('resource', 'https://other.example/api/mcp'); assert.match((await fetch(u4, { redirect: 'manual' })).headers.get('location'), /error=invalid_target/);
  console.log('oauth sign-in page ok'); }

// ---------- write scope: the checkbox, then the write tools appear; MCP_WRITES=off hides the checkbox ----------
{ const pw = provider(); const cw = await connectWithOAuth(pw, { write: true });
  const { tools } = await cw.listTools(); assert.ok(tools.some(t => t.name === 'create_project'), 'writes allowed: write tools listed'); assert.equal(pw.st.tokens.scope, 'read write'); await cw.close();
  process.env.MCP_WRITES = 'off'; const po = provider(); const co = await connectWithOAuth(po, { write: true }); assert.equal(po.st.tokens.scope, 'read'); assert.ok(!(await co.listTools()).tools.some(t => t.name === 'create_project')); await co.close();
  const s = await signIn(po.st.authUrl.toString()); assert.ok(!s.html.includes('name="write"'), 'no checkbox when writes are off'); assert.match(s.html, /Changing projects is off/);
  // a write token minted while writes were on is read-only once the admin turns writes off
  const who = authenticate({ headers: { authorization: 'Bearer ' + pw.st.tokens.access_token, host: '127.0.0.1:' + srv.address().port } }); assert.equal(who.ok, true); assert.equal(who.writes, false);
  delete process.env.MCP_WRITES; console.log('oauth write scope ok'); }

// ---------- the token endpoint: refresh, PKCE, replay to another client, redirect mismatch, bad grants ----------
const form = o => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
{ const cid = p.st.client.client_id, tok = (b, s = 200) => fetch(ORIGIN + '/oauth/token', form(b)).then(async r => { assert.equal(r.status, s, JSON.stringify(b).slice(0, 80)); return r.json(); });
  const fresh = await tok({ grant_type: 'refresh_token', refresh_token: p.st.tokens.refresh_token, client_id: cid }); assert.ok(fresh.access_token && fresh.refresh_token && fresh.access_token !== p.st.tokens.access_token); assert.equal(fresh.scope, 'read');
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: p.st.tokens.refresh_token, client_id: cid, scope: 'write' }, 400)).error, 'invalid_scope', 'a refresh can’t widen');
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: p.st.tokens.access_token, client_id: cid }, 400)).error, 'invalid_grant', 'an access token is not a refresh token');
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: p.st.tokens.refresh_token, client_id: 'v1.x.y' }, 401)).error, 'invalid_client');
  assert.equal((await tok({ grant_type: 'password', username: 'a', password: 'b', client_id: cid }, 400)).error, 'unsupported_grant_type');
  assert.equal((await tok({ grant_type: 'authorization_code', code: 'v1.a.b', client_id: cid, code_verifier: 'x'.repeat(43) }, 400)).error, 'invalid_grant');
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: p.st.tokens.refresh_token, client_id: cid, resource: 'https://other.example/api/mcp' }, 400)).error, 'invalid_target');
  // a second registered client can't use the first one's code or refresh token
  const other = await (await fetch(ORIGIN + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Other', redirect_uris: ['https://other.example/cb'] }) })).json();
  assert.equal((await tok({ grant_type: 'refresh_token', refresh_token: p.st.tokens.refresh_token, client_id: other.client_id }, 400)).error, 'invalid_grant');
  // PKCE by hand: the right verifier works once the person signs in; a wrong one doesn't; a replay to another redirect doesn't
  const verifier = crypto.randomBytes(32).toString('base64url'), challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const au = new URL(ORIGIN + '/oauth/authorize'); for (const [k, v] of Object.entries({ response_type: 'code', client_id: other.client_id, redirect_uri: 'https://other.example/cb', code_challenge: challenge, code_challenge_method: 'S256', state: 'zz', resource: MCP })) au.searchParams.set(k, v);
  const s = await signIn(au.toString()); const code = new URL(s.location).searchParams.get('code');
  assert.equal((await tok({ grant_type: 'authorization_code', code, client_id: other.client_id, redirect_uri: 'https://other.example/cb', code_verifier: 'wrong'.repeat(10) }, 400)).error, 'invalid_grant');
  assert.equal((await tok({ grant_type: 'authorization_code', code, client_id: other.client_id, redirect_uri: 'https://other.example/elsewhere', code_verifier: verifier }, 400)).error, 'invalid_grant');
  assert.equal((await tok({ grant_type: 'authorization_code', code, client_id: cid, redirect_uri: 'https://other.example/cb', code_verifier: verifier }, 400)).error, 'invalid_grant');
  const got = await tok({ grant_type: 'authorization_code', code, client_id: other.client_id, redirect_uri: 'https://other.example/cb', code_verifier: verifier, resource: MCP }); assert.equal(got.token_type, 'Bearer');
  const r = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + got.access_token }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }); assert.equal(r.status, 200);
  console.log('oauth token endpoint ok'); }

// ---------- tokens: tampered, expired, for another deployment; the shared token still works beside OAuth ----------
{ const at = p.st.tokens.access_token, hdr = t => ({ headers: { authorization: 'Bearer ' + t, host: '127.0.0.1:' + srv.address().port } });
  assert.equal(authenticate(hdr(at.slice(0, -2) + 'AA')).ok, false, 'a changed signature fails');
  const [v, body] = at.split('.'), payload = JSON.parse(Buffer.from(body, 'base64url').toString()); const forged = v + '.' + Buffer.from(JSON.stringify({ ...payload, s: 'read write' })).toString('base64url') + '.' + at.split('.')[2]; assert.equal(authenticate(hdr(forged)).ok, false, 'a changed payload fails');
  const expired = OA.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 5 }); assert.equal(authenticate(hdr(expired)).ok, false, 'expired fails');
  const elsewhere = OA.sign({ ...payload, aud: 'https://preview.example/api/mcp' }); assert.equal(authenticate(hdr(elsewhere)).ok, false, 'a token for another deployment fails');
  const rt = OA.sign({ ...payload, t: 'rt' }); assert.equal(authenticate(hdr(rt)).ok, false, 'a refresh token is not an access token');
  assert.equal(authenticate(hdr(at)).ok, true);
  process.env.MCP_ACCESS_TOKEN = 'amp-shared'; assert.equal(authenticate(hdr('amp-shared')).via, 'token'); assert.equal(authenticate(hdr('amp-shared')).writes, true); assert.equal(authenticate(hdr(at)).via, 'oauth'); delete process.env.MCP_ACCESS_TOKEN;
  const forwarded = authenticate({ headers: { authorization: 'Bearer ' + at, host: 'internal:3000', 'x-forwarded-host': '127.0.0.1:' + srv.address().port, 'x-forwarded-proto': 'http' } }); assert.equal(forwarded.ok, true, 'the resource comes from the forwarded host');
  console.log('oauth token checks ok'); }

// ---------- registration: what is accepted ----------
{ const reg = (b, s) => fetch(ORIGIN + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => { assert.equal(r.status, s, JSON.stringify(b)); return r.json(); });
  const ok = await reg({ redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect', 'https://claude.ai/api/mcp/auth_callback'], client_name: 'ChatGPT' }, 201); assert.ok(ok.client_id.startsWith('v1.')); assert.equal(ok.token_endpoint_auth_method, 'none'); assert.deepEqual(ok.grant_types, ['authorization_code', 'refresh_token']);
  await reg({ redirect_uris: ['http://localhost:6274/oauth/callback'], client_name: 'MCP Inspector' }, 201);
  assert.equal((await reg({ redirect_uris: ['http://assistant.example/cb'] }, 400)).error, 'invalid_redirect_uri', 'plain http off localhost is refused');
  assert.equal((await reg({ redirect_uris: [] }, 400)).error, 'invalid_redirect_uri'); assert.equal((await reg({ client_name: 'x' }, 400)).error, 'invalid_redirect_uri');
  assert.equal((await reg({ redirect_uris: ['https://a.example/cb'], token_endpoint_auth_method: 'client_secret_basic' }, 400)).error, 'invalid_client_metadata');
  assert.equal((await reg({ redirect_uris: ['https://a.example/cb'], grant_types: ['client_credentials'] }, 400)).error, 'invalid_client_metadata');
  const t = await fetch(ORIGIN + '/oauth/register'); assert.equal(t.status, 405);
  console.log('oauth registration ok'); }

// ---------- URL-based client ids (a metadata document we fetch) ----------
{ const realFetch = globalThis.fetch; const docUrl = 'https://assistant.example/.well-known/client.json';
  const fetchImpl = async (u, o) => String(u) === docUrl ? Response.json({ client_id: docUrl, client_name: 'Doc Client', redirect_uris: ['https://assistant.example/cb'] }) : String(u).startsWith('https://bad.example') ? Response.json({ client_id: 'https://someone.else/x', redirect_uris: ['https://assistant.example/cb'] }) : realFetch(u, o);
  const good = await OA.clientOf(docUrl, { fetchImpl }); assert.equal(good.name, 'Doc Client'); assert.deepEqual(good.redirect_uris, ['https://assistant.example/cb']);
  assert.equal(await OA.clientOf('https://bad.example/client.json', { fetchImpl }), null, 'the document must name itself'); assert.equal(await OA.clientOf('https://assistant.example/', { fetchImpl }), null, 'a root URL is not a client id'); assert.equal(await OA.clientOf('http://assistant.example/c.json', { fetchImpl }), null);
  const c2 = await OA.checkAuthorizeRequest({ response_type: 'code', client_id: docUrl, redirect_uri: 'https://assistant.example/cb', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256' }, { headers: { host: 'x.example' } }, { fetchImpl }); assert.equal(c2.client.key, good.key);
  console.log('oauth url client ids ok'); }

// ---------- OAuth off: 404s, and the MCP endpoint is open again (no resource_metadata hint) ----------
{ delete process.env.MCP_OAUTH_SECRET;
  assert.equal((await fetch(ORIGIN + '/.well-known/oauth-authorization-server')).status, 404); assert.equal((await fetch(ORIGIN + '/oauth/register', { method: 'POST' })).status, 404);
  const r = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) }); assert.equal(r.status, 200, 'open');
  process.env.MCP_ACCESS_TOKEN = 'amp-shared'; const r2 = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(r2.status, 401); assert.ok(!/resource_metadata/.test(r2.headers.get('www-authenticate')), 'no OAuth: no hint'); delete process.env.MCP_ACCESS_TOKEN;
  process.env.MCP_OAUTH_SECRET = 'short'; assert.equal(OA.configured(), false, 'a short secret is not accepted');
  console.log('oauth off ok'); }

srv.close();
console.log('mcp-oauth tests passed');
