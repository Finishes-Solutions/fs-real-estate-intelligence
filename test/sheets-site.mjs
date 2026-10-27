// Site and civil, landscape and site-wide electrical / fire / telecom sheets (lib/sheets/site.mjs) on every realistic
// plan (test/helpers/setctx.mjs: the 7.7 acre FM 362 lot laid out ten ways and the 27 acre tract with 71 homes on lots):
// each draws without errors, NaN or placeholders, at a sane size and speed, and agrees with the plan: C-001's courses are
// one per boundary edge and close, every building gets a water service, hydrants are never more than 500 ft apart and
// every building has one near, C-301 and FP-101 show the same hydrants, C-202 asks for storage. Then plans the layouts
// don't make: an easement, no pond, no drives at all.
import assert from 'node:assert/strict';
import { ctxFor, CASES, terrainFor, planFor } from './helpers/setctx.mjs';
import * as P from '../lib/planset.mjs';
import * as S from '../lib/siteplan.mjs';
import { streetDown, turned } from '../lib/sitesheet.mjs';
import { RENDERERS, bearing } from '../lib/sheets/site.mjs';
import { RENDERERS as LAND } from '../lib/sheets/land.mjs';
import * as T from '../lib/terrain.mjs';

const KINDS = [...Object.keys(RENDERERS), ...Object.keys(LAND)], un = s => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
assert.equal(bearing([0, 0], [100, 100]), 'N 45°00\'00" E');
assert.equal(bearing([0, 0], [0, -10]), 'S 00°00\'00" E');
assert.equal(bearing([0, 0], [-10, -10 * Math.tan(30 * Math.PI / 180)]), 'S 60°00\'00" W');
assert.equal(bearing([5, 5], [5 - Math.sin(10.5 * Math.PI / 180), 5 + Math.cos(10.5 * Math.PI / 180)]), 'N 10°30\'00" W');

// the courses of C-001, read back off the sheet: [bearing text, distance]
const coursesOf = html => [...un(html).matchAll(/<td>C(\d+)<\/td><td>([NS]) (\d+)°(\d+)'(\d+)" ([EW])<\/td><td class="r">([\d.]+)'<\/td>/g)]
  .map(m => { const a = (+m[3] + m[4] / 60 + m[5] / 3600) * Math.PI / 180, sx = m[6] === 'E' ? 1 : -1, sy = m[2] === 'N' ? 1 : -1, L = +m[7]; return [sx * Math.sin(a) * L, sy * Math.cos(a) * L, L]; });
