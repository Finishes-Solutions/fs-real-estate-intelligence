// OAuth 2.1 for the MCP server (api/oauth.js, used by api/mcp.js): lets ChatGPT, Claude and other MCP clients connect with
// nothing but the server's URL. The client discovers this app as the authorization server (RFC 9728 protected-resource
// metadata, RFC 8414 server metadata), registers itself (RFC 7591 dynamic registration, or a URL-based client id whose
// metadata document we fetch), sends the person to our sign-in page, where they type the team passcode, and trades the code
// it gets for tokens (PKCE S256, RFC 8707 resource indicator). Everything is stateless: client ids, authorization codes,
// access and refresh tokens are HMAC-signed JSON (MCP_OAUTH_SECRET), so no table is needed and every function instance
// agrees. The trade-off: a token can't be revoked one at a time (rotate MCP_OAUTH_SECRET to revoke them all; access tokens
// last an hour, refresh tokens 30 days).
// On when MCP_OAUTH_SECRET is set and there is a passcode (MCP_SIGNIN_CODE, else the team's FIELD_ACCESS_CODE).
import crypto from 'node:crypto';
import { allow, clientIp } from '../../api/_lib/guard.mjs';

export const SCOPES = ['read', 'write'];
export const ACCESS_TTL = 3600, REFRESH_TTL = 30 * 86400, CODE_TTL = 300;
export const RESOURCE_NAME = 'Finishes Solutions Real Estate Intelligence';
export const signinCode = (env = process.env) => env.MCP_SIGNIN_CODE || env.FIELD_ACCESS_CODE || '';
export const configured = (env = process.env) => !!(env.MCP_OAUTH_SECRET && env.MCP_OAUTH_SECRET.length >= 16 && signinCode(env));
export const writesAllowed = (env = process.env) => env.MCP_WRITES !== 'off';
// sign-in attempts per caller IP: a passcode isn't a password, so brute force is cut off early
export const SIGNIN_LIMIT = { perMinute: 10, perDay: 100 };

