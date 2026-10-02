// Recent news about a project, company or place, from the GDELT Project DOC 2.0 API (free, no key; cite GDELT and link out).
// GET ?q=<company or project>&near=<city>  -> { query, articles: [{ title, url, domain, date, image }] }
// GDELT covers roughly the last three months and asks for no more than one request every 5 seconds, so answers are CDN-cached.
import { rateLimit, sameOrigin, clip } from './_lib/guard.mjs';
import { supa } from '../lib/supa.mjs';

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

// With SUPABASE_URL + SUPABASE_SECRET_KEY on the site, articles found for a filing are saved (news_articles / filing_news),
// and saved ones are returned alongside, so a filing keeps its history and still shows news when GDELT is busy.
async function saved(db, id) {
  const rows = await db.select('filing_news', 'filing_id=eq.' + encodeURIComponent(id) + '&select=url,news_articles(title,domain,published,image)&order=found_at.desc&limit=30');
  return rows.filter(r => r.news_articles).map(r => ({ title: r.news_articles.title, url: r.url, domain: r.news_articles.domain, date: r.news_articles.published, image: r.news_articles.image, saved: true }));
}
async function save(db, id, query, articles) {
  if (!articles.length) return;
  await db.upsert('news_articles', articles.map(a => ({ url: a.url, title: a.title, domain: a.domain, published: a.date, image: a.image })), 'url');
  await db.upsert('filing_news', articles.map(a => ({ filing_id: id, url: a.url, query })), 'filing_id,url');
}
const merge = (a, b) => { const seen = new Set(), out = []; for (const x of [...a, ...b]) if (!seen.has(x.url)) { seen.add(x.url); out.push(x); } return out.sort((x, y) => String(y.date || '').localeCompare(String(x.date || ''))); };

export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 12, perDay: 300 })) return;
  const q = clip(req.query?.q, 120), near = clip(req.query?.near, 60), id = /^TABS[\w-]{3,30}$/.test(req.query?.filing || '') ? req.query.filing : null;
  if (!q && !near) return res.status(400).json({ error: 'q or near is required' });
  const db = id ? supa() : null;
  let out = null, err = null;
  try { out = await news(q, near); } catch (e) { err = e; console.error('news', e.message); }
  if (db) {
    try { if (out) await save(db, id, out.query, out.articles); out = { query: out?.query || gdeltQuery(q, near), articles: merge(out?.articles || [], await saved(db, id)) }; }
    catch (e) { console.error('news db', e.message); }
  }
  if (out && (!err || out.articles.length)) { res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=3600'); return res.json({ ...out, stored: !!db, source: 'GDELT Project (gdeltproject.org)' }); }
  res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: /limit/i.test(err?.message || '') ? 'The news index is busy. Try again in a few seconds.' : 'Couldn’t reach the news index.' });
}
