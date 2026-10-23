// MCP server for the project app's agents (AMP): POST /api/mcp, Streamable HTTP, stateless (a new server and transport per
// request, JSON responses). Read-only tools over this app's data (lib/mcp/server.mjs); the logic is the same functions the
// website's endpoints call, never this app's own HTTP endpoints.
// Auth is optional: with MCP_ACCESS_TOKEN set, every request needs "Authorization: Bearer <token>" (401 otherwise); unset,
// the endpoint is open. Rate limits per caller (lib guard): requests overall, and a tighter one for report tools.
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../lib/mcp/server.mjs';
import { allow, clientIp } from './_lib/guard.mjs';

export const LIMITS = { request: { perMinute: 120, perDay: 5000 }, data: { perMinute: 60, perDay: 3000 }, report: { perMinute: 4, perDay: 120 } };
const rpcError = (res, status, code, message) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null })); };

// constant-time compare of the bearer token (hashing first makes the lengths equal)
export function authorized(req, token = process.env.MCP_ACCESS_TOKEN) {
  if (!token) return true;
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim()); if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1].trim()).digest(), b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return rpcError(res, 405, -32000, 'Method not allowed.'); }
  if (!authorized(req)) { res.setHeader('WWW-Authenticate', 'Bearer'); return rpcError(res, 401, -32001, 'Unauthorized: send Authorization: Bearer <MCP access token>.'); }
  const ip = clientIp(req);
  if (!allow('mcp:' + ip, LIMITS.request)) { res.setHeader('Retry-After', '60'); return rpcError(res, 429, -32000, 'Too many requests. Try again in a minute.'); }
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return undefined; } })() : req.body;
  const server = createServer({ limit: t => allow('mcp-' + (t.report ? 'report' : 'data') + ':' + ip, t.report ? LIMITS.report : LIMITS.data) });
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
