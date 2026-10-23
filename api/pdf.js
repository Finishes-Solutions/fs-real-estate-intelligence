// Report PDFs: POST { html, landscape?, title? } -> application/pdf, rendered by headless Chromium (@sparticuz/chromium
// on Vercel; CHROME_PATH locally) so the PDF has real text, the brand fonts (fonts/: Montserrat and IBM Plex Mono, found
// by Chromium's fontconfig in /var/task/fonts) and sharp charts and maps. The page's own CSS sets the layout; this adds
// the running footer (report name, page x of y) on every page.
// The HTML comes from the app's own report builders, but it is still client input, so: scripts are off, and the page may
// only load https images from public hosts and data: URLs (no private addresses, no plain http, no file:).
import { rateLimit, sameOrigin } from './_lib/guard.mjs';
import { render, allowed, footer, SHEETS, resetBrowser } from '../lib/pdf.mjs';
export { render, allowed, footer, SHEETS };

const MAX = 4_000_000; // Vercel's request body limit is 4.5 MB
export default async function handler(req, res) {
  if (!sameOrigin(req, res) || !rateLimit(req, res, { perMinute: 12, perDay: 400 })) return;
  // GET ?check=1: render a one-line page and say how it went (is Chromium working on this deployment, and how fast)
  if (req.method === 'GET' && req.query?.check) {
    const t = Date.now();
    // ?check=list: the worst case the app sends, a landscape list of 1,000 filings in the report layout
    const big = req.query.check === 'list' ? (await import('../src/reportkit.js')).reportDoc({ kicker: 'Check', title: '1,000-row list', landscape: true,
      body: '<table><thead><tr><th>#</th><th>Project</th><th>County</th><th class="r">Est. value</th><th>Owner</th><th>Status</th></tr></thead><tbody>' + Array.from({ length: 1000 }, (_, i) => '<tr><td class="m">' + (i + 1) + '</td><td><a href="https://www.tdlr.texas.gov/TABS/Projects/TABS' + i + '">Project ' + i + '</a><div class="sc">' + (i * 7) + ' Main St, Houston · New construction</div></td><td>Harris</td><td class="m r">$' + (i * 1234).toLocaleString('en-US') + '</td><td>Owner LLC ' + i + '</td><td>Project registered</td></tr>').join('') + '</tbody></table>' }) : null;
    try { const pdf = await render(big || '<!doctype html><html><body style="font-family:Montserrat"><h1 style="font-weight:800">Finishes Solutions</h1><p style="font-family:\'IBM Plex Mono\'">PDF check</p></body></html>', { title: 'Check', landscape: !!big });
      res.setHeader('Cache-Control', 'no-store'); const fonts = [...new Set([...Buffer.from(pdf).toString('latin1').matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([\w-]+)/g)].map(m => m[1]))];
      return res.json({ ok: true, bytes: pdf.length, ms: Date.now() - t, fonts }); }
    catch (e) { resetBrowser(); res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ ok: false, error: e.message, ms: Date.now() - t }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST { html, landscape?, title? }' });
  const b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const html = typeof b.html === 'string' ? b.html : '';
  if (!/^\s*<!doctype html>/i.test(html) || html.length > MAX) return res.status(400).json({ error: 'Send { html } (a whole HTML document, under 4 MB).' });
  try {
    const pdf = await render(html, { landscape: !!b.landscape, title: String(b.title || 'Report').slice(0, 120), sheet: SHEETS[b.sheet] && b.sheet !== 'set' ? b.sheet : null });
    if (pdf.length > 4_400_000) return res.status(413).json({ error: 'the PDF is ' + (pdf.length / 1048576).toFixed(1) + ' MB, over the 4.5 MB a download from here can be' });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    console.error('pdf', e.message); resetBrowser();
    return res.status(502).json({ error: 'The PDF couldn’t be made: ' + e.message });
  }
}
