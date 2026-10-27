// @ts-check
// A whole schematic plan set for a test request on a test lot (scripts/layout-review.mjs LOTS), printed on the title
// block and split into one PNG a sheet, for a person to look through:
//   node scripts/planset-review.mjs <outdir> <lot> "<request>" [option number]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import * as PS from '../lib/planset.mjs';
import { LOTS } from './layout-review.mjs';
import { buildingTypes, fallbackDesign, placeDesign } from '../lib/plandesign.mjs';
const { localChrome } = await import('../test/helpers/chrome.mjs');
if (!localChrome()) { console.error('No local Chrome/Chromium: set CHROME_PATH.'); process.exit(1); }
const { render, closeBrowser } = await import('../lib/pdf.mjs');
const { onBorder } = await import('../api/planset.js');

const [out, lot, ask, nOpt = '1'] = process.argv.slice(2);
if (!out || !LOTS[lot] || !ask) { console.error('usage: node scripts/planset-review.mjs <outdir> <lot: ' + Object.keys(LOTS).join('|') + '> "<request>" [option]'); process.exit(1); }
await mkdir(out, { recursive: true });
const plan0 = LOTS[lot].plan(), prog = S.guessProgram(ask), os = L.layoutOptions(plan0, prog), o = os[+nOpt - 1];
const option = { ...plan0, name: o.name, elements: o.elements, zones: o.zones, program: o.program || prog, recipe: o.recipe };
const types = buildingTypes(option), designs = {};
// (the app asks the AI for each building type's floor plan; offline, the rule-based plan every type falls back to)
for (const t of types.filter(t => t.supported)) { try { designs[t.id] = placeDesign(fallbackDesign(t), t).design; } catch (e) { console.log('no design for', t.id, t.use, e.message); } }
console.log(types.length + ' building types:', types.map(t => t.id + ' ' + t.use + ' ' + t.W + 'x' + t.D + ' ' + t.floors + 'fl').join(', '));
const sheets = PS.sheetList(option, { types });
console.log(sheets.length + ' sheets:', sheets.map(s => s.no || s.id || s.kind).join(' '));
const html = PS.setHTML({ plan: option, project: { name: 'Review: ' + ask }, client: 'Finishes Solutions', address: LOTS[lot].label, county: 'Waller County', date: new Date().toISOString().slice(0, 10), sheets, types, designs });
await writeFile(out + '/set.html', html);
const pdf = await onBorder(await render(html, { sheet: 'set', title: 'Plan set' }), await readFile('templates/titleblock.pdf'));
await writeFile(out + '/set.pdf', pdf); await closeBrowser();
execFileSync('pdftoppm', ['-r', '30', '-png', out + '/set.pdf', out + '/sheet']);
console.log('wrote', out + '/set.pdf', 'and a PNG a sheet');
