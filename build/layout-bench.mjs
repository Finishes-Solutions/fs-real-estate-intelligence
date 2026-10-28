// A stress test of the site layout engine (lib/sitelayout.mjs) the way the MCP site_plan tool runs it at Low effort
// (lib/mcp/siteplan.mjs: the request read directly, the layouts, the quality check, the pick), on made-up parcels of many
// sizes and shapes and many programs, single uses and mixes. No network and no AI: the street is the side named, there
// are no site facts. Each run is scored against what a land planner would expect for the product (density or floor area
// ratio), how much land is left with nothing on it, and what the quality check and the plan checks say.
//   node build/layout-bench.mjs [--only <text>] [--out <dir>] [--sheet]
// writes <out>/bench.json, <out>/bench.md and, with --sheet, <out>/sheet-<n>.html contact sheets of the picked plans
// (open them, or print them with Chromium: CHROME_PATH=... node build/layout-bench.mjs --sheet --png).
import fs from 'node:fs';
import path from 'node:path';
import * as SP from '../lib/siteplan.mjs';
import { layoutOptions } from '../lib/sitelayout.mjs';
import { planFor, named, homeArgs } from '../lib/mcp/siteplan.mjs';
import { auditPlan } from '../lib/planaudit.mjs';
import * as G from '../lib/guardrails.mjs';
import * as RUN from '../lib/planruns.mjs';
import { effortOf } from '../lib/planask.mjs';
import { planSVG } from '../lib/sitesheet.mjs';

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = arg('--out') || 'build/bench-out', ONLY = arg('--only'), SHEET = process.argv.includes('--sheet'), PNG = process.argv.includes('--png');
const ORIGIN = [-96.42, 30.38]; // rural Washington County: no city, no guardrails

// ---------- parcels: a shape in feet (x east, y north), its street edge first (from [0] to [1]), scaled to an area ----------
const SHAPES = {
  rect: [[0, 0], [2, 0], [2, 1], [0, 1]], // 2:1, street on the long side
  deep: [[0, 0], [1, 0], [1, 2.5], [0, 2.5]], // narrow frontage, deep
  square: [[0, 0], [1, 0], [1, 1], [0, 1]],
  strip: [[0, 0], [6, 0], [6, 1], [0, 1]], // long and shallow
  L: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]],
  trapezoid: [[0, 0], [2.2, 0], [1.6, 1.2], [0.3, 1.1]],
  triangle: [[0, 0], [2, 0], [0.4, 1.8]],
  irregular: [[0, 0], [1.1, 0.05], [1.5, 0.6], [1.25, 1.3], [0.45, 1.45], [-0.15, 0.9], [-0.05, 0.4]],
  flag: [[0, 0], [0.18, 0], [0.18, 0.9], [1.6, 0.9], [1.6, 2.2], [-0.4, 2.2], [-0.4, 0.9], [0, 0.9]] // a stem to the street
};
const area = r => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0)) / 2;
function parcel(shape, acres) {
  const r = SHAPES[shape], k = Math.sqrt(acres * 43560 / area(r)), kx = 364567 * Math.cos(ORIGIN[1] * Math.PI / 180);
  const ll = r.map(([x, y]) => [ORIGIN[0] + x * k / kx, ORIGIN[1] + y * k / 364567]);
  return { type: 'Polygon', coordinates: [ll.concat([ll[0]])] };
}

