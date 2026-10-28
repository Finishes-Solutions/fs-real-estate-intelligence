// What the MCP tools keep between calls (lib/mcp/siteplan.mjs, lib/mcp/planset.mjs): saved site plans (the picked layout a
// later plan_set or site_renderings call starts from, by plan_id) and plan set jobs (their state, each printed sheet, the
// finished set). In the team's private storage (Supabase Storage, the site-files bucket under mcp/), behind the secret key;
// a finished file is handed out as a signed link. Tests swap in memory (hooks.store, memoryStore).
import crypto from 'node:crypto';
import { BUCKET } from '../sitefiles.mjs';

export const hooks = { store: null };
export const PREFIX = 'mcp/';
export const newId = () => crypto.randomBytes(9).toString('base64url'); // 12 characters, URL-safe
export const ID = /^[\w-]{8,40}$/;

// the store, or null when this deployment has no storage key (the tools then say so)
export function store(env = process.env) {
  if (hooks.store) return hooks.store;
  const url = (env.SUPABASE_URL || 'https://ytsxkipkobvcgysylfzc.supabase.co').replace(/\/$/, ''), key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}) }, obj = path => url + '/storage/v1/object/' + BUCKET + '/' + PREFIX + path;
  // a set can be tens of MB: a longer timeout than the data calls' 15 s
  const call = async (u, opts = {}, ms = 60000) => fetch(u, { ...opts, headers: { ...headers, ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
  const fail = async (what, r) => new Error(what + ' ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
  return {
    async put(path, body, type = 'application/json') {
      const r = await call(obj(path), { method: 'POST', body, headers: { 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'no-store' } }, 120000);
      if (!r.ok) throw await fail('storage put', r);
    },
    // the bytes, or null when there's no such object (Supabase answers 400 "not_found" or 404)
    async get(path) {
      const r = await call(obj(path));
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw await fail('storage get', r);
      return Buffer.from(await r.arrayBuffer());
    },
    async link(path, seconds = 86400) {
      const r = await call(url + '/storage/v1/object/sign/' + BUCKET + '/' + PREFIX + path, { method: 'POST', body: JSON.stringify({ expiresIn: seconds }), headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw await fail('storage sign', r);
      const d = await r.json(); return url + '/storage/v1' + (d.signedURL || d.signedUrl);
    }
  };
}
export const putJSON = (s, path, v) => s.put(path, JSON.stringify(v), 'application/json');
export const getJSON = async (s, path) => { const b = await s.get(path); return b ? JSON.parse(b.toString('utf8')) : null; };

// in memory, for tests (links are fake https URLs that say what they point at)
export function memoryStore() {
  const m = new Map();
  return { m, async put(path, body) { m.set(path, Buffer.from(body)); }, async get(path) { return m.has(path) ? Buffer.from(m.get(path)) : null; }, async link(path) { return 'https://storage.test/' + PREFIX + path + '?token=t'; } };
}
