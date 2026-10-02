// Abuse and cost guards for the public AI endpoints. The in-memory limiter is per function instance
// (best effort); the Vercel Firewall rate-limit rule and the OpenAI project budget are the hard limits.
const hits = new Map();
export function rateLimit(req, res, { perMinute = 6, perDay = 60 } = {}) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 864e5);
  if (h.filter(t => now - t < 6e4).length >= perMinute || h.length >= perDay) {
    res.setHeader('Retry-After', '60'); res.status(429).json({ error: 'Too many requests. Try again in a minute.' }); return false;
  }
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > 864e5) hits.delete(k);
  return true;
}
export function sameOrigin(req, res) {
  const o = req.headers.origin, host = req.headers['x-forwarded-host'] || req.headers.host;
  if (o && host && new URL(o).host !== host) { res.status(403).json({ error: 'Cross-origin requests are not allowed.' }); return false; }
  return true;
}
export function needKey(res) {
  if (!process.env.OPENAI_API_KEY) { res.status(503).json({ error: 'AI is not configured on this deployment (OPENAI_API_KEY is missing).' }); return null; }
  return process.env.OPENAI_API_KEY;
}
export const clip = (s, n) => String(s ?? '').slice(0, n);
