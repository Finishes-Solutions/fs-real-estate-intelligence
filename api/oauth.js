// The OAuth 2.1 authorization server for the MCP endpoint (lib/mcp/oauth.mjs), one Vercel function behind these paths
// (vercel.json rewrites, and the same table in scripts/dev.mjs):
//   GET  /.well-known/oauth-protected-resource[/api/mcp]   → op=resource   (RFC 9728: who authorizes /api/mcp)
//   GET  /.well-known/oauth-authorization-server[/...]     → op=metadata   (RFC 8414; also /.well-known/openid-configuration)
//   POST /oauth/register                                   → op=register   (RFC 7591 dynamic client registration)
//   GET/POST /oauth/authorize                              → op=authorize  (the sign-in page; POST checks the passcode)
//   POST /oauth/token                                      → op=token      (code → tokens, refresh)
// Off (404) until MCP_OAUTH_SECRET and a passcode (MCP_SIGNIN_CODE or FIELD_ACCESS_CODE) are set; then ChatGPT, Claude and
// any MCP client connect with the server URL alone. Nothing here is stored: see lib/mcp/oauth.mjs.
import { configured, serverMetadata, resourceMetadata, register, authorizeGet, authorizePost, token, bodyOf, json, CORS } from '../lib/mcp/oauth.mjs';
import { allow, clientIp } from './_lib/guard.mjs';

export const LIMITS = { perMinute: 60, perDay: 2000 };
const OPS = { 'oauth-protected-resource': 'resource', 'oauth-authorization-server': 'metadata', 'openid-configuration': 'metadata', register: 'register', authorize: 'authorize', token: 'token' };
export function opOf(req) {
  if (req.query?.op) return String(req.query.op);
  const path = String(req.url || '').split('?')[0];
  const m = /\/(oauth-protected-resource|oauth-authorization-server|openid-configuration|register|authorize|token)(\/|$)/.exec(path);
  return m ? OPS[m[1]] : '';
}

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (!configured()) return json(res, 404, { error: 'not_found', error_description: 'OAuth is not set up on this deployment (MCP_OAUTH_SECRET and MCP_SIGNIN_CODE).' });
  if (!allow('oauth:' + clientIp(req), LIMITS)) { res.setHeader('Retry-After', '60'); return json(res, 429, { error: 'temporarily_unavailable', error_description: 'Too many requests. Try again in a minute.' }); }
  const op = opOf(req), q = req.query || {};
  try {
    if (op === 'resource' && req.method === 'GET') return json(res, 200, resourceMetadata(req), { 'Cache-Control': 'public, max-age=3600' });
    if (op === 'metadata' && req.method === 'GET') return json(res, 200, serverMetadata(req), { 'Cache-Control': 'public, max-age=3600' });
    if (op === 'register' && req.method === 'POST') { const r = register(bodyOf(req)); return json(res, r.status, r.body); }
    if (op === 'authorize' && req.method === 'GET') return await authorizeGet(req, res, q);
    if (op === 'authorize' && req.method === 'POST') return await authorizePost(req, res, q);
    if (op === 'token' && req.method === 'POST') return await token(req, res);
    if (['resource', 'metadata', 'register', 'authorize', 'token'].includes(op)) { res.setHeader('Allow', op === 'authorize' ? 'GET, POST' : op === 'register' || op === 'token' ? 'POST' : 'GET'); return json(res, 405, { error: 'invalid_request', error_description: 'Method not allowed.' }); }
    return json(res, 404, { error: 'not_found', error_description: 'No such OAuth endpoint.' });
  } catch (e) {
    console.error('oauth', op, e.message);
    if (!res.headersSent) json(res, 500, { error: 'server_error', error_description: 'Something went wrong. Try again.' });
  }
}
