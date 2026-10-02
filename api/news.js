// Recent news about a project, company or place, from the GDELT Project DOC 2.0 API (free, no key; cite GDELT and link out).
// GET ?q=<company or project>&near=<city>  -> { query, articles: [{ title, url, domain, date, image }] }
// GDELT covers roughly the last three months and asks for no more than one request every 5 seconds, so answers are CDN-cached.
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';

// LLC suffixes and filler make GDELT match nothing; quote what's left as a phrase
const SUFFIX = /\b(l\.?l\.?c|inc|ltd|l\.?p|corp(oration)?|co|company|holdings?|partners(hip)?|properties|investments?|group|the|of|and|at|tx|texas)\b\.?/gi;
export function phrase(s) {
  const t = String(s || '').replace(/["()\\]/g, ' ').replace(SUFFIX, ' ').replace(/[^\p{L}\p{N}&' -]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 4 ? '"' + t.slice(0, 60) + '"' : '';
}
export function gdeltQuery(q, near) {
  const a = phrase(q), b = phrase(near);
  if (!a && !b) return '';
  return [a, b && b !== a ? b : '', 'sourcecountry:US', 'sourcelang:english'].filter(Boolean).join(' ');
}
const day = s => /^(\d{4})(\d\d)(\d\d)T/.test(s || '') ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : null;

export async function news(q, near, max = 12) {
  const query = gdeltQuery(q, near); if (!query) return { query: '', articles: [] };
  const u = 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query, mode: 'artlist', format: 'json', maxrecords: String(max * 2), sort: 'datedesc', timespan: '3months' });
  const r = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'FinishesSolutions-RealEstateIntel/1.0' } });
  const text = await r.text();
  if (!r.ok) throw new Error('GDELT ' + r.status);
  let d; try { d = JSON.parse(text || '{}'); } catch (e) { throw new Error('GDELT: ' + text.slice(0, 120)); } // it answers errors (rate limit, bad query) in plain text
  const seen = new Set(), articles = [];
  for (const a of d.articles || []) {
    const key = String(a.title || '').toLowerCase().replace(/\W+/g, ' ').trim(); if (!a.url || !key || seen.has(key)) continue; seen.add(key);
    articles.push({ title: clip(a.title, 200), url: a.url, domain: a.domain || new URL(a.url).hostname, date: day(a.seendate), image: a.socialimage || null });
    if (articles.length >= max) break;
  }
  return { query, articles };
}

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 12, perDay: 300 })) return;
  const q = clip(req.query?.q, 120), near = clip(req.query?.near, 60);
  if (!q && !near) return res.status(400).json({ error: 'q or near is required' });
  try { const out = await news(q, near); res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=3600'); return res.json({ ...out, source: 'GDELT Project (gdeltproject.org)' }); }
  catch (e) { console.error('news', e.message); res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: /limit/i.test(e.message) ? 'The news index is busy. Try again in a few seconds.' : 'Couldn’t reach the news index.' }); }
}
