// Diagnostic: news sources from a cloud server (Actions). Run "Probe services" with script=news.
import { googleNews, gdelt } from '../api/news.js';
import { buildQueries } from '../lib/news-query.mjs';
for (const [q, near] of [['George R Brown Convention Center', 'Houston'], ['Memorial Hermann', 'Katy'], ['Hines', 'Houston']]) {
  for (const [name, fn] of [['google', (q, n, m) => googleNews(buildQueries({ company: [q], city: n })[0].query, m)], ['gdelt', gdelt]]) {
    const t = Date.now();
    try { const d = await fn(q, near, 5); console.log(name, '|', d.query, '|', d.articles.length, 'articles |', Date.now() - t, 'ms |', d.articles.slice(0, 2).map(a => a.date + ' ' + a.domain + ': ' + a.title.slice(0, 60)).join(' || ')); }
    catch (e) { console.log(name, '|', q, '| ERROR', e.message, e.cause?.code || '', '|', Date.now() - t, 'ms'); }
  }
}