const hydrantsOf = html => [...html.matchAll(/class="hyd" data-x="([-\d.]+)" data-y="([-\d.]+)"/g)].map(m => [+m[1], +m[2]]);
const near = (p, list) => Math.min(Infinity, ...list.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])));
function sheetsOf(ctx, name) {
  const out = {}, times = {};
  for (const sh of ctx.sheets.filter(s => KINDS.includes(s.kind))) {
    const t0 = Date.now(), html = P.sheetPage(ctx, sh), ms = Date.now() - t0;
    assert.ok(!/NaN|undefined|Infinity/.test(html), name + ' ' + sh.number + ': no NaN, undefined or Infinity: ' + (html.match(/.{80}(NaN|undefined|Infinity).{40}/) || [''])[0]);
    assert.ok(!/couldn’t be drawn|isn’t drawn yet/.test(html), name + ' ' + sh.number + ' drew: ' + (html.match(/couldn’t be drawn.{0,200}/) || [''])[0]);
    assert.ok(html.length > (sh.kind === 'l-notes' ? 4000 : 8000) && html.length < 1.5e6, name + ' ' + sh.number + ' size ' + html.length);
    assert.ok(ms < 1500, name + ' ' + sh.number + ' took ' + ms + ' ms');
    out[sh.kind] = html; times[sh.number] = ms;
  }
  return { out, times };
}
// checks on one context's sheets
function check(ctx, name, { lots = false, sheets } = {}) {
  const { out, times } = sheets || sheetsOf(ctx, name), plan = ctx.plan, T = turned(plan, streetDown(plan)), B = (T.elements || []).filter(e => e.kind === 'building');
  for (const k of ['c-existing', 'c-dims', 'c-grading', 'c-detention', 'c-utility', 'c-details', 'l-notes', 'l-plan', 'l-irrig', 'l-details', 'l-irr-details']) assert.ok(out[k], name + ': ' + k + ' is in the set');
  // C-001: one course per boundary edge, the lengths are the edges', and the traverse closes
  const cs = coursesOf(out['c-existing']), ring = plan.ring;
  assert.equal(cs.length, ring.length, name + ': a course for every boundary edge');
  const per = ring.reduce((s, p, i) => s + Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]), 0);
  assert.ok(Math.abs(cs.reduce((s, c) => s + c[2], 0) - per) < 0.05 * ring.length, name + ': course lengths add up to the perimeter');
  const cx = cs.reduce((s, c) => s + c[0], 0), cy = cs.reduce((s, c) => s + c[1], 0);
  assert.ok(Math.hypot(cx, cy) < Math.max(0.1, per / 10000), name + ': the courses close (' + Math.hypot(cx, cy).toFixed(3) + ' ft)');
  assert.ok(out['c-existing'].includes(S.ringArea(ring).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' sf'), name + ': C-001 gives the area');
  assert.ok(/TOPOGRAPHY NOT SURVEYED/.test(out['c-existing']) && /Texas RPLS/.test(out['c-existing']), name + ': C-001 says there is no survey');
  // C-301: every building a water service; hydrants at most 500 ft apart, every building near one; FP-101 the same hydrants
  const svc = [...out['c-utility'].matchAll(/class="wsvc" data-b="([^"]*)"/g)].map(m => m[1]);
  assert.equal(svc.length, B.length, name + ': a water service for every building');
  assert.deepEqual(new Set(svc), new Set(B.map(e => e.id || '')), name + ': each building its own service');
  const H = hydrantsOf(out['c-utility']);
  assert.ok(H.length >= 1, name + ': hydrants');
  if (H.length > 1) assert.ok(H.every(h => near(h, H.filter(q => q !== h)) <= 500), name + ': hydrants at most 500 ft apart: ' + Math.max(...H.map(h => near(h, H.filter(q => q !== h)))).toFixed(0));
  for (const e of B) { const o = S.outline(e); assert.ok(Math.min(...o.map(p => near(p, H))) <= 400, name + ': a hydrant within 400 ft of ' + (e.name || e.id)); }
  if (out['fp-access']) assert.deepEqual(hydrantsOf(out['fp-access']), H, name + ': FP-101 shows the hydrants C-301 does');
  // C-202 asks for storage and says how it got it; C-201 has inlets, a floor for every building
  const req = un(out['c-detention']).match(/Required storage<\/td><td class="r">([\d.]+) ac-ft/);
  assert.ok(req && +req[1] > 0, name + ': C-202 required storage > 0');
  assert.ok(/ac-ft per developed acre/.test(out['c-detention']) && /confirm with the drainage authority/.test(out['c-detention']), name + ': C-202 states its method and to confirm it');
  const inl = out['c-grading'].match(/Curb \/ area inlets<\/td><td class="r">(\d+) ea/);
  assert.ok(inl && +inl[1] > 0, name + ': C-201 inlets');
  assert.ok((out['c-grading'].match(/>FF \d+\.\d</g) || []).length === B.length, name + ': a finished floor for every building');
  assert.ok(/assumed datum/i.test(out['c-grading']), name + ': C-201 says the datum is assumed');
  // the plan sheets are drawn to a standard scale, given in the title block and the view title
  for (const k of ['c-existing', 'c-dims', 'c-grading', 'c-utility', 'l-plan', 'l-irrig']) assert.ok(/1&quot; = \d+'-0&quot;/.test(out[k]), name + ': ' + k + ' scale');
  if (lots) { const n = (plan.elements || []).filter(e => e.kind === 'lot').length, rows = [...out['c-lots'].matchAll(/<td>\d+' × \d+'<\/td><td class="r">(\d+)<\/td>/g)];
    assert.equal(rows.reduce((s, m) => s + +m[1], 0), n, name + ': C-103 counts every lot'); }
  const pl = un(out['l-plan']); assert.ok(/Live oak|Cedar elm|Shumard/.test(pl) && /Plant schedule/i.test(pl), name + ': L-101 plant schedule');
  assert.ok(/a tree per 10 parking spaces/i.test(un(out['l-notes'])), name + ': L-001 has the ordinance note');
  return times;
}

let slow = 0;
for (const name of Object.keys(CASES)) {
  const ctx = ctxFor(name), lots = (ctx.plan.elements || []).some(e => e.kind === 'lot');
  assert.equal(ctx.sheets.some(s => s.kind === 'c-lots'), lots, name + ': C-103 only with lots');
  const times = check(ctx, name, { lots });
  slow = Math.max(slow, ...Object.values(times));
}
// the 71 homes: big, so the sheets must stay quick and small
{ const ctx = ctxFor('sfr'), { out, times } = sheetsOf(ctx, 'sfr again'); // (geometry cached: these are the drawing times alone)
  for (const [k, ms] of Object.entries(times)) assert.ok(ms < 400, 'sfr ' + k + ' ' + ms + ' ms');
  for (const [k, h] of Object.entries(out)) assert.ok(h.length < 1.5e6, 'sfr ' + k + ' ' + h.length + ' bytes');
  assert.ok(/\d+' × \d+' lot — \d+ lots/.test(un(out['c-lots'])), 'sfr: typical lots drawn');
}

