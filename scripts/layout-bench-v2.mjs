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
  pad1: [[0, 0], [210, 0], [210, 230], [0, 230]],
  wedge11: [[0, 0], [1100, 0], [0, 420]],
  // awkward real-world lots: a flag lot (a 60 ft pole to the street), a pipeline easement across the site, a wetland in it,
  // a curving frontage drawn as chords, a half-acre lot (keep-outs as plan keepout pieces: the brief's exclusions)
  flag11: [[0, 0], [60, 0], [60, 300], [560, 300], [560, 900], [-200, 900], [-200, 300], [0, 300]],
  ease14: { ring: [[0, 0], [900, 0], [900, 700], [0, 700]], keep: [{ name: 'Pipeline easement', ring: [[0, 320], [900, 380], [900, 430], [0, 370]] }] },
  wet14: { ring: [[0, 0], [900, 0], [900, 700], [0, 700]], keep: [{ name: 'Wetland', ring: [[520, 300], [700, 260], [760, 420], [600, 520], [500, 450]] }] },
  curve19: (() => { const arc = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 - k * Math.PI * 0.5 / 10; arc.push([+(450 + 900 * Math.cos(a)).toFixed(1), +(-780 + 900 * Math.sin(a)).toFixed(1)]); } arc.reverse(); return arc.concat([[arc[arc.length - 1][0], 700], [arc[0][0], 700]]); })(),
  half05: [[0, 0], [150, 0], [150, 145], [0, 145]],
  // wedge sites (synthetic): a right triangle on its long leg, a wedge whose back line curves (chords) to a point on the
  // street, a trapezoid narrowing to 60 ft, and a triangle fronting on its hypotenuse
  tri6: [[0, 0], [760, 0], [0, 700]],
  arc5: (() => { const pts = [[0, 0], [1000, 0]]; for (let k = 1; k < 8; k++) { const t = k / 8, x = 1000 * (1 - t), y = 380 * t + 70 * Math.sin(Math.PI * t); pts.push([+x.toFixed(1), +y.toFixed(1)]); } return pts.concat([[0, 380]]); })(),
  trap5: [[0, 0], [900, 0], [900, 60], [0, 420]],
  hyp5: [[1000, 0], [0, 450], [0, 0]],
  /* townhome subdivisions: 5 ac and 8 ac rectangles, a deeper 4 ac lot, 6 ac with streets on two sides (edges 0 and 1) */
  th5: [[0, 0], [660, 0], [660, 330], [0, 330]],
  th8: [[0, 0], [750, 0], [750, 465], [0, 465]],
  thdeep4: [[0, 0], [300, 0], [300, 580], [0, 580]],
  thcorner6: { ring: [[0, 0], [560, 0], [560, 467], [0, 467]], streets: [1] },
  /* angled parking: a 6 ac grocery lot, and a 3.75 ac lot whose parking bays are a few feet short of square stalls' 60 ft modules */
  grocery6: [[0, 0], [600, 0], [600, 435], [0, 435]],
  bay60: [[0, 0], [560, 0], [560, 292], [0, 292]]
};
const CASES = [
  { id: 'MF-garden-exact', family: 'multifamily', site: 'rect10', ask: 'exactly 120 garden apartments, 3 stories' },
  { id: 'MF-garden-max', family: 'multifamily', site: 'L12', ask: 'garden apartments, as many as fit' },
  { id: 'MF-garden-rot', family: 'multifamily', site: 'rot16', ask: 'at least 200 garden apartments' },
  { id: 'MF-courtyard', family: 'multifamily', site: 'rect10', ask: 'courtyard apartments, 150 units' },
  { id: 'MF-midrise', family: 'multifamily', site: 'rect10', ask: 'mid-rise apartments, 4 stories, as many as fit' },
  { id: 'MF-townhomes', family: 'multifamily', site: 'deep6', ask: 'townhomes, as many as fit' },
  { id: 'MF-townhome-lots', family: 'multifamily', site: 'rect10', ask: 'fee simple townhomes with garages, as many as fit' },
  { id: 'MF-duplex', family: 'multifamily', site: 'wedge9', ask: 'duplexes, as many as fit' },
  { id: 'MF-wedge-midrise', family: 'multifamily', site: 'wedge11', ask: 'mid-rise apartments, 4 stories, as many as fit' },
  { id: 'MF-tower', family: 'multifamily', site: 'rect10', ask: 'tower on a podium, 8 stories, 300 apartments' },
  { id: 'MF-wrap', family: 'multifamily', site: 'rect10', ask: 'a wrap building with 300 apartments' },
  { id: 'MF-tuckunder', family: 'multifamily', site: 'rect10', ask: 'tuck-under apartments, 120 units' },
  { id: 'MF-stacked', family: 'multifamily', site: 'rect10', ask: 'stacked townhomes, 120 units' },
  { id: 'MF-btr', family: 'multifamily', site: 'rect10', ask: 'build-to-rent cottages, as many as fit' },
  { id: 'RE-strip', family: 'retail', site: 'rect10', ask: 'exactly 28,000 sf retail in four buildings' },
  { id: 'RE-anchored', family: 'retail', site: 'big40', ask: 'anchored shopping center with a 40,000 sf anchor, 80,000 sf total' },
  { id: 'RE-pad', family: 'retail', site: 'pad1', ask: '2,500 sf restaurant with a drive-thru' },
  { id: 'IN-warehouse', family: 'industrial', site: 'big40', ask: 'warehouse with truck court, 250,000 sf' },
  { id: 'IN-crossdock', family: 'industrial', site: 'big40', ask: 'cross-dock warehouse, 400,000 sf' },
  { id: 'FL-flex', family: 'flex', site: 'rect10', ask: 'flex industrial buildings, 60,000 sf' },
  { id: 'MX-horizontal', family: 'mixed_use', site: 'big40', ask: '20,000 sf retail along the main road, 240 apartments behind and 80 townhomes' },
  { id: 'MX-vertical', family: 'mixed_use', site: 'rect10', ask: 'a 5-story mixed-use building with 20,000 sf ground-floor retail and 200 apartments above' },
  { id: 'LOT-flag-th', family: 'multifamily', site: 'flag11', ask: 'townhomes, as many as fit' },
  { id: 'LOT-flag-retail', family: 'retail', site: 'flag11', ask: '30,000 sf retail' },
  { id: 'LOT-easement-apt', family: 'multifamily', site: 'ease14', ask: 'garden apartments, as many as fit' },
  { id: 'LOT-wetland-apt', family: 'multifamily', site: 'wet14', ask: 'garden apartments, as many as fit' },
  { id: 'LOT-curved-apt', family: 'multifamily', site: 'curve19', ask: 'garden apartments, as many as fit' },
  { id: 'LOT-half-th', family: 'multifamily', site: 'half05', ask: 'townhomes, as many as fit' },
  { id: 'WEDGE-tri-midrise', family: 'multifamily', site: 'tri6', ask: 'mid-rise apartments, 4 stories, as many as fit' },
  { id: 'WEDGE-arc-midrise', family: 'multifamily', site: 'arc5', ask: 'mid-rise apartments, 4 stories, as many as fit' },
  { id: 'WEDGE-trap-midrise', family: 'multifamily', site: 'trap5', ask: 'mid-rise apartments, 4 stories, as many as fit' },
  { id: 'WEDGE-hyp-midrise', family: 'multifamily', site: 'hyp5', ask: 'mid-rise apartments, 4 stories, as many as fit' },
  { id: 'WEDGE-tri-garden', family: 'multifamily', site: 'tri6', ask: 'garden apartments, as many as fit' },
  // the same wedges where the parking rule is lower (one space a home: an urban, senior or affordable rule set in the
  // brief), so the land along the lines, not the parking, decides how many buildings fit
  { id: 'WEDGE-tri-1pk', family: 'multifamily', site: 'tri6', ask: 'mid-rise apartments, 4 stories, as many as fit', perUnit: 1 },
  { id: 'WEDGE-arc-1pk', family: 'multifamily', site: 'arc5', ask: 'mid-rise apartments, 4 stories, as many as fit', perUnit: 1 },
  { id: 'WEDGE-trap-1pk', family: 'multifamily', site: 'trap5', ask: 'mid-rise apartments, 4 stories, as many as fit', perUnit: 1 },
  { id: 'WEDGE-hyp-1pk', family: 'multifamily', site: 'hyp5', ask: 'mid-rise apartments, 4 stories, as many as fit', perUnit: 1 },
  { id: 'TH-sub5', family: 'multifamily', site: 'th5', ask: 'townhomes, as many as fit' },
  { id: 'TH-sub8', family: 'multifamily', site: 'th8', ask: 'townhomes, as many as fit' },
  { id: 'TH-deep4', family: 'multifamily', site: 'thdeep4', ask: 'townhomes, as many as fit' },
  { id: 'TH-corner6', family: 'multifamily', site: 'thcorner6', ask: 'townhomes, as many as fit' },
  // angled parking: asked for on a grocery-anchored center and on a retail field; not asked, on a lot whose bays suit 60°
  { id: 'RE-grocery-angled', family: 'retail', site: 'grocery6', ask: 'grocery-anchored shopping center with a 40,000 sf grocery anchor, 50,000 sf total, angled parking' },
  { id: 'RE-field-angled', family: 'retail', site: 'grocery6', ask: '40,000 sf retail with angled parking' },
  { id: 'RE-bay60', family: 'retail', site: 'bay60', ask: '30,000 sf retail' }
];
const plan = id => { const st = SITES[id], ring = Array.isArray(st) ? st : st.ring; return { origin: [-96.42, 30.38], ring, front: 0, streets: st.streets || [], setbacks: { ...SB }, elements: (st.keep || []).map((k, i) => ({ id: 'ko' + (i + 1), kind: 'keepout', poly: k.ring, name: k.name, note: 'keep out', pinned: true })) }; };
const pick = r => ({ status: r.status, fail: r.counts.fail, unknown: r.counts.unknown, failed: r.failed, warnings: (r.checks || []).filter(c => !c.hard && c.status === 'fail').map(c => c.id), units: r.quantities?.totals.units || 0, gfa: r.quantities?.totals.gfa || 0, parking: r.quantities ? [r.quantities.parking.provided, r.quantities.parking.required] : null });

let baseMods = null;
if (BASE) baseMods = { SP: await import(pathToFileURL(path.resolve(BASE, 'lib/siteplan.mjs'))), L: await import(pathToFileURL(path.resolve(BASE, 'lib/sitelayout.mjs'))) };
fs.mkdirSync(OUT, { recursive: true });
const rows = [], cards = [];
for (const c of CASES) {
  if (ONLY && !c.id.includes(ONLY)) continue;
  const p = plan(c.site), brief = B.briefFromRequest(c.ask, p);
  if (c.perUnit) brief.rules.values.parkingPerUnit = { v: c.perUnit, cls: 'assumption', source: 'bench: a lower parking rule for this case' };
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
