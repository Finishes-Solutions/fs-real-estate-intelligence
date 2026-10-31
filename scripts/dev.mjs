// @ts-check
// Local development server: the assembled app (public/, from `node build.mjs --assemble`) plus the Vercel functions in
// api/, with the small part of Vercel's request/response helpers they use (req.query, req.body, res.status/json/send).
// No Vercel login or project link needed. Env vars come from the shell or a .env file in the repo root (see
// .env.example); a function whose key is missing answers as it does on Vercel without it.
//   npm run dev                 → http://127.0.0.1:8787
//   PORT=9000 npm run dev
//   node scripts/dev.mjs --no-assemble   (serve public/ as it is)
import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // (fileURLToPath: a repo path with spaces in it)
const PORT = +process.env.PORT || 8787, HOST = process.env.HOST || '127.0.0.1';

// .env (KEY=value lines; the shell wins)
if (existsSync(path.join(ROOT, '.env'))) for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (!process.argv.includes('--no-assemble')) execFileSync(process.execPath, ['build.mjs', '--assemble'], { cwd: ROOT, stdio: 'inherit' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };

// Vercel's helpers on Node's own request and response
function vercelize(req, res, url, body) {
  req.query = Object.fromEntries(url.searchParams); req.body = body;
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = b => { if (b == null) b = ''; if (typeof b === 'object' && !Buffer.isBuffer(b) && !(b instanceof Uint8Array)) return res.json(b); res.end(b); return res; };
  res.redirect = (a, b) => { const [code, to] = b == null ? [307, a] : [a, b]; res.statusCode = code; res.setHeader('Location', to); res.end(); return res; };
}
async function readBody(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks); if (!raw.length) return undefined;
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) { try { return JSON.parse(raw.toString('utf8')); } catch (e) { return raw.toString('utf8'); } }
  if (type.startsWith('text/') || type.includes('application/x-www-form-urlencoded')) return raw.toString('utf8');
  return raw;
}
const handlers = new Map();
async function handlerFor(name) {
  if (!/^[a-z0-9-]+$/i.test(name)) return null;
  const file = path.join(ROOT, 'api', name + '.js'); if (!existsSync(file)) return null;
  if (!handlers.has(name)) handlers.set(name, (await import(pathToFileURL(file).href)).default);
  return handlers.get(name);
}

// the OAuth paths vercel.json rewrites to api/oauth.js (lib/mcp/oauth.mjs); kept in step with vercel.json "rewrites"
/** @type {[RegExp, string][]} */
export const REWRITES = [[/^\/\.well-known\/oauth-protected-resource(\/.*)?$/, 'resource'], [/^\/\.well-known\/(oauth-authorization-server(\/.*)?|openid-configuration)$/, 'metadata'],
  [/^\/oauth\/register$/, 'register'], [/^\/oauth\/authorize$/, 'authorize'], [/^\/oauth\/token$/, 'token']];
export function rewrite(url) { for (const [re, op] of REWRITES) if (re.test(url.pathname)) { url.pathname = '/api/oauth'; url.searchParams.set('op', op); return true; } return false; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || HOST));
  try {
    rewrite(url);
    if (url.pathname.startsWith('/api/')) {
      const h = await handlerFor(url.pathname.slice(5).replace(/\/+$/, ''));
      if (!h) { res.statusCode = 404; return res.end('No such function'); }
      vercelize(req, res, url, await readBody(req)); await h(req, res);
      if (!res.writableEnded) res.end();
      return;
    }
    let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, 'public', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(path.join(ROOT, 'public'))) { res.statusCode = 403; return res.end(); }
    const data = await fs.readFile(file).catch(() => null);
    if (!data) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(data);
  } catch (e) {
    console.error(req.method, url.pathname, e);
    if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
    if (!res.writableEnded) res.end(JSON.stringify({ error: 'Server error: ' + e.message }));
  }
});
server.listen(PORT, HOST, () => console.log('dev: http://' + HOST + ':' + PORT + ' (public/ + api/)'));