// plans the layouts don't make: an easement across the site, no pond, no drives at all; Claude's discipline notes
{ const base = ctxFor('retail'), plan = base.plan, mk = (p, extra = {}) => P.setContext({ ...base, plan: p, sheets: undefined, types: undefined, designs: {}, ...extra });
  const ko = { ...plan, elements: plan.elements.concat([{ kind: 'keepout', x: 0, y: 150, w: 600, d: 30, rot: 0, id: 'ko1', name: 'Pipeline easement' }]) };
  const c1 = mk(ko), h1 = P.sheetPage(c1, c1.sheets.find(s => s.kind === 'c-existing'));
  assert.ok(/PIPELINE EASEMENT \(DRAWN, NOT SURVEYED\)/.test(h1) && /stroke="#9b3b32"/.test(h1), 'C-001 hatches and labels an easement');
  const noPond = { ...plan, elements: plan.elements.filter(e => e.kind !== 'pond') }, c2 = mk(noPond);
  check(c2, 'retail without a pond');
  const h2 = P.sheetPage(c2, c2.sheets.find(s => s.kind === 'c-detention'));
  assert.ok(/UNDERGROUND STORAGE|No pond on the plan/.test(h2), 'no pond: C-202 says the storage is underground');
  const bare = { ...plan, elements: plan.elements.filter(e => e.kind === 'building') }, c3 = mk(bare);
  for (const sh of c3.sheets.filter(s => KINDS.includes(s.kind))) { const h = P.sheetPage(c3, sh); assert.ok(!/couldn’t be drawn|NaN|undefined|Infinity/.test(h), 'no drives: ' + sh.number + ' ' + (h.match(/couldn’t be drawn.{0,200}/) || [''])[0]); }
  const c4 = mk(plan, { disc: { civil: { notes: ['Civil note from Claude.'], criteria: [{ item: 'Design storm', value: '100-year, Atlas 14' }] }, fire: { notes: ['Fire note from Claude.'] } } });
  const g = P.sheetPage(c4, c4.sheets.find(s => s.kind === 'c-grading')), f = P.sheetPage(c4, c4.sheets.find(s => s.kind === 'fp-access'));
  assert.ok(g.includes('Civil note from Claude.') && g.includes('100-year, Atlas 14') && f.includes('Fire note from Claude.'), 'the discipline notes and criteria are shown when present');
  assert.ok(/SCHEMATIC/.test(g) && /Atlas 14/.test(g), 'C-201 notes: schematic, Atlas 14');
}
// ---------- the ground from lidar (lib/terrain.mjs) under C-001 and C-201 ----------
{ const text = h => h.replace(/<[^>]+>/g, ' '), page = (c, k) => P.sheetPage(c, c.sheets.find(x => x.kind === k));
  for (const name of ['retail', 'sfr']) {
    const t = terrainFor(name), c = ctxFor(name, { terrain: t }), ex = text(page(c, 'c-existing')), gr = text(page(c, 'c-grading'));
    assert.ok(!/TOPOGRAPHY NOT SURVEYED/.test(ex) && /Existing ground contour/.test(ex) && /LOW \d+\.\d/.test(ex) && /HIGH \d+\.\d/.test(ex), name + ' C-001: lidar contours and the low and high points');
    assert.match(ex, /USGS 3DEP \(1 m lidar\)/); assert.match(ex, /not a survey/);
    assert.ok(/NAVD 88/.test(gr) && /Earthwork \(rough\)/.test(gr) && /Existing ground contour/.test(gr) && !/Assumed 100\.00/.test(gr), name + ' C-201 on the real datum');
    assert.ok(!/NaN|undefined/.test(ex + gr), name + ': no NaN');
    // finished floors a foot over the ground (in the turned frame the sheets draw in)
    const ffs = [...gr.matchAll(/FF (\d+\.\d)/g)].map(m => +m[1]), sum = T.summary(t, planFor(name).ring); assert.ok(ffs.length && ffs.every(f => f > sum.min + 0.9 && f < sum.max + 4), name + ': floors on the ground: ' + ffs.slice(0, 5).join(', '));
  }
  // a terrain for another boundary, or a rough one: ignored
  for (const bad of [{ ...terrainFor('retail'), sig: 'x' }, { ...terrainFor('retail'), coarse: true }]) { const c = ctxFor('retail', { terrain: bad }); assert.match(text(page(c, 'c-existing')), /TOPOGRAPHY NOT SURVEYED/); assert.match(text(page(c, 'c-grading')), /Assumed 100\.00/); }
  // the pond on high ground is called out
  const up = ctxFor('retail', { terrain: terrainFor('retail', (x, y) => 150 + 0.01 * Math.hypot(x - 117, y - 6) * -1) }); assert.match(text(page(up, 'c-grading')), /falls away from the pond/); }

console.log('slowest site sheet (first draw, geometry included): ' + slow + ' ms');
console.log('site sheets ok');
