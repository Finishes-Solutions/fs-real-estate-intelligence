// @ts-check
// One sample project from intake to its full report set, entirely on this platform and offline: every outbound
// request is refused (the source repos' deployments, and everything else, are unreachable; any attempt is recorded and
// fails the run). Uses the platform's committed data files, its own layout engine, budget, pro forma, plan-set builder
// and report renderer, and the local Chrome for PDFs. Output: docs/sample-output/.
//   node scripts/sample-run.mjs
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';

const attempts = [];
globalThis.fetch = async url => { attempts.push(String(url)); throw new Error('network blocked in the sample run: ' + url); };
const { localChrome } = await import('../test/helpers/chrome.mjs');
if (!localChrome()) { console.error('No local Chrome/Chromium: set CHROME_PATH to print the PDFs.'); process.exit(1); }

const root = new URL('..', import.meta.url).pathname, out = root + 'docs/sample-output/';
process.chdir(root);
const { sampleProject } = await import('./sample-project.mjs');
const { marketContext } = await import('../lib/feasibility/market.mjs');
const P = await import('../lib/feasibility/pipeline.mjs');
const API = await import('../api/feasibility.js');
const { render, closeBrowser } = await import('../lib/pdf.mjs');
const { sheetHTML } = await import('../lib/sitesheet.mjs');
const PS = await import('../lib/planset.mjs');
const { onBorder } = await import('../api/planset.js');

const t0 = Date.now();
const market = marketContext({ area: JSON.parse(await readFile('data/area.json', 'utf8')), markets: JSON.parse(await readFile('data/markets.json', 'utf8')) });
// 1-2 intake and site: the parcels, laid out by the platform's layout engine
const project = await sampleProject({ market }), option = project.plans[0];
// 3-6 plan set data, budget, pro forma, sensitivity, scenarios, registers
const study = P.runStudy(project, { market }), scenarios = P.compareScenarios(project, { market });
if (study.missing || study.errors.length) throw new Error('the sample study is incomplete: ' + (study.missing || study.errors.join(' ')));
// the report set, as the API makes it
const files = await API.reportFiles(project, study, { scenarios });
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
for (const f of files) await writeFile(out + f.name.replace(/-[0-9a-f]{8}(?=[.-])/, ''), f.buf);
// the site plan sheet (11 x 17) and the plan set's cover and site plan sheets on the title block (24 x 36)
const sheet = await render(sheetHTML({ plan: option, project: { name: project.name, client: project.client }, size: 'tabloid' }), { sheet: 'tabloid', title: 'Site plan' });
await writeFile(out + 'site-plan-sheet.pdf', sheet);
const pick = PS.sheetList(option, { sections: ['general', 'civil'] }).filter(s => ['cover', 'siteplan'].includes(s.kind));
const setHtml = PS.setHTML({ plan: option, project: { name: project.name }, client: project.client, address: project.fz.intake.address, county: 'Waller County', date: '2026-10-24', sheets: pick });
await writeFile(out + 'plan-set-excerpt.pdf', await onBorder(await render(setHtml, { sheet: 'set', title: 'Plan set' }), await readFile('templates/titleblock.pdf')));
await closeBrowser();
await writeFile(out + 'sample-project.json', JSON.stringify(project, null, 1));

const h = study.pf.headline, T = study.budget.totals, pct = v => v == null ? '—' : (v * 100).toFixed(2) + '%', usd = v => (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
const md = `# Sample run: ${project.name}

Made by \`node scripts/sample-run.mjs\` on ${new Date().toISOString().slice(0, 10)} — offline: every outbound request was refused (${attempts.length} attempted). Inputs hash \`${study.inputsHash}\`. ${((Date.now() - t0) / 1000).toFixed(1)} s.

${study.scope}

## Steps
1. **Intake** — ${project.parcels.length} parcels (anonymized appraisal-district outlines near Waller, TX), ${study.site.acres.toFixed(2)} acres; asking price ${usd(project.fz.intake.landPrice)} (a sample input).
2. **Site** — the platform's layout engine: ${option.laidAs}; ${study.site.units} units, ${Math.round(study.site.gfa).toLocaleString('en-US')} gross sf, ${study.site.spaces} of ${study.site.required} parking spaces, buildable envelope ${(study.site.envelope.ratio * 100).toFixed(0)}% of the site at a ${study.site.envelope.setbackFt} ft setback.
3. **Plans** — ${study.planset.sheets.length}-sheet schematic set listed; cover and site plan sheets printed on the title block (\`plan-set-excerpt.pdf\`), and the 11×17 site plan sheet (\`site-plan-sheet.pdf\`).
4. **Budget** — ${study.budget.lines.length} CSI lines: construction contract ${usd(T.contract)}, project cost before financing ${usd(T.project)}.
5. **Pro forma** — total development cost ${usd(h.totalCost)}; stabilized NOI ${usd(h.noi)}; yield on cost ${pct(h.yoc)}; levered IRR ${pct(h.levIrr)}; unlevered IRR ${pct(h.unlevIrr)}; levered NPV at ${study.values.discountRate}% ${usd(h.npvLev)}.
6. **Reports** — the files below.

## Scenarios
| Scenario | Total cost | NOI | Yield on cost | Levered IRR |
|---|---|---|---|---|
${scenarios.map(x => `| ${x.name} | ${usd(x.headline.totalCost)} | ${usd(x.headline.noi)} | ${pct(x.headline.yoc)} | ${pct(x.headline.levIrr)} |`).join('\n')}

## Top risks
${study.risks.filter(r => r.level !== 'low').map(r => `- **${r.level}** — ${r.title}: ${r.detail}`).join('\n')}

## Files
${[...files.map(f => f.name.replace(/-[0-9a-f]{8}(?=[.-])/, '')), 'site-plan-sheet.pdf', 'plan-set-excerpt.pdf', 'sample-project.json'].map(f => '- `' + f + '`').join('\n')}
`;
await writeFile(out + 'README.md', md);
if (attempts.length) { console.error('Outbound requests were attempted:\n' + attempts.join('\n')); process.exit(1); }
console.log('sample run: ' + study.site.units + ' units, total cost ' + usd(h.totalCost) + ', levered IRR ' + pct(h.levIrr) + '; no outbound requests; docs/sample-output/');
