// @ts-check
// Screenshots of the feasibility workspace with Playwright: the sample project (scripts/sample-project.mjs) loaded into
// the app on the local dev server (scripts/dev.mjs), each step at desktop size and the main ones at phone size, saved
// to docs/screenshots/. Uses the local Chrome (CHROME_PATH or the usual install paths). Also fails on page errors.
//   node scripts/screenshots.mjs
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { sampleProject } from './sample-project.mjs';
import { marketContext } from '../lib/feasibility/market.mjs';
import { localChrome } from '../test/helpers/chrome.mjs';

const root = new URL('..', import.meta.url).pathname, out = root + 'docs/screenshots/', PORT = 8797;
const market = marketContext({ area: JSON.parse(await readFile(root + 'data/area.json', 'utf8')), markets: JSON.parse(await readFile(root + 'data/markets.json', 'utf8')) });
const project = await sampleProject({ market });
await mkdir(out, { recursive: true });

const server = spawn(process.execPath, ['scripts/dev.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, no) => { server.stdout.on('data', d => { if (/dev: http/.test(String(d))) ok(null); }); server.on('exit', c => no(new Error('dev server exited ' + c))); setTimeout(() => no(new Error('dev server did not start')), 60000); });
const errors = [], a11y = []; // a11y: WCAG 2.1 A/AA violations axe-core finds in the workspace, by step and screen size
const browser = await chromium.launch({ executablePath: localChrome() || undefined });
try {
  /** @type {[string, { width: number, height: number }, string[]][]} */
  const runs = [['desktop', { width: 1440, height: 1000 }, ['intake', 'site', 'plans', 'budget', 'proforma', 'reports']], ['mobile', { width: 390, height: 844 }, ['intake', 'proforma']]];
  for (const [label, viewport, steps] of runs) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: label === 'mobile' ? 2 : 1, reducedMotion: 'reduce' });
    await ctx.addInitScript(p => { try { localStorage.setItem('fs-projects-v1', JSON.stringify({ projects: [p], dirty: [], gone: [] })); localStorage.setItem('fs-team-name', 'Screenshot'); } catch (e) { /* private mode */ } }, project);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(label + ': ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile|maptiler|404/i.test(m.text())) errors.push(label + ' console: ' + m.text()); });
    await page.goto('http://127.0.0.1:' + PORT + '/#v=projects&pj=' + project.id, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#wsRoot .ws-kpi b', { timeout: 60000 });
    for (const step of steps) {
      await page.click('.ws-step[data-step="' + step + '"]');
      await page.waitForFunction(s => /** @type {HTMLElement|null} */ (document.querySelector('.ws-step[aria-current="step"]'))?.dataset.step === s, step);
      if (step === 'proforma' || step === 'reports') await page.waitForSelector('.ws-tor, .ws-files', { timeout: 60000 });
      await page.waitForTimeout(300);
      await page.addStyleTag({ content: '.toast,#toast,[class*="toast"]{display:none!important}' }); // (the map's tile notices aren't part of the workspace)
      const ax = await new AxeBuilder({ page }).include('#wsRoot').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of ax.violations) a11y.push({ step, label, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') || '' });
      await page.screenshot({ path: out + 'workspace-' + step + '-' + label + '.png', fullPage: label === 'desktop' ? false : true });
      // further down the step (the project page scrolls inside its own panel, so each section is scrolled to and shot)
      const more = label === 'desktop' ? ({ budget: [['lines', '.ws-card:nth-of-type(2) h4']], proforma: [['assumptions', '.ws-two.wide'], ['sensitivity', '.ws-grid2']], site: [], plans: [['sheets', '.ws-card:nth-of-type(2) h4']], intake: [['parcels', '.ws-card:nth-of-type(2) h4']], reports: [['saved', '.ws-card:nth-of-type(2) h4']] })[step] || [] : [];
      for (const [name, sel] of more) { if (await page.$(sel)) { await page.evaluate(q => document.querySelector(q)?.scrollIntoView({ block: 'start' }), sel); await page.waitForTimeout(200); await page.screenshot({ path: out + 'workspace-' + step + '-' + name + '-desktop.png' }); } }
    }
    if (label === 'desktop') { // an edited assumption updates the numbers live
      await page.click('.ws-step[data-step="proforma"]'); await page.waitForSelector('.ws-tor');
      const before = await page.textContent('.ws-kpis.big .ws-kpi:nth-child(4) b');
      const input = page.locator('[data-as="rents.1 BR"]'); await input.fill('1600'); await page.waitForTimeout(900);
      const after = await page.textContent('.ws-kpis.big .ws-kpi:nth-child(4) b');
      if (before === after) errors.push('editing an assumption did not update the levered IRR (' + before + ')');
      await page.screenshot({ path: out + 'workspace-proforma-edited-desktop.png' });
    }
    await ctx.close();
  }
} finally { await browser.close(); server.kill(); }
await writeFile(out + 'axe-results.json', JSON.stringify(a11y, null, 1));
if (a11y.length) errors.push(a11y.length + ' accessibility violations (docs/screenshots/axe-results.json): ' + [...new Set(a11y.map(v => v.id))].join(', '));
if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
console.log('screenshots saved to docs/screenshots/; no WCAG 2.1 AA violations found by axe-core');
