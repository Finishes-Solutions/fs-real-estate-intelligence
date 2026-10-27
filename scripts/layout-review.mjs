// Layout review sheets: written requests laid out on test lots, the way the app does without AI (the request read by
// guessProgram, laid out by layoutOptions), each drawn as one page with the request, how it was read, the three options
// and their numbers and failed checks, and saved as a PNG for a person to look at.
//   node scripts/layout-review.mjs [out dir] [case name filter]
// Default out dir: docs/layout-review. Needs Chromium (Playwright's) for the PNGs; without it, the HTML pages are kept.
import fs from 'node:fs';
import path from 'node:path';
import * as S from '../lib/siteplan.mjs';
import * as L from '../lib/sitelayout.mjs';
import { planSVG } from '../lib/sitesheet.mjs';

const OUT = process.argv[2] || 'docs/layout-review', ONLY = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
// the street is on the side facing south (y = 0), unless a lot names its own front
const site = (o, pts) => { const b = S.unionParcels([mk(o, pts)]); const f = b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[1] < -0.9); return { ...b, front: f >= 0 ? f : null, setbacks: { ...S.SETBACKS } }; };
export const LOTS = {
  rect5: { label: '600 × 400 ft, 5.5 ac', plan: () => site([-95.93, 30.05], [[0, 0], [600, 0], [600, 400], [0, 400]]) },
  notch8: { label: '920 × 378 ft with a notch, 7.7 ac', plan: () => site([-95.98, 30.06], [[0, 0], [378, 0], [378, 920], [119, 920], [119, 822], [0, 822]]) },
  trap20: { label: 'Trapezoid, 716 ft frontage, 20 ac', plan: () => site([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]]) },
  narrow7: { label: '260 × 1,200 ft, 7.2 ac', plan: () => site([-95.90, 30.08], [[0, 0], [260, 0], [260, 1200], [0, 1200]]) },
  wedge10: { label: 'Four-sided wedge, 10 ac', plan: () => site([-95.88, 30.02], [[0, 0], [1000, 0], [760, 620], [80, 520]]) },
  flag6: { label: 'Flag lot: a 120 ft pole to the street, 6 ac', plan: () => site([-95.95, 30.03], [[0, 0], [120, 0], [120, 300], [560, 300], [560, 820], [-80, 820], [-80, 300], [0, 300]]) },
  irreg40: { label: 'Six-sided, 40 ac', plan: () => site([-95.86, 30.10], [[0, 0], [1400, 0], [1650, 650], [1350, 1300], [250, 1350], [-150, 650]]) },
  pad1: { label: '210 × 230 ft, 1.1 ac', plan: () => site([-95.96, 30.07], [[0, 0], [210, 0], [210, 230], [0, 230]]) }
};
// written requests, as a person types them
export const CASES = [
  { name: 'apartments-rect5', lot: 'rect5', ask: '120 garden apartments, 3 stories, with a clubhouse and pool' },
  { name: 'apartments-notch8', lot: 'notch8', ask: '200 apartments, 3 floors' },
  { name: 'retail-rect5', lot: 'rect5', ask: '25,000 sf retail strip with 2 pad sites' },
  { name: 'townhomes-narrow7', lot: 'narrow7', ask: 'townhomes for rent, 2 car garages' },
  { name: 'townhomes-trap20', lot: 'trap20', ask: '150 townhomes with an amenity center' },
  { name: 'warehouse-trap20', lot: 'trap20', ask: '250,000 sf warehouse with a truck court' },
  { name: 'mixed-trap20', lot: 'trap20', ask: '30,000 sf retail along the street with 200 apartments behind' },
  { name: 'office-wedge10', lot: 'wedge10', ask: '80,000 sf office, 3 stories' },
  { name: 'homes-irreg40', lot: 'irreg40', ask: 'single family subdivision, 50 ft lots' },
  { name: 'mixed-irreg40', lot: 'irreg40', ask: 'mixed use: retail on the frontage, 240 apartments, 80 townhomes and single family homes' },
  { name: 'apartments-flag6', lot: 'flag6', ask: 'apartments, as many as fit' },
  { name: 'restaurant-pad1', lot: 'pad1', ask: '2,500 sf restaurant with a drive-thru' },
  { name: 'storage-rect5', lot: 'rect5', ask: 'self storage, 3 story climate controlled building plus drive-up units' }
];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f0 = v => v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US');
function readOf(prog) {
  const p = S.normalizeProgram(prog), z = (p.zones || []).filter(z => z.use !== 'garage');
  const one = q => [S.USES[q.use]?.label || q.use, q.units ? q.units + ' units' : q.gfa ? f0(q.gfa) + ' sf' : 'fill the site', q.floors ? q.floors + ' fl' : '', q.buildings ? q.buildings + ' bldgs' : '', q.pads ? q.pads + ' pads' : ''].filter(Boolean).join(', ');
  return z.length > 1 ? 'Mixed: ' + z.map(one).join(' · ') : one(p);
}
export function runCase(c) {
  const plan = LOTS[c.lot].plan(), prog = S.guessProgram(c.ask), t0 = Date.now();
  let opts = []; try { opts = L.layoutOptions(plan, prog); } catch (e) { return { c, plan, prog, error: e.message, ms: Date.now() - t0, opts: [] }; }
  const ms = Date.now() - t0;
  return { c, plan, prog, ms, opts: opts.map(o => {
    const p = { ...plan, elements: o.elements, zones: o.zones, program: o.program || prog, recipe: o.recipe }, m = S.metrics(p), issues = S.check(p);
    const b = o.elements.filter(e => e.kind === 'building'), uses = {};
    for (const e of b) { const u = e.use || 'other'; uses[u] = uses[u] || { n: 0, sf: 0, units: 0 }; uses[u].n++; uses[u].sf += S.gfaOf(e); uses[u].units += e.units || 0; }
    return { name: o.name, p, m, bad: issues.filter(i => i.level === 'bad').map(i => i.text), warn: issues.filter(i => i.level !== 'bad').map(i => i.text), uses, notes: o.notes || [] };
  }) };
}
export function pageHTML(r) {
  const panel = (o, i) => {
    const { svg } = planSVG(o.p, { px: 560, labels: true }), m = o.m;
    const uses = Object.entries(o.uses).map(([u, v]) => esc(S.USES[u]?.label || u) + ': ' + v.n + ' bldg' + (v.n > 1 ? 's' : '') + ', ' + f0(v.sf) + ' sf' + (v.units ? ', ' + v.units + ' units' : '')).join('<br>');
    const park = m.required != null ? f0(m.spaces) + ' of ' + f0(m.required) + ' required' : f0(m.spaces);
    return '<div class="opt"><h3>' + (i + 1) + '. ' + esc(o.name || 'Option') + '</h3><div class="svg">' + svg + '</div><table>' +
      '<tr><td>Buildings</td><td>' + (uses || '—') + '</td></tr><tr><td>Parking</td><td' + (m.required != null && m.spaces < m.required ? ' class="bad"' : '') + '>' + park + '</td></tr>' +
      '<tr><td>Coverage / FAR</td><td>' + (m.coverage != null ? (m.coverage * 100).toFixed(0) + '%' : '—') + ' / ' + (m.far != null ? m.far.toFixed(2) : '—') + '</td></tr>' +
      '<tr><td>Detention</td><td>' + (m.pond > 0 ? (m.pond / 43560).toFixed(2) + ' ac of pond' : '—') + '</td></tr></table>' +
      (o.bad.length ? '<ul class="bad">' + o.bad.slice(0, 6).map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '<p class="ok">Passes its own checks</p>') +
      (o.warn.length ? '<ul class="warn">' + o.warn.slice(0, 4).map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') +
      (o.notes.length ? '<ul class="note">' + o.notes.slice(0, 4).map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') + '</div>';
  };
  return '<!doctype html><meta charset="utf-8"><style>body{font:13px/1.4 system-ui,sans-serif;margin:18px;color:#1c2427;background:#fff}h1{font-size:19px;margin:0 0 2px}h2{font-size:13px;font-weight:500;color:#5d6b70;margin:0 0 12px}' +
    '.ask{font-size:16px;margin:6px 0;padding:8px 12px;background:#f1f4f5;border-left:4px solid #1f6f43}.read{color:#36454a;margin:0 0 14px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}' +
    '.opt{border:1px solid #d3dadc;border-radius:6px;padding:10px}.opt h3{margin:0 0 6px;font-size:14px}.svg svg{width:100%;height:auto;display:block;background:#fafbf8}table{width:100%;border-collapse:collapse;margin-top:6px}td{padding:3px 0;border-top:1px solid #eef1f2;vertical-align:top}td:first-child{color:#5d6b70;width:34%}' +
    '.bad{color:#b3261e}ul{margin:6px 0 0;padding-left:18px}ul.warn{color:#8a5a00}ul.note{color:#36454a;font-size:12px}.ok{color:#1f6f43;margin:6px 0 0}</style>' +
    '<h1>' + esc(r.c.name) + '</h1><h2>Lot: ' + esc(LOTS[r.c.lot].label) + ' · laid out in ' + (r.ms / 1000).toFixed(1) + ' s, without AI (the app\'s own reading of the request)</h2>' +
    '<div class="ask">“' + esc(r.c.ask) + '”</div><p class="read"><b>Read as:</b> ' + esc(readOf(r.prog)) + '</p>' +
    (r.error ? '<p class="bad">The engine failed: ' + esc(r.error) + '</p>' : '<div class="row">' + r.opts.map(panel).join('') + '</div>');
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let chromium = null; try { ({ chromium } = await import('playwright')); } catch { try { ({ chromium } = await import(path.join(process.env.NODE_PATH || '/usr/local/lib/node_modules', 'playwright/index.js'))); } catch { /* HTML only */ } }
  const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome'].find(p => fs.existsSync(p)), browser = chromium ? await chromium.launch(exe ? { executablePath: exe } : {}) : null, page = browser ? await browser.newPage({ viewport: { width: 1800, height: 1000 } }) : null;
  const summary = [];
  for (const c of CASES) {
    if (ONLY && !ONLY.test(c.name)) continue;
    const r = runCase(c), html = pageHTML(r); fs.writeFileSync(path.join(OUT, c.name + '.html'), html);
    if (page) { await page.setContent(html); await page.screenshot({ path: path.join(OUT, c.name + '.png'), fullPage: true }); }
    summary.push({ case: c.name, read: readOf(r.prog), ms: r.ms, error: r.error || null, options: r.opts.map(o => ({ name: o.name, uses: o.uses, spaces: o.m.spaces, required: o.m.required, bad: o.bad })) });
    console.log(c.name.padEnd(22), (r.ms / 1000).toFixed(1) + 's', '|', readOf(r.prog), '|', r.opts.map(o => (o.bad.length ? o.bad.length + ' bad' : 'ok') + (o.m.required != null && o.m.spaces < o.m.required ? ' (parking ' + o.m.spaces + '/' + o.m.required + ')' : '')).join(', ') || r.error);
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  if (browser) await browser.close();
}
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) await main();
