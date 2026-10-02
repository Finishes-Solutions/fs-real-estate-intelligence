// Recent news about a project, company or place. Free, no key; cite the source and link out.
//   1. Google News search (RSS): reliable from servers, about the last year
//   2. GDELT Project DOC 2.0 API: fallback; it often refuses cloud servers or rate-limits them (one request per 5 s for everyone)
// GET ?q=<company or project>&near=<city>  -> { query, articles: [{ title, url, domain, date, image }], source }
// Answers are CDN-cached.
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

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unxml = t => String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m).replace(/<[^>]+>/g, '').trim();
// Google News search feed: <item><title>Headline - Outlet</title><link>…</link><pubDate>…</pubDate><source url="https://outlet">Outlet</source></item>
export function parseGoogleNews(xml, max = 12) {
  const out = [], seen = new Set();
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1], tag = n => unxml((it.match(new RegExp('<' + n + '[^>]*>([\\s\\S]*?)</' + n + '>')) || [])[1]);
    const outlet = tag('source'), src = (it.match(/<source[^>]*url="([^"]+)"/) || [])[1] || '';
    let title = tag('title'); if (outlet && title.endsWith(' - ' + outlet)) title = title.slice(0, -(outlet.length + 3));
    const url = tag('link'), key = title.toLowerCase().replace(/\W+/g, ' ').trim(); if (!url || !key || seen.has(key)) continue; seen.add(key);
    const d = new Date(tag('pubDate'));
    out.push({ title: clip(title, 200), url, domain: outlet || (src ? new URL(src).hostname : ''), date: isNaN(d) ? null : d.toISOString().slice(0, 10), image: null });
    if (out.length >= max) break;
  }
  return out;
}
export async function googleNews(q, near, max = 12) {
  const a = phrase(q), b = phrase(near), query = [a, b && b !== a ? b : ''].filter(Boolean).join(' ');
  if (!query) return { query: '', articles: [] };
  const u = 'https://news.google.com/rss/search?' + new URLSearchParams({ q: query + ' when:1y', hl: 'en-US', gl: 'US', ceid: 'US:en' });
  const r = await fetch(u, { signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinishesSolutions-RealEstateIntel/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!r.ok) throw new Error('Google News ' + r.status);
  return { query, articles: parseGoogleNews(await r.text(), max), source: 'Google News' };
}

export async function gdelt(q, near, max = 12) {
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
  return { query, articles, source: 'GDELT Project' };
}

// Google News first; GDELT when Google fails or finds nothing
export async function news(q, near, max = 12) {
  let g = null, ge = null;
  try { g = await googleNews(q, near, max); if (g.articles.length) return g; } catch (e) { ge = e; console.error('news google', e.message); }
  try { const d = await gdelt(q, near, max); return d.articles.length || !g ? d : g; }
  catch (e) { if (g) return g; throw new Error([ge?.message, e.message].filter(Boolean).join('; ')); }
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
    try { if (out) await save(db, id, out.query, out.articles); out = { query: out?.query || gdeltQuery(q, near), source: out?.source, articles: merge(out?.articles || [], await saved(db, id)) }; }
    catch (e) { console.error('news db', e.message); }
  }
  if (out && (!err || out.articles.length)) { res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=3600'); return res.json({ ...out, stored: !!db, source: out.source || (out.articles.some(a => a.saved) ? 'saved articles' : 'Google News') }); }
  res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: /limit/i.test(err?.message || '') ? 'The news services are busy. Try again in a few seconds.' : 'Couldn’t reach the news services (Google News and GDELT) just now. Try again shortly.' });
}
