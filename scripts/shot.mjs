// @ts-check
// A screenshot of the workspace at a step, after a request is typed and the layout gallery made, against a running dev
// server (npm run dev): node scripts/shot.mjs <out.png> <step> ["<ask>"] [port]
import { chromium } from 'playwright';
import { sampleProject } from './sample-project.mjs';
import { market as marketFromData } from '../api/_lib/data.mjs';
import { localChrome } from '../test/helpers/chrome.mjs';
const [out, step, ask, port] = process.argv.slice(2), PORT = +(port || 8787);
const market = await marketFromData(), project = await sampleProject({ market });
const browser = await chromium.launch({ executablePath: localChrome() || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await ctx.addInitScript(p => { try { localStorage.setItem('fs-projects-v1', JSON.stringify({ projects: [p], dirty: [], gone: [] })); localStorage.setItem('fs-team-name', 'Screenshot'); } catch (e) {} }, project);
const page = await ctx.newPage(); page.on('pageerror', e => console.error('page error:', e.message));
await page.goto('http://127.0.0.1:' + PORT + '/#v=projects&pj=' + project.id, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#wsRoot .ws-kpi b', { timeout: 60000 });
await page.click('.ws-step[data-step="' + step + '"]'); await page.waitForTimeout(400);
if (ask) { await page.fill('#wsAsk', ask); if (process.env.PER === '0' && await page.$('#wsPer')) await page.uncheck('#wsPer'); await page.click('[data-act="gallery"]'); await page.waitForSelector('.ws-gal', { timeout: 120000 }); await page.waitForTimeout(500); }
if (process.env.USE != null && await page.$('[data-use="' + process.env.USE + '"]')) { await page.click('[data-use="' + process.env.USE + '"]'); await page.waitForTimeout(1500); }
await page.addStyleTag({ content: '.toast,#toast,[class*="toast"]{display:none!important}' });
if (process.env.SCROLL) { await page.evaluate(q => document.querySelector(q)?.scrollIntoView({ block: 'start' }), process.env.SCROLL); await page.waitForTimeout(300); }
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' }); console.log('wrote', out);
await browser.close();
