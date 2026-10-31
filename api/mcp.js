// MCP server (Model Context Protocol) at POST /api/mcp: Streamable HTTP, stateless (a new server and transport per request,
// JSON responses). Tools over this app's data and the team's projects (lib/mcp/server.mjs); the logic is the same functions
// the website's endpoints call, never this app's own HTTP endpoints. Callers: the project app's agents (AMP) with a shared
// bearer token, and people's own assistants (ChatGPT, Claude, …) connected with the server URL alone through OAuth
// (lib/mcp/oauth.mjs, api/oauth.js).
// Auth: with MCP_ACCESS_TOKEN set, "Authorization: Bearer <that token>" works (compared in constant time); with OAuth set up
// (MCP_OAUTH_SECRET + a passcode), an access token from our own sign-in works, and a 401 carries the resource-metadata URL
// so a client knows where to sign in. With neither, the endpoint is open and read-only.
// Writes: the tools that change projects run for the shared token when MCP_WRITES isn't 'off', and for an OAuth token only
// when the person allowed project changes at sign-in (scope write). Rate limits per caller (lib guard).
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../lib/mcp/server.mjs';
import { writesOn } from '../lib/mcp/projects.mjs';
import { configured as oauthOn, verifyAccess, resourceMetadataUrl, CORS } from '../lib/mcp/oauth.mjs';
import { allow, clientIp } from './_lib/guard.mjs';

// AMP's calls come from its own servers (one caller as far as this is concerned), so these are generous; per instance
export const LIMITS = { request: { perMinute: 240, perDay: 10000 }, data: { perMinute: 120, perDay: 6000 }, report: { perMinute: 10, perDay: 300 }, write: { perMinute: 20, perDay: 600 } };
const rpcError = (res, status, code, message) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null })); };

const bearer = req => { const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim()); return m ? m[1].trim() : ''; };
// constant-time compare of the shared token (hashing first makes the lengths equal)
const sameToken = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

// who is calling: { ok: true, via: 'open' | 'token' | 'oauth', writes, scope } or { ok: false, error: 'invalid_token' | '' }
export function authenticate(req, env = process.env) {
  const locked = !!env.MCP_ACCESS_TOKEN || oauthOn(env);
  if (!locked) return { ok: true, via: 'open', writes: false };
  const t = bearer(req); if (!t) return { ok: false, error: '' };
  if (env.MCP_ACCESS_TOKEN && sameToken(t, env.MCP_ACCESS_TOKEN)) return { ok: true, via: 'token', writes: writesOn(env) };
  if (oauthOn(env)) { const a = verifyAccess(t, req, env); if (a) return { ok: true, via: 'oauth', writes: a.scope.includes('write') && env.MCP_WRITES !== 'off', scope: a.scope, client: a.name }; }
  return { ok: false, error: 'invalid_token' };
}
export const authorized = (req, token = process.env.MCP_ACCESS_TOKEN) => authenticate(req, { ...process.env, MCP_ACCESS_TOKEN: token }).ok;

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return rpcError(res, 405, -32000, 'Method not allowed.'); }
  const who = authenticate(req);
  if (!who.ok) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="mcp"' + (who.error ? ', error="' + who.error + '"' : '') + (oauthOn() ? ', resource_metadata="' + resourceMetadataUrl(req) + '"' : ''));
    return rpcError(res, 401, -32001, oauthOn() ? 'Unauthorized: sign in through OAuth (see WWW-Authenticate) or send Authorization: Bearer <MCP access token>.' : 'Unauthorized: send Authorization: Bearer <MCP access token>.');
  }
  const ip = who.via === 'oauth' ? 'c:' + (who.client || '') + ':' + clientIp(req) : clientIp(req);
  if (!allow('mcp:' + ip, LIMITS.request)) { res.setHeader('Retry-After', '60'); return rpcError(res, 429, -32000, 'Too many requests. Try again in a minute.'); }
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return undefined; } })() : req.body;
  const server = createServer({ writes: who.writes, limit: t => { const k = t.report ? 'report' : t.write ? 'write' : 'data'; return allow('mcp-' + k + ':' + ip, LIMITS[k]); } });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error('mcp', e.message);
    if (!res.headersSent) rpcError(res, 500, -32603, 'Internal server error.');
  }
}
