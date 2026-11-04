// Benchmark of the deterministic layout runs (lib/layoutrun.mjs) on synthetic test sites across the five families,
// every option judged by the independent validator (lib/layoutcheck.mjs). With --base <dir> (a checkout of an earlier
// commit) the same requests also go through that checkout's engine the old way (lib/sitelayout.mjs layoutOptions on the
// words' program, live clock) and are judged by the same validator: before / after on equal terms.
//   node scripts/layout-bench-v2.mjs [--out build/bench-v2] [--base <dir>] [--only <id>] [--png]
// Writes <out>/bench.json, <out>/bench.md and <out>/sheet.html (+ sheet.png with --png: Chrome at CHROME_PATH or the macOS default).
// The sites are synthetic test conditions (shapes in feet, the street on edge 0), not real parcels.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as B from '../lib/layoutbrief.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import * as V from '../lib/layoutcheck.mjs';
import { planSVG } from '../lib/sitesheet.mjs';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = arg('--out') || 'build/bench-v2', BASE = arg('--base'), ONLY = arg('--only'), PNG = process.argv.includes('--png');
const SB = { front: 25, side: 10, rear: 20, paving: 10 };
const SITES = {
  rect10: [[0, 0], [900, 0], [900, 500], [0, 500]],
  L12: [[0, 0], [800, 0], [800, 380], [420, 380], [420, 700], [0, 700]],
  deep6: [[0, 0], [330, 0], [330, 800], [0, 800]],
  wedge9: [[0, 0], [800, 0], [640, 560], [120, 600]],
  rot16: (() => { const a = 0.4, R = ([x, y]) => [+(x * Math.cos(a) - y * Math.sin(a)).toFixed(2), +(x * Math.sin(a) + y * Math.cos(a)).toFixed(2)]; return [[0, 0], [1000, 0], [1000, 700], [0, 700]].map(R); })(),
  big40: [[0, 0], [1500, 0], [1500, 1160], [0, 1160]],
  pad1: [[0, 0], [210, 0], [210, 230], [0, 230]]
};
const CASES = [
  { id: 'MF-garden-exact', family: 'multifamily', site: 'rect10', ask: 'exactly 120 garden apartments, 3 stories' },
  { id: 'MF-garden-max', family: 'multifamily', site: 'L12', ask: 'garden apartments, as many as fit' },
  { id: 'MF-garden-rot', family: 'multifamily', site: 'rot16', ask: 'at least 200 garden apartments' },
  { id: 'MF-courtyard', family: 'multifamily', site: 'rect10', ask: 'courtyard apartments, 150 units' },
  { id: 'MF-midrise', family: 'multifamily', site: 'rect10', ask: 'mid-rise apartments, 4 stories, as many as fit' },
  { id: 'MF-townhomes', family: 'multifamily', site: 'deep6', ask: 'townhomes, as many as fit' },
  { id: 'MF-duplex', family: 'multifamily', site: 'wedge9', ask: 'duplexes, as many as fit' },
  { id: 'MF-tower', family: 'multifamily', site: 'rect10', ask: 'tower on a podium, 8 stories, 300 apartments' },
  { id: 'MF-wrap', family: 'multifamily', site: 'rect10', ask: 'a wrap building with 300 apartments' },
  { id: 'MF-tuckunder', family: 'multifamily', site: 'rect10', ask: 'tuck-under apartments, 120 units' },
  { id: 'RE-strip', family: 'retail', site: 'rect10', ask: 'exactly 28,000 sf retail in four buildings' },
  { id: 'RE-anchored', family: 'retail', site: 'big40', ask: 'anchored shopping center with a 40,000 sf anchor, 80,000 sf total' },
  { id: 'RE-pad', family: 'retail', site: 'pad1', ask: '2,500 sf restaurant with a drive-thru' },
  { id: 'IN-warehouse', family: 'industrial', site: 'big40', ask: 'warehouse with truck court, 250,000 sf' },
  { id: 'IN-crossdock', family: 'industrial', site: 'big40', ask: 'cross-dock warehouse, 400,000 sf' },
  { id: 'FL-flex', family: 'flex', site: 'rect10', ask: 'flex industrial buildings, 60,000 sf' },
  { id: 'MX-horizontal', family: 'mixed_use', site: 'big40', ask: '20,000 sf retail along the main road, 240 apartments behind and 80 townhomes' },
  { id: 'MX-vertical', family: 'mixed_use', site: 'rect10', ask: 'a 5-story mixed-use building with 20,000 sf ground-floor retail and 200 apartments above' }
];
const plan = id => ({ origin: [-96.42, 30.38], ring: SITES[id], front: 0, streets: [], setbacks: { ...SB } });
const pick = r => ({ status: r.status, fail: r.counts.fail, unknown: r.counts.unknown, failed: r.failed, warnings: (r.checks || []).filter(c => !c.hard && c.status === 'fail').map(c => c.id), units: r.quantities?.totals.units || 0, gfa: r.quantities?.totals.gfa || 0, parking: r.quantities ? [r.quantities.parking.provided, r.quantities.parking.required] : null });

