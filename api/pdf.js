// Report PDFs: POST { html, landscape?, title? } -> application/pdf, rendered by headless Chromium (@sparticuz/chromium
// on Vercel; CHROME_PATH locally) so the PDF has real text, the brand fonts (fonts/: Montserrat and IBM Plex Mono, found
// by Chromium's fontconfig in /var/task/fonts) and sharp charts and maps. The page's own CSS sets the layout; this adds
// the running footer (report name, page x of y) on every page.
// The HTML comes from the app's own report builders, but it is still client input, so: scripts are off, and the page may
// only load https images from public hosts and data: URLs (no private addresses, no plain http, no file:).
import { rateLimit, sameOrigin } from './_lib/guard.mjs';

const MAX = 4_000_000; // Vercel's request body limit is 4.5 MB
let browserP = null;

async function launch() {
  const puppeteer = (await import('puppeteer-core')).default;
  if (process.env.CHROME_PATH) return puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const chromium = (await import('@sparticuz/chromium')).default;
  chromium.setGraphicsMode = false;
  return puppeteer.launch({ args: await puppeteer.defaultArgs({ args: [...chromium.args, '--font-render-hinting=none'], headless: 'shell' }), executablePath: await chromium.executablePath(), headless: 'shell' });
}
// one browser per warm instance; a crashed one is replaced
async function browser() {
  if (browserP) { const b = await browserP.catch(() => null); if (b?.connected) return b; }
  browserP = launch(); return browserP;
}

const PRIVATE = /^(localhost|.*\.local|.*\.internal|0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|\[|::|fc|fd|metadata)/i;
export function allowed(url) {
  if (url.startsWith('data:') || url === 'about:blank') return true;
  let u; try { u = new URL(url); } catch (e) { return false; }
  if (u.protocol !== 'https:' || PRIVATE.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return false;
  return !/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname); // the fonts are installed: skip the download
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Chromium draws the footer in its own small document: no web fonts or page CSS, sizes in px at 1/96 in
export const footer = title => '<div style="width:100%;padding:0 0.5in;font-family:\'IBM Plex Mono\',monospace;font-size:7px;letter-spacing:.12em;text-transform:uppercase;color:#6b7174;display:flex;justify-content:space-between;align-items:center">' +
  '<span><b style="color:#006527;font-weight:600">Finishes Solutions</b>&nbsp;&nbsp;·&nbsp;&nbsp;' + esc(title).slice(0, 90) + '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>';

export async function render(html, { landscape = false, title = 'Report' } = {}) {
  const b = await browser(), page = await b.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', r => (allowed(r.url()) ? r.continue() : r.abort()).catch(() => {}));
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    // tagged: false: Chromium's accessibility tags make a long report about 5x bigger (a 1,000-row list: 5.4 MB vs ~1 MB),
    // past the 4.5 MB a response can be
    return await page.pdf({ format: 'letter', landscape, printBackground: true, preferCSSPageSize: false, displayHeaderFooter: true, tagged: false, outline: false,
      headerTemplate: '<span></span>', footerTemplate: footer(title), margin: { top: '0.5in', bottom: '0.6in', left: '0.5in', right: '0.5in' }, timeout: 30000 });
  } finally { page.close().catch(() => {}); }
}

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
    catch (e) { browserP = null; res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ ok: false, error: e.message, ms: Date.now() - t }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST { html, landscape?, title? }' });
  const b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const html = typeof b.html === 'string' ? b.html : '';
  if (!/^\s*<!doctype html>/i.test(html) || html.length > MAX) return res.status(400).json({ error: 'Send { html } (a whole HTML document, under 4 MB).' });
  try {
    const pdf = await render(html, { landscape: !!b.landscape, title: String(b.title || 'Report').slice(0, 120) });
    if (pdf.length > 4_400_000) return res.status(413).json({ error: 'the PDF is ' + (pdf.length / 1048576).toFixed(1) + ' MB, over the 4.5 MB a download from here can be' });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(pdf));
  } catch (e) {
    console.error('pdf', e.message); browserP = null;
    return res.status(502).json({ error: 'The PDF couldn’t be made: ' + e.message });
  }
}