// ---------- programs: the request (as words, as an agent sends it) and what a planner would expect ----------
// expect: { du: [low, high] dwelling units per gross acre } or { far: [low, high] }, for a typical suburban Texas site
const PROGRAMS = [
  { id: 'retail', ask: 'retail center with pad sites, as big as fits', expect: { far: [0.15, 0.25] }, sizes: [2, 6, 15] },
  { id: 'retail-30k', ask: '30,000 sf retail strip with 2 pad sites', expect: { asked: { gfa: 30000 } }, sizes: [5] },
  { id: 'industrial', ask: 'warehouse with truck court, as big as fits', expect: { far: [0.35, 0.5] }, sizes: [5, 20, 60] },
  { id: 'office', ask: 'suburban office buildings, 2 stories, as big as fits', expect: { far: [0.2, 0.35] }, sizes: [3, 10] },
  { id: 'medical', ask: '20,000 sf medical office building', expect: { asked: { gfa: 20000 } }, sizes: [3] },
  { id: 'multifamily', ask: 'garden-style apartments, 3 stories, as many as fit', expect: { du: [16, 26] }, sizes: [5, 15, 30] },
  { id: 'sfr', ask: 'single-family homes on 50 ft lots', expect: { du: [3.8, 5.5] }, sizes: [10, 21, 60] },
  { id: 'sfr-40', ask: 'single-family homes on 40 ft lots, 1,200 to 1,600 sf, 1 story', expect: { du: [5, 7] }, sizes: [21] },
  { id: 'townhomes', ask: 'townhomes, as many as fit', expect: { du: [8, 14] }, sizes: [5, 15] },
  { id: 'btr', ask: 'build-to-rent community of 1-story detached homes of about 1,300 sf', args: { home_type: 'manufactured', home_size: '32x42', pad_size: '42x80' }, expect: { du: [6, 9] }, sizes: [21] },
  { id: 'tiny', ask: 'tiny home community', args: { home_type: 'tiny', pad_size: '25x55' }, expect: { du: [10, 20] }, sizes: [10] },
  { id: 'storage', ask: 'self storage facility, as big as fits', expect: { far: [0.35, 0.6] }, sizes: [4] },
  { id: 'gas', ask: 'gas station with convenience store and car wash', expect: { buildings: 2 }, sizes: [2.5] },
  { id: 'mixed-2', ask: 'retail along the front and apartments behind', expect: { mixed: 2 }, sizes: [15, 30] },
  { id: 'mixed-4', ask: 'mixed use: retail along the front, an industrial warehouse, garden apartments and single-family homes', expect: { mixed: 4 }, sizes: [60, 120] },
  { id: 'mixed-4b', ask: '40,000 sf retail, 150,000 sf warehouse, 240 apartments and 80 single-family homes', expect: { mixed: 4 }, sizes: [80] }
];
const SHAPE_SETS = { default: ['rect', 'deep', 'irregular'], big: ['rect', 'L', 'trapezoid', 'irregular'], small: ['rect', 'square', 'triangle'] };