let baseMods = null;
if (BASE) baseMods = { SP: await import(pathToFileURL(path.resolve(BASE, 'lib/siteplan.mjs'))), L: await import(pathToFileURL(path.resolve(BASE, 'lib/sitelayout.mjs'))) };
fs.mkdirSync(OUT, { recursive: true });
const rows = [], cards = [];
for (const c of CASES) {
  if (ONLY && !c.id.includes(ONLY)) continue;
  const p = plan(c.site), brief = B.briefFromRequest(c.ask, p);
  const t0 = Date.now(), rec = RUN.runBrief(brief), ms = Date.now() - t0, again = RUN.runBrief(JSON.parse(JSON.stringify(brief)));
  const same = again.rankingHash === rec.rankingHash && again.options.every((o, i) => o.geometryHash === rec.options[i]?.geometryHash);
  const row = { id: c.id, family: c.family, site: c.site, ask: c.ask, outcome: rec.outcome, problems: (rec.problems || []).map(x => x.msg), ms, replayIdentical: same, evaluation: rec.solver?.evaluation || null,
    options: rec.options.map(o => ({ name: o.name, ...pick(o.validation) })), distinct: new Set(rec.options.map(o => o.geometryHash)).size };
  if (baseMods) {
    const bt = Date.now(); let out = []; try { out = baseMods.L.layoutOptions({ ...p }, baseMods.SP.guessProgram(c.ask), {}); } catch (e) { row.baseError = e.message; }
    const cb = B.canonicalBrief(brief); row.base = { ms: Date.now() - bt, options: out.filter(o => o.elements?.length).map(o => ({ name: o.name, ...pick(V.validateLayout({ ...p, elements: o.elements, program: o.program }, cb)) })) };
  }
  rows.push(row);
  const top = rec.options[0];
  let svg = ''; try { if (top) svg = planSVG({ ...p, elements: top.elements, program: top.program }, { px: 520, pad: 18 }).svg; } catch (e) { svg = '<p>drawing failed: ' + e.message + '</p>'; }
  cards.push({ c, row, svg, top });
  console.log(c.id.padEnd(16), rec.outcome.padEnd(18), (top ? top.validation.status + ' ' + (top.quantities.totals.units ? top.quantities.totals.units + ' u' : top.quantities.totals.gfa + ' sf') + ' pk ' + top.quantities.parking.provided + '/' + top.quantities.parking.required : (rec.problems || []).map(x => x.msg).join('; ').slice(0, 80)).padEnd(40),
    'replay ' + (same ? 'same' : 'DIFF'), top ? 'warn ' + (top.validation.checks.filter(c => !c.hard && c.status === 'fail').map(c => c.id).join(',') || '-') : '', ms + 'ms', row.base ? '| before: ' + row.base.options.map(o => o.status + (o.failed.length ? '(' + o.failed.join(',') + ')' : '')).join(' ') : '');
}
const esc = s => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
fs.writeFileSync(path.join(OUT, 'bench.json'), JSON.stringify(rows, null, 1));
const md = ['| Case | Family | Outcome | Top option | Fails | Unknown | Replay | Before (same validator) |', '|---|---|---|---|---|---|---|---|'].concat(rows.map(r => { const o = r.options[0]; return '| ' + [r.id, r.family, r.outcome, o ? o.status + ' · ' + (o.units ? o.units + ' units' : o.gfa.toLocaleString('en-US') + ' sf') + ' · parking ' + o.parking.join('/') : (r.problems[0] || '').slice(0, 70), o ? o.failed.join(', ') || '—' : '—', o ? o.unknown : '—', r.replayIdentical ? 'identical' : 'DIFFERS', r.base ? r.base.options.map(b => b.status + (b.failed.length ? ' (' + b.failed.join(', ') + ')' : '')).join('; ') || 'no options' : 'n/a'].join(' | ') + ' |'; }));
fs.writeFileSync(path.join(OUT, 'bench.md'), md.join('\n') + '\n');
const html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:11px Arial;background:#fff;width:2240px}.g{display:grid;grid-template-columns:repeat(4,550px);gap:10px;padding:10px}.c{border:1px solid #ccc;padding:4px}.c svg{width:540px;height:auto;max-height:420px}.h{font-weight:bold}.f{color:#b00}.ok{color:#060}</style></head><body><div class="g">' +
  cards.map(({ c, row, svg, top }) => '<div class="c"><div class="h">' + esc(c.id + ' · ' + c.site + ' · ' + c.ask) + '</div><div class="' + (top?.validation.status === 'pass' ? 'ok' : 'f') + '">' + esc(row.outcome + (top ? ' · ' + top.name + ' · ' + top.validation.status + ' · ' + (top.quantities.totals.units ? top.quantities.totals.units + ' units' : top.quantities.totals.gfa + ' sf') + ' · parking ' + top.quantities.parking.provided + '/' + top.quantities.parking.required + (top.validation.failed.length ? ' · fails ' + top.validation.failed.join(', ') : '') : ' · ' + row.problems.join('; '))) + '</div>' + svg + '</div>').join('') + '</div></body></html>';
fs.writeFileSync(path.join(OUT, 'sheet.html'), html);
if (PNG) { // CHROME_PATH, else Google Chrome where macOS keeps it
  const puppeteer = (await import('puppeteer-core')).default, exe = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const b = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] }), pg = await b.newPage(); await pg.setViewport({ width: 2240, height: 1200 });
  await pg.goto(pathToFileURL(path.resolve(OUT, 'sheet.html')).href); await pg.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true }); await b.close(); }
console.log('\n' + rows.length + ' cases: ' + rows.filter(r => r.options[0]?.status === 'pass').length + ' top option passes, ' + rows.filter(r => r.replayIdentical).length + ' replay identical; ' + OUT + '/bench.md');