// ---------- where this is (the issuer, and the MCP endpoint as the resource) ----------
export function origin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = String(req.headers['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0].trim();
  return proto + '://' + host;
}
export const resourceOf = req => origin(req) + '/api/mcp';
export const resourceMetadataUrl = req => origin(req) + '/.well-known/oauth-protected-resource/api/mcp';
const sameResource = (a, b) => String(a || '').replace(/\/$/, '') === String(b || '').replace(/\/$/, '');

// ---------- signed, stateless tokens: v1.<payload>.<hmac> ----------
const b64u = buf => Buffer.from(buf).toString('base64url');
const mac = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest();
export function sign(payload, secret = process.env.MCP_OAUTH_SECRET) {
  const body = b64u(JSON.stringify(payload)); return 'v1.' + body + '.' + b64u(mac(body, secret));
}
// the payload when the token is ours, of this kind and not expired; else null
export function verify(token, kind, secret = process.env.MCP_OAUTH_SECRET) {
  if (!secret) return null;
  const parts = String(token || '').split('.'); if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const want = mac(parts[1], secret), got = Buffer.from(parts[2], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let p; try { p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!p || p.t !== kind || (p.exp && p.exp < Date.now() / 1000)) return null;
  return p;
}
const now = () => Math.floor(Date.now() / 1000);
const clientKey = id => b64u(crypto.createHash('sha256').update(String(id)).digest()).slice(0, 22);
const same = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

// an access token's claims for a request to the MCP endpoint, or null (bad, expired, or for another deployment)
export function verifyAccess(token, req, env = process.env) {
  const p = verify(token, 'at', env.MCP_OAUTH_SECRET); if (!p) return null;
  if (!sameResource(p.aud, resourceOf(req))) return null;
  return { scope: String(p.s || 'read').split(' ').filter(Boolean), client: p.cid, name: p.n || '' };
}

// ---------- metadata documents ----------
export function serverMetadata(req) {
  const o = origin(req);
  return { issuer: o, authorization_endpoint: o + '/oauth/authorize', token_endpoint: o + '/oauth/token', registration_endpoint: o + '/oauth/register',
    scopes_supported: SCOPES, response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], client_id_metadata_document_supported: true,
    service_documentation: o + '/#mcp' };
}
export const resourceMetadata = req => ({ resource: resourceOf(req), authorization_servers: [origin(req)], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: RESOURCE_NAME });

// ---------- clients: registered (a signed id) or URL-based (a metadata document we fetch) ----------
const isHttps = u => { try { const x = new URL(u); return x.protocol === 'https:'; } catch (e) { return false; } };
const isLoopback = u => { try { const x = new URL(u); return x.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname); } catch (e) { return false; } };
export const validRedirect = u => typeof u === 'string' && u.length <= 2000 && !/[#\s]/.test(u) && (isHttps(u) || isLoopback(u));
const cimdCache = new Map();
export async function clientOf(client_id, { fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const id = String(client_id || ''); if (!id) return null;
  if (id.startsWith('v1.')) { const p = verify(id, 'client', env.MCP_OAUTH_SECRET); return p ? { id, key: clientKey(id), name: p.n || 'an app', redirect_uris: p.r || [] } : null; }
  // SEP-991 URL-based client id: an https URL with a path whose JSON names itself as client_id and lists its redirect_uris
  if (!isHttps(id) || new URL(id).pathname === '/' || id.length > 500) return null;
  const hit = cimdCache.get(id); if (hit && Date.now() - hit.at < 6e5) return hit.info;
  try {
    const r = await fetchImpl(id, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!r.ok) return null;
    const j = await r.json(); if (!j || j.client_id !== id || !Array.isArray(j.redirect_uris) || !j.redirect_uris.length || !j.redirect_uris.every(validRedirect)) return null;
    const info = { id, key: clientKey(id), name: String(j.client_name || new URL(id).hostname).slice(0, 80), redirect_uris: j.redirect_uris.slice(0, 20) };
    cimdCache.set(id, { at: Date.now(), info }); if (cimdCache.size > 500) cimdCache.delete(cimdCache.keys().next().value);
    return info;
  } catch (e) { return null; }
}
// RFC 7591: a public client (no secret; PKCE instead) with its redirect URIs and a name baked into the signed id
export function register(body, env = process.env) {
  const b = body && typeof body === 'object' ? body : {};
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (!uris.length || uris.length > 20 || !uris.every(validRedirect)) return { status: 400, body: { error: 'invalid_redirect_uri', error_description: 'redirect_uris must be 1 to 20 https URLs (or http://localhost for a local tool).' } };
  if (b.token_endpoint_auth_method && b.token_endpoint_auth_method !== 'none') return { status: 400, body: { error: 'invalid_client_metadata', error_description: 'Only public clients are registered here (token_endpoint_auth_method "none", with PKCE).' } };
  const grants = Array.isArray(b.grant_types) && b.grant_types.length ? b.grant_types : ['authorization_code'];
  if (grants.some(g => !['authorization_code', 'refresh_token'].includes(g))) return { status: 400, body: { error: 'invalid_client_metadata', error_description: 'grant_types may hold authorization_code and refresh_token.' } };
  const name = String(b.client_name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'an app', iat = now();
  const client_id = sign({ t: 'client', r: uris, n: name, iat }, env.MCP_OAUTH_SECRET);
  return { status: 201, body: { client_id, client_id_issued_at: iat, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: SCOPES.join(' ') } };
}

// ---------- the authorization request (GET shows the sign-in page, POST checks the passcode and sends the code back) ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const redirectWith = (uri, params) => { const u = new URL(uri); for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v); return u.toString(); };
export function scopesOf(scope, env = process.env) {
  const asked = String(scope || '').split(/[\s,]+/).filter(Boolean);
  if (asked.some(s => !SCOPES.includes(s))) return null;
  return { read: true, write: asked.includes('write') && writesAllowed(env) };
}
// checks the request; returns { client, redirect_uri, ... } or { error, description, redirect_uri? } (no redirect_uri: show the error, never redirect)
export async function checkAuthorizeRequest(q, req, opts = {}) {
  const env = opts.env || process.env;
  const client = await clientOf(q.client_id, opts);
  if (!client) return { error: 'invalid_client', description: 'This sign-in link names an app this server doesn’t know. Ask the app to connect again (it registers itself).' };
  const redirect_uri = q.redirect_uri ? String(q.redirect_uri) : client.redirect_uris.length === 1 ? client.redirect_uris[0] : '';
  if (!client.redirect_uris.includes(redirect_uri)) return { error: 'invalid_request', description: 'The redirect address isn’t one this app registered.' };
  const bad = (error, description) => ({ error, description, redirect_uri, state: q.state });
  if (q.response_type !== 'code') return bad('unsupported_response_type', 'Only response_type=code is supported.');
  if (!q.code_challenge || (q.code_challenge_method || 'plain') !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(String(q.code_challenge))) return bad('invalid_request', 'PKCE with code_challenge_method S256 is required.');
  if (q.resource && !sameResource(q.resource, resourceOf(req))) return bad('invalid_target', 'resource must be ' + resourceOf(req) + '.');
  const scopes = scopesOf(q.scope, env); if (!scopes) return bad('invalid_scope', 'Scopes are read and write.');
  if (q.state && String(q.state).length > 1024) return bad('invalid_request', 'state is too long.');
  return { client, redirect_uri, state: q.state ? String(q.state) : '', code_challenge: String(q.code_challenge), scopes, resource: resourceOf(req) };
}
const FIELDS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];
export function signinPage({ client, scopes, q, message, env = process.env }) {
  const hidden = FIELDS.filter(k => q[k] != null && q[k] !== '').map(k => '<input type="hidden" name="' + k + '" value="' + esc(q[k]) + '">').join('');
  const writeBox = writesAllowed(env) ? '<label class="chk"><input type="checkbox" name="write" value="on"' + (scopes.write ? ' checked' : '') + '> Also let it change projects (start projects, save site plans, change assumptions, budgets and scenarios). Without this it can only read.</label>' : '<p class="muted">Changing projects is off on this server; the app will be able to read.</p>';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Connect to ' + esc(RESOURCE_NAME) + '</title>' +
    '<style>:root{--brand:#006527;--text:#0b0d0c;--muted:#686e71;--line:#dde1e2;--bg:#eef1f1}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font-family:Montserrat,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}' +
    'main{background:#fff;border-radius:16px;box-shadow:0 14px 40px rgba(11,13,12,.16);padding:32px;width:min(460px,calc(100vw - 32px))}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 16px;line-height:1.45}.muted{color:var(--muted);font-size:13px}label{display:block;font-weight:600;font-size:13px;margin:16px 0 6px}' +
    'input[type=password]{font:inherit;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px}.chk{display:flex;gap:10px;align-items:flex-start;font-weight:500;font-size:13px;line-height:1.4;margin:16px 0}.chk input{margin-top:3px;flex:none}' +
    'button{font:inherit;font-weight:600;width:100%;margin-top:8px;padding:12px;border:0;border-radius:8px;background:var(--brand);color:#fff;cursor:pointer}button:hover{background:#004d1e}.err{background:#fdecea;color:#b42318;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:12px}.brand{display:flex;align-items:center;gap:10px;margin-bottom:20px;font-weight:700;color:var(--brand)}.brand b{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--brand)}</style></head><body><main>' +
    '<div class="brand"><b></b>Finishes Solutions</div><h1>Connect ' + esc(client.name) + '</h1>' +
    '<p><strong>' + esc(client.name) + '</strong> wants to use ' + esc(RESOURCE_NAME) + ': Texas property, site, flood, environmental, demographic, market, construction and crime data, and the team’s projects.</p>' +
    (message ? '<div class="err" role="alert">' + esc(message) + '</div>' : '') +
    '<form method="post" autocomplete="off">' + hidden + '<label for="code">Team passcode</label><input id="code" name="code" type="password" required autofocus autocomplete="current-password">' + writeBox +
    '<button type="submit">Connect</button></form><p class="muted" style="margin:16px 0 0">Only people on the team have the passcode. Access lasts until the app disconnects or the team changes the secret.</p></main></body></html>';
}
export function errorPage(title, text) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef1f1;color:#0b0d0c;font-family:Montserrat,system-ui,sans-serif}main{background:#fff;border-radius:16px;padding:32px;width:min(460px,calc(100vw - 32px));box-shadow:0 14px 40px rgba(11,13,12,.16)}h1{font-size:20px;margin:0 0 8px}p{line-height:1.45;margin:0}</style></head><body><main><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p></main></body></html>';
}

// the body of a form or JSON POST as a flat object
export function bodyOf(req) {
  const b = req.body;
  if (b == null || b === '') return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b) && !(b instanceof Uint8Array)) return b;
  const s = Buffer.isBuffer(b) || b instanceof Uint8Array ? Buffer.from(b).toString('utf8') : String(b);
  if (/^\s*[{[]/.test(s)) { try { return JSON.parse(s); } catch (e) { return {}; } }
  return Object.fromEntries(new URLSearchParams(s));
}

// GET /oauth/authorize
export async function authorizeGet(req, res, q, opts = {}) {
  const env = opts.env || process.env, c = await checkAuthorizeRequest(q, req, opts);
  if (c.error) return c.redirect_uri ? redirect(res, redirectWith(c.redirect_uri, { error: c.error, error_description: c.description, state: c.state, iss: origin(req) })) : html(res, 400, errorPage('This link isn’t valid', c.description));
  html(res, 200, signinPage({ client: c.client, scopes: c.scopes, q, env }));
}
// POST /oauth/authorize (the sign-in form)
export async function authorizePost(req, res, q, opts = {}) {
  const env = opts.env || process.env, f = { ...q, ...bodyOf(req) }, c = await checkAuthorizeRequest(f, req, opts);
  if (c.error) return c.redirect_uri ? redirect(res, redirectWith(c.redirect_uri, { error: c.error, error_description: c.description, state: c.state, iss: origin(req) })) : html(res, 400, errorPage('This link isn’t valid', c.description));
  const ip = clientIp(req);
  if (!allow('oauth-signin:' + ip, SIGNIN_LIMIT)) { res.setHeader('Retry-After', '60'); return html(res, 429, signinPage({ client: c.client, scopes: c.scopes, q: f, env, message: 'Too many tries. Wait a minute and try again.' })); }
  const code = signinCode(env);
  if (!code || !f.code || !same(String(f.code), code)) return html(res, 401, signinPage({ client: c.client, scopes: c.scopes, q: f, env, message: 'That passcode isn’t right.' }));
  const scope = 'read' + (c.scopes.write && f.write === 'on' ? ' write' : '');
  const authCode = sign({ t: 'code', cid: c.client.key, n: c.client.name, r: c.redirect_uri, ch: c.code_challenge, s: scope, aud: c.resource, exp: now() + CODE_TTL, j: crypto.randomBytes(8).toString('base64url') }, env.MCP_OAUTH_SECRET);
  redirect(res, redirectWith(c.redirect_uri, { code: authCode, state: c.state, iss: origin(req) }));
}
// POST /oauth/token
export async function token(req, res, opts = {}) {
  const env = opts.env || process.env, f = bodyOf(req), fail = (status, error, error_description) => json(res, status, { error, error_description });
  const client = await clientOf(f.client_id, opts); if (!client) return fail(401, 'invalid_client', 'Unknown client_id.');
  const jti = () => crypto.randomBytes(8).toString('base64url'); // (two tokens minted in the same second still differ)
  const issue = (scope, name) => json(res, 200, { access_token: sign({ t: 'at', cid: client.key, n: name, s: scope, aud: resourceOf(req), exp: now() + ACCESS_TTL, j: jti() }, env.MCP_OAUTH_SECRET), token_type: 'Bearer', expires_in: ACCESS_TTL, scope,
    refresh_token: sign({ t: 'rt', cid: client.key, n: name, s: scope, aud: resourceOf(req), exp: now() + REFRESH_TTL, j: jti() }, env.MCP_OAUTH_SECRET) });
  if (f.resource && !sameResource(f.resource, resourceOf(req))) return fail(400, 'invalid_target', 'resource must be ' + resourceOf(req) + '.');
  if (f.grant_type === 'authorization_code') {
    const p = verify(f.code, 'code', env.MCP_OAUTH_SECRET);
    if (!p || p.cid !== client.key) return fail(400, 'invalid_grant', 'The authorization code is invalid, expired or for another client.');
    if (f.redirect_uri !== undefined && f.redirect_uri !== p.r) return fail(400, 'invalid_grant', 'redirect_uri doesn’t match the authorization request.');
    const v = String(f.code_verifier || ''); if (!/^[A-Za-z0-9._~-]{43,128}$/.test(v) || b64u(crypto.createHash('sha256').update(v).digest()) !== p.ch) return fail(400, 'invalid_grant', 'PKCE code_verifier doesn’t match.');
    return issue(p.s, p.n);
  }
  if (f.grant_type === 'refresh_token') {
    const p = verify(f.refresh_token, 'rt', env.MCP_OAUTH_SECRET);
    if (!p || p.cid !== client.key) return fail(400, 'invalid_grant', 'The refresh token is invalid, expired or for another client.');
    const have = String(p.s).split(' '), asked = f.scope ? String(f.scope).split(/[\s,]+/).filter(Boolean) : have;
    if (asked.some(s => !have.includes(s))) return fail(400, 'invalid_scope', 'A refresh can only narrow the scope.');
    return issue(asked.join(' ') || 'read', p.n);
  }
  return fail(400, 'unsupported_grant_type', 'grant_type must be authorization_code or refresh_token.');
}

// ---------- small response helpers ----------
export const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Protocol-Version', 'Access-Control-Max-Age': '86400' };
export function json(res, status, body, headers = {}) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); for (const [k, v] of Object.entries(headers)) res.setHeader(k, v); res.end(JSON.stringify(body)); }
export function html(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); res.end(body); }
export function redirect(res, to) { res.statusCode = 302; res.setHeader('Location', to); res.setHeader('Cache-Control', 'no-store'); res.end(); }