const L = effortOf('low');
async function run(prog0, shape, acres) {
  const t0 = Date.now(), args = { request: prog0.ask, ...(prog0.args || {}) };
  const recs = [{ label: 'Bench ' + shape, owner: '', propId: null, acres, geometry: parcel(shape, acres), center: null }];
  const { plan: plan0 } = await planFor(recs, [], '');
  const plan = { ...plan0, front: 0, streets: [], frontGuess: false };
  const HA = homeArgs(args), ask = args.request + (HA.words.length ? ' (' + HA.words.join(', ') + ')' : '');
  let prog = SP.guessProgram(ask);
  const kind = HA.o.homeKind || SP.normalizeProgram(prog).homeKind;
  if (HA.any && kind) prog = { ...(prog?.use === 'sfr' && !prog.zones ? prog : { use: 'sfr' }), ...HA.o, homeKind: kind };
  const np = SP.normalizeProgram(prog), params0 = RUN.fillParams(np.form ? { form: np.form } : {}, { ask });
  const planL = { ...plan, ...(params0 ? { params: params0 } : {}) };
  let out = [], err = '';
  try { out = layoutOptions(planL, prog, { ...L.layout, deeper: true }); } catch (e) { err = e.message; }
  const variants = named(out, { ...planL, program: prog }, params0 ? { params: params0 } : {});
  const pOf = v => ({ ...planL, setbacks: v.setbacks || planL.setbacks, program: v.program || prog, params: v.params || planL.params, zones: v.zones || [], elements: v.elements || [] });
  for (const v of variants) if (v.elements?.length) { try { v.audit = auditPlan(pOf(v), { units: HA.o.units, homeKind: kind || null }); } catch (e) { v.audit = null; } }
  const L0 = RUN.landing(variants, null); let pick = L0.put;
  if (pick >= 0 && variants[pick].audit?.fails) { const j = variants.findIndex(x => x.elements?.length && x.audit && !x.audit.fails); if (j >= 0) pick = j; }
  const ms = Date.now() - t0;
  if (pick < 0) return { prog: prog0.id, shape, acres, ms, err: err || 'nothing fits', readAs: RUN.readAs(np, SP.USES).join(' · '), options: out.length };
  const v = variants[pick], p = pOf(v), m = v.m, B = v.elements.filter(e => e.kind === 'building');
  const uses = [...new Set(B.map(e => e.use || np.use))];
  const checks = G.check(p).map(i => i.text);
  const res = { prog: prog0.id, shape, acres, ms, options: out.length, readAs: RUN.readAs(np, SP.USES).join(' · '), layout: v.name,
    units: m.units || 0, du: +((m.units || 0) / m.acres).toFixed(1), gfa: Math.round(m.gfa), far: +m.far.toFixed(2), buildings: B.length, uses, spaces: m.spaces, required: m.required,
    pondPct: Math.round(m.pond / (m.acres * 43560) * 100), openPct: Math.round(m.green * 100), coverPct: Math.round(m.coverage * 100),
    verdict: v.audit?.verdict || '?', fails: (v.audit?.items || []).filter(i => i.level === 'fail').map(i => i.text), warns: (v.audit?.items || []).filter(i => i.level === 'warn').map(i => i.text), checks, notes: v.notes || [] };
  res.flags = flags(prog0, res, np);
  if (SHEET) { try { res.svg = planSVG(p, { px: 520, pad: 20 }).svg; } catch (e) { res.svg = ''; } }
  return res;
}
// what a planner would question in this result
function flags(P, r, np) {
  const f = [], e = P.expect || {};
  if (e.du) { if (r.du < e.du[0] * 0.8) f.push('low density ' + r.du + ' du/ac (expect ' + e.du.join('–') + ')'); if (r.du > e.du[1] * 1.3) f.push('very high density ' + r.du + ' du/ac (expect ' + e.du.join('–') + ')'); }
  if (e.far) { if (r.far < e.far[0] * 0.8) f.push('low FAR ' + r.far + ' (expect ' + e.far.join('–') + ')'); if (r.far > e.far[1] * 1.4) f.push('very high FAR ' + r.far + ' (expect ' + e.far.join('–') + ')'); }
  if (e.asked?.gfa && Math.abs(r.gfa - e.asked.gfa) / e.asked.gfa > 0.25) f.push('asked ' + e.asked.gfa + ' sf, got ' + r.gfa + ' sf');
  if (e.mixed && r.uses.length < e.mixed) f.push('asked ' + e.mixed + ' uses, got ' + r.uses.length + ' (' + r.uses.join(', ') + ')');
  if (e.buildings && r.buildings < e.buildings) f.push('asked ' + e.buildings + ' buildings, got ' + r.buildings);
  const residential = ['sfr', 'townhomes', 'duplex', 'multifamily'].includes(np.use);
  if (!residential && r.openPct > 45 && !e.mixed) f.push('half the site unused (' + r.openPct + '% open)');
  if (residential && r.openPct > 60) f.push('much land unused (' + r.openPct + '% open)');
  if (r.spaces < r.required * 0.95) f.push('parking short ' + (r.required - r.spaces));
  if (r.fails.length) f.push('quality check failed: ' + r.fails[0]);
  if (r.checks.length) f.push('plan check: ' + r.checks[0]);
  return f;
}

