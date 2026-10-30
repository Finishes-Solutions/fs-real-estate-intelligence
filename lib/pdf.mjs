// Report PDFs from HTML, rendered by headless Chromium (@sparticuz/chromium on Vercel; CHROME_PATH locally) so the PDF has
// real text, the fonts (fonts/: Inter, plus Montserrat and IBM Plex Mono for the plan sets, found by Chromium's fontconfig in /var/task/fonts) and
// sharp charts and maps. The page's own CSS sets the layout; render() adds the running footer (report name, page x of y).
// Shared by api/pdf.js (the website's exports), api/planset.js and the MCP server's report tools (lib/mcp/reports.mjs).
// The HTML is treated as untrusted: scripts are off, and the page may only load https images from public hosts and data: URLs
// (no private addresses, no plain http, no file:).
import { existsSync } from 'node:fs';
let browserP = null;
// a local Chrome or Chromium for scripts and tests off Vercel: CHROME_PATH when it exists, else the first browser found
// in the usual places (the Playwright build on Linux CI, Google Chrome or Chromium on a Mac, the distro packages). '' when
// there is none.
const BROWSERS = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
export const localBrowser = () => [process.env.CHROME_PATH, ...BROWSERS].find(p => p && existsSync(p)) || '';
// forget the browser (after a failed render: the next one launches a new one)
export const resetBrowser = () => { browserP = null; };
// close it (a script or test that is done rendering; a function instance just keeps it warm)
export async function closeBrowser() { const p = browserP; browserP = null; const b = await p?.catch(() => null); await b?.close().catch(() => {}); }

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

// the white logo inline in a report's HTML (the browser's export inlines its same-site images; the server has no site to
// load it from), or the image left out when the file isn't there
let logoP = null;
const logo = async () => logoP ||= (await import('node:fs')).promises.readFile((await import('node:path')).join(process.cwd(), 'src', 'logo-white.png')).then(b => 'data:image/png;base64,' + b.toString('base64')).catch(() => null);
export async function inlineLogo(html) {
  const l = await logo();
  return l ? html.split('src="logo-white.png"').join('src="' + l + '"') : html.replace(/<img src="logo-white\.png"[^>]*>/, '');
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Chromium draws the footer in its own small document: no web fonts or page CSS, sizes in px at 1/96 in
// (brand: false, the plain site reports in lib/reports/plain.mjs: the report's name alone)
export const footer = (title, { brand = true } = {}) => '<div style="width:100%;padding:0 0.5in;font-family:Inter,sans-serif;font-size:7.5px;color:#6e6e80;display:flex;justify-content:space-between;align-items:center">' +
  '<span>' + (brand ? '<b style="color:#0d0d0d;font-weight:600">Real Estate Intelligence</b>&nbsp;&nbsp;·&nbsp;&nbsp;' : '') + esc(title).slice(0, 90) + '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>';

// sheet: 'tabloid' (11 x 17) or 'archd' (24 x 36), landscape, for drawings like the site plan: no footer, small margins;
// 'set' (24 x 36, no margin at all) for plan set sheets, whose border is laid under them afterwards (api/planset.js)
export const SHEETS = { tabloid: ['17in', '11in'], archd: ['36in', '24in'], set: ['36in', '24in'] };
export async function render(html, { landscape = false, title = 'Report', sheet = null, brand = true } = {}) {
  const b = await browser(), page = await b.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', r => (allowed(r.url()) ? r.continue() : r.abort()).catch(() => {}));
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    // tagged: false: Chromium's accessibility tags make a long report about 5x bigger (a 1,000-row list: 5.4 MB vs ~1 MB),
    // past the 4.5 MB a response can be
    if (SHEETS[sheet]) { const mg = sheet === 'set' ? '0' : '0.25in'; return await page.pdf({ width: SHEETS[sheet][0], height: SHEETS[sheet][1], printBackground: true, displayHeaderFooter: false, tagged: false, outline: false, margin: { top: mg, bottom: mg, left: mg, right: mg }, timeout: 60000 }); }
    return await page.pdf({ format: 'letter', landscape, printBackground: true, preferCSSPageSize: false, displayHeaderFooter: true, tagged: false, outline: false,
      headerTemplate: '<span></span>', footerTemplate: footer(title, { brand }), margin: { top: '0.5in', bottom: '0.6in', left: '0.5in', right: '0.5in' }, timeout: 30000 });
  } finally { page.close().catch(() => {}); }
}


// SVG drawings as JPEG data URLs, at most `px` on the long side on white (the MCP server's site_plan: the layouts the
// AI reviews, as the browser's canvas makes them). Same locked-down page as render(): scripts off, no outside requests.
export async function snapshots(svgs, { px = 1000, quality = 72 } = {}) {
  const b = await browser(), page = await b.newPage(), out = [];
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith('data:') || r.url() === 'about:blank' ? r.continue() : r.abort()).catch(() => {}));
    for (const svg of svgs) {
      const w = +(/\swidth="([\d.]+)"/.exec(svg)?.[1] || px), h = +(/\sheight="([\d.]+)"/.exec(svg)?.[1] || px), k = Math.min(1, px / Math.max(w, h));
      const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
      await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      await page.setContent('<!doctype html><html><body style="margin:0;background:#fff"><div style="width:' + W + 'px;height:' + H + 'px">' + svg.replace(/(<svg[^>]*?)\swidth="[\d.]+"\sheight="[\d.]+"/, '$1 width="' + W + '" height="' + H + '"') + '</div></body></html>', { waitUntil: 'load', timeout: 15000 });
      out.push('data:image/jpeg;base64,' + Buffer.from(await page.screenshot({ type: 'jpeg', quality, clip: { x: 0, y: 0, width: W, height: H } })).toString('base64'));
    }
    return out;
  } finally { page.close().catch(() => {}); }
}
