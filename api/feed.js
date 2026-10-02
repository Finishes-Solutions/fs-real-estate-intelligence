// RSS feed for any saved search: GET /api/feed?<same params as the map's URL hash>
// Newest registrations first. Subscribe in any RSS reader, or use Zapier/IFTTT "RSS -> email" for alerts.
import { load, changedMap } from './_lib/data.mjs';
import { decode, describe, makeMatcher, matchSel } from '../lib/filter.mjs';

const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + v;
const TYPE = { New: 'New construction', Reno: 'Renovation', Addition: 'Addition' };

export default async function handler(req, res) {
  try {
    const qs = new URL(req.url, 'http://x').search.slice(1), spec = decode(qs);
    const [data, changed] = await Promise.all([load('filings.json'), changedMap()]);
    const match = makeMatcher(spec, { changed });
    const list = data.filings.filter(f => match(f) && matchSel(f, spec.sel)).sort((a, b) => (b.reg || '').localeCompare(a.reg || '') || b.cost - a.cost).slice(0, 100);
    const host = req.headers['x-forwarded-host'] || req.headers.host, site = 'https://' + host + '/';
    const title = 'Construction filings' + (describe(spec) ? ' — ' + describe(spec) : '');
    const items = list.map(f => `<item><title>${x(f.name + ' — ' + money(f.cost) + ' — ' + (f.city || f.county))}</title>
<link>${x(site + '#f=' + encodeURIComponent(f.id) + (qs ? '&' + qs : ''))}</link><guid isPermaLink="false">${x(f.id)}</guid>
<pubDate>${new Date((f.reg || data.built.slice(0, 10)) + 'T12:00:00Z').toUTCString()}</pubDate>
<description>${x([f.sum, (TYPE[f.type] || f.type) + (f.use ? ' · ' + f.use : ''), 'Est. value ' + money(f.cost) + (f.sqft ? ' · ' + f.sqft.toLocaleString('en-US') + ' sq ft' : ''),
  f.addr, (f.dev || f.owner) ? 'Owner: ' + (f.dev || f.owner) : '', 'Est. ' + f.ts + ' → ' + f.te, 'Status: ' + (f.status || '—'), 'TABS record: https://www.tdlr.texas.gov/TABS/Projects/' + f.id].filter(Boolean).join('\n'))}</description></item>`).join('\n');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${x(title)}</title><link>${x(site + (qs ? '#' + qs : ''))}</link>
<description>TDLR TABS registrations matching this search, from the Finishes Solutions real estate intelligence map. Data refreshed ${x(data.built.slice(0, 10))}.</description>
<lastBuildDate>${new Date(data.built).toUTCString()}</lastBuildDate>
${items}
</channel></rss>`);
  } catch (e) {
    console.error('feed failed', e);
    res.status(500).send('Feed unavailable');
  }
}