const jobs = [];
for (const P of PROGRAMS) {
  if (ONLY && !P.id.includes(ONLY)) continue;
  const shapes = P.id.startsWith('mixed') || P.sizes.some(s => s >= 50) ? SHAPE_SETS.big : P.sizes.every(s => s <= 4) ? SHAPE_SETS.small : SHAPE_SETS.default;
  for (const acres of P.sizes) for (const shape of shapes) jobs.push([P, shape, acres]);
}
fs.mkdirSync(OUT, { recursive: true });
const results = [];
for (const [P, shape, acres] of jobs) {
  let r; try { r = await run(P, shape, acres); } catch (e) { r = { prog: P.id, shape, acres, err: 'crashed: ' + e.message, ms: 0 }; }
  results.push(r);
  console.log([P.id.padEnd(11), shape.padEnd(9), String(acres).padStart(5) + ' ac', r.err ? 'ERROR ' + r.err : (r.units ? r.units + ' du ' + r.du + '/ac' : r.gfa + ' sf FAR ' + r.far) + ' · ' + r.verdict + (r.flags.length ? ' · ' + r.flags.join('; ') : ''), (r.ms / 1000).toFixed(1) + 's'].join('  '));
}
const ok = results.filter(r => !r.err && !r.flags.length).length;
console.log('\n' + results.length + ' runs: ' + ok + ' clean, ' + results.filter(r => r.err).length + ' errors, ' + results.filter(r => !r.err && r.flags.length).length + ' flagged');
fs.writeFileSync(path.join(OUT, 'bench.json'), JSON.stringify(results.map(({ svg, ...r }) => r), null, 1));
fs.writeFileSync(path.join(OUT, 'bench.md'), '| Program | Shape | Acres | Result | Verdict | Flags |\n|---|---|---|---|---|---|\n' + results.map(r => '| ' + [r.prog, r.shape, r.acres, r.err ? 'ERROR ' + r.err : (r.units ? r.units + ' du (' + r.du + '/ac)' : r.gfa.toLocaleString() + ' sf (FAR ' + r.far + ')') + ', ' + r.buildings + ' bldgs', r.verdict || '', (r.flags || []).join('; ')].join(' | ') + ' |').join('\n'));
if (SHEET) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const pages = []; for (let i = 0; i < results.length; i += 12) pages.push(results.slice(i, i + 12));
  for (const [n, page] of pages.entries()) {
    const html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:11px Arial;background:#fff;width:2200px}.g{display:grid;grid-template-columns:repeat(4,540px);gap:10px;padding:10px}.c{border:1px solid #ccc;padding:4px}.c svg{width:530px;height:auto;max-height:380px}.h{font-weight:bold}.f{color:#b00}</style></head><body><div class="g">' +
      page.map(r => '<div class="c"><div class="h">' + esc(r.prog + ' · ' + r.shape + ' · ' + r.acres + ' ac') + '</div><div>' + esc(r.err ? 'ERROR ' + r.err : (r.units ? r.units + ' du, ' + r.du + '/ac' : r.gfa.toLocaleString() + ' sf, FAR ' + r.far) + ' · ' + r.buildings + ' bldgs · ' + r.verdict + ' · open ' + r.openPct + '% · pond ' + r.pondPct + '%') + '</div><div class="f">' + esc((r.flags || []).join('; ')) + '</div>' + (r.svg || '') + '</div>').join('') + '</div></body></html>';
    fs.writeFileSync(path.join(OUT, 'sheet-' + (n + 1) + '.html'), html);
  }
  if (PNG) { const { render } = await import('../lib/pdf.mjs'); const puppeteer = (await import('puppeteer-core')).default;
    const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
    for (let n = 1; n <= pages.length; n++) { const pg = await b.newPage(); await pg.setViewport({ width: 2200, height: 1200 }); await pg.goto('file://' + path.resolve(OUT, 'sheet-' + n + '.html')); await pg.screenshot({ path: path.join(OUT, 'sheet-' + n + '.png'), fullPage: true }); await pg.close(); }
    await b.close(); void render; }
}
