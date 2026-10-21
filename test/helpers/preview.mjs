// Look at sheets before pushing: node test/helpers/preview.mjs <case> <kind or number, …> [out dir]
// e.g. node test/helpers/preview.mjs sfr a-plans,a-elev /tmp/x  -> /tmp/x/<number>.pdf and .png (30 dpi; pdftoppm)
// TERRAIN=1: with lidar-like ground under the site (setctx.mjs terrainFor); DPI=60 for a closer look
// Prints through local Chromium (CHROME_PATH, default the Playwright one) and lays the sheets on the title block.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
process.env.CHROME_PATH ||= '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { ctxFor, terrainFor } = await import('./setctx.mjs'), P = await import('../../lib/planset.mjs'), { render } = await import('../../api/pdf.js'), { onBorder } = await import('../../api/planset.js');
const [name = 'retail', which = 'cover', out = '/tmp/sheets'] = process.argv.slice(2), want = which.split(',');
const ctx = ctxFor(name, process.env.TERRAIN ? { terrain: terrainFor(name) } : {}), border = await readFile(new URL('../../templates/titleblock.pdf', import.meta.url)); await mkdir(out, { recursive: true });
const sheets = ctx.sheets.filter(s => want.includes(s.kind) || want.includes(s.number) || want.includes('all'));
if (!sheets.length) { console.log('no sheets match; this case has:', ctx.sheets.map(s => s.number + ':' + s.kind).join(' ')); process.exit(1); }
for (const sh of sheets) {
  const html = P.docHTML(ctx, P.sheetPage(ctx, sh)); if (/NaN|undefined/.test(html.replace(/<[^>]+>/g, ' '))) console.log(sh.number, 'WARNING: NaN or undefined in the text');
  const pdf = await onBorder(await render(html, { sheet: 'set' }), border), f = out + '/' + sh.number; await writeFile(f + '.pdf', pdf);
  execFileSync('pdftoppm', ['-png', '-r', process.env.DPI || '30', '-singlefile', f + '.pdf', f]); console.log(sh.number, sh.kind, (pdf.length / 1024).toFixed(0) + ' KB', f + '.png');
}
process.exit(0);
