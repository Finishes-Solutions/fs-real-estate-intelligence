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
import * as T from '../lib/terrain.mjs';
import * as Q from '../lib/sitequant.mjs';
import { sheetData } from '../lib/sitesheet.mjs';
import { accessNeed } from '../lib/plandesign.mjs';

const KINDS = Object.keys(RENDERERS), un = s => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
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
    assert.ok(html.length > 8000 && html.length < 1.5e6, name + ' ' + sh.number + ' size ' + html.length);
    assert.ok(ms < 1500, name + ' ' + sh.number + ' took ' + ms + ' ms');
    out[sh.kind] = html; times[sh.number] = ms;
  }
  return { out, times };
}
// checks on one context's sheets
function check(ctx, name, { lots = false, sheets } = {}) {
  const { out, times } = sheets || sheetsOf(ctx, name), plan = ctx.plan, T = turned(plan, streetDown(plan)), B = (T.elements || []).filter(e => e.kind === 'building');
  for (const k of ['c-existing', 'c-dims', 'c-grading', 'c-detention', 'c-utility', 'c-details', 'l-plan', 'l-details']) assert.ok(out[k], name + ': ' + k + ' is in the set');
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
  for (const k of ['c-existing', 'c-dims', 'c-grading', 'c-utility', 'l-plan']) assert.ok(/1&quot; = \d+'-0&quot;/.test(out[k]), name + ': ' + k + ' scale');
  if (lots) { const n = (plan.elements || []).filter(e => e.kind === 'lot').length, rows = [...out['c-lots'].matchAll(/<td>\d+' × \d+'<\/td><td class="r">(\d+)<\/td>/g)];
    assert.equal(rows.reduce((s, m) => s + +m[1], 0), n, name + ': C-103 counts every lot'); }
  const pl = un(out['l-plan']); assert.ok(/Live oak|Cedar elm|Shumard/.test(pl) && /one tree per 10 parking spaces/i.test(pl), name + ': L-101 plant schedule and the ordinance note');
  cross(ctx, name, out);
  return times;
}
// ---------- the numbers more than one sheet shows agree (Oct 20 review) ----------
const f0 = v => Math.round(v).toLocaleString('en-US'), txt = h => un(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
function cross(ctx, name, out) {
  const plan = ctx.plan, page = k => P.sheetPage(ctx, ctx.sheets.find(s => s.kind === k)), cover = txt(page('cover')), c101h = page('siteplan'), c101 = txt(c101h), sd = sheetData(plan);
  // one area schedule: disjoint rows that add up to the site in sf and in acres; impervious is the sum of its hard rows;
  // G-001, C-101 (sheetData), C-102's paving schedule and C-202's drainage areas all show those numbers
  const A = Q.areaSchedule(plan);
  assert.equal(A.rows.reduce((s, r) => s + r.sf, 0), A.siteSf, name + ': the area schedule adds up to the site (sf)');
  assert.equal(A.rows.reduce((s, r) => s + Math.round(+r.ac * 100), 0), Math.round(+A.siteAc * 100), name + ': and in acres');
  assert.equal(A.impervious, A.rows.filter(r => r.imp).reduce((s, r) => s + r.sf, 0), name + ': impervious = buildings + paving + walks');
  assert.ok(A.rows.every(r => r.sf >= 0), name + ': no negative area');
  for (const r of A.rows) for (const [w, h] of [['G-001', cover], ['C-101', c101]]) assert.ok(h.includes(r.ac + ' ac ' + f0(r.sf) + ' sf'), name + ' ' + w + ': ' + r.label);
  assert.ok(cover.includes(f0(A.impervious) + ' sf') && c101.includes(f0(A.impervious) + ' sf'), name + ': G-001 and C-101 impervious');
  const c102 = txt(out['c-dims']); for (const k of ['heavy', 'parking', 'walks']) assert.ok(c102.includes(f0(A.get(k)) + ' sf'), name + ': C-102 paving ' + k);
  assert.ok(c102.includes(f0(A.impervious) + ' sf'), name + ': C-102 impervious');
  const c202 = txt(out['c-detention']); assert.ok(c202.includes('Impervious (roofs, paving, walks) ' + (A.impervious / 43560).toFixed(2) + ' ac'), name + ': C-202 runoff uses the same impervious area');
  // parking: every field labelled on C-101 and C-102, the labels add up to the schedule's surface line, and the total is
  // the surface line plus the spaces not drawn as stalls
  const PS = Q.parkingSchedule(plan), labels = h => [...h.matchAll(/<text class="pk" data-n="(\d+)"[^>]*>(?:<tspan[^>]*>)?(\d+)/g)].map(m => { assert.equal(m[1], m[2], name + ': a parking label reads its number'); return +m[1]; });
  for (const [w, h] of [['C-101', c101h], ['C-102', out['c-dims']]]) { const L = labels(h); assert.equal(L.length, PS.fields.filter(f => f.count > 0).length, name + ' ' + w + ': every parking field labelled'); assert.equal(L.reduce((s, v) => s + v, 0), PS.surface, name + ' ' + w + ': the labels add up to the surface stalls'); }
  assert.equal(PS.total, PS.surface + PS.other.reduce((s, o) => s + o.n, 0), name + ': total = labels + the lines not drawn as stalls');
  const row = re => sd.parking.find(r => re.test(r[0]))?.[1];
  assert.equal(row(/^Surface stalls/), f0(PS.surface), name + ': sheetData surface line'); assert.equal(row(/^Total provided/), f0(PS.total), name + ': sheetData total');
  assert.ok(cover.includes('Total provided ' + f0(PS.total)) && c101.includes('Total provided ' + f0(PS.total)) && c102.includes('Total provided ' + f0(PS.total)), name + ': G-001, C-101 and C-102 give the same total');
  // accessible parking per facility (TAS 208.2): the table on C-102, and an honest line when the drawn stalls fall short
  const AP = Q.accessibleParking(plan);
  for (const r of AP.rows) { assert.ok(r.required >= 1 && r.vanReq === Math.ceil(r.required / 6), name + ': ' + r.name + ' required'); assert.ok(c102.includes(r.name + ' ' + f0(r.spaces)), name + ': C-102 lists ' + r.name); }
  if (PS.fields.length) assert.ok(c102.includes(AP.ok ? 'meet TAS 208.2' : 'do not meet TAS 208.2'), name + ': C-102 says whether the accessible stalls meet TAS 208.2');
  // detention: C-201's pond labels and C-202's section and table are the same stage-storage
  const pq = h => (h.match(/class="pondq" data-top="([\d.]+)" data-hwl="([\d.]+)" data-nwl="([\d.]+)" data-acft="([\d.]+)"/) || []).slice(1);
  if ((plan.elements || []).some(e => e.kind === 'pond')) {
    const a = pq(out['c-grading']), b = pq(out['c-detention']); assert.ok(a.length === 4, name + ': C-201 pond levels'); assert.deepEqual(a, b, name + ': C-201 and C-202 show the same pond levels and storage');
    assert.ok(+a[0] - +a[1] === 1 || Math.abs(+a[0] - +a[1] - 1) < 0.011, name + ': 1 ft freeboard');
    assert.ok(c202.includes('Total provided ' + (+a[3] + Q.pondStorage(plan).vault).toFixed(2) + ' ac-ft'), name + ': C-202 total from the stage-storage');
    const g = txt(out['c-grading']); assert.ok(g.includes('LIVE STORAGE ' + a[3] + ' AC-FT') && c202.includes(a[3] + ' AC-FT'), name + ': live storage on C-201 and the C-202 section');
  }
  // FP-101: sprinklered as each type's code basis says (with the system), access roads exactly accessNeed's
  const fp = txt(out['fp-access'] || ''), types = (ctx.types || []).filter(t => (t.elementIds || []).length);
  if (out['fp-access']) {
    for (const t of types) { const m = fp.match(new RegExp('Type ' + t.id + '(?: ×\\d+)? — [^]*?(Yes — NFPA 13[RD]?|Yes — [\\w ()]+?|No) \\d+\'')); assert.ok(m, name + ': FP-101 row for type ' + t.id);
      assert.equal(m[1].startsWith('Yes'), !!t.sprinklered, name + ': FP-101 sprinklered for type ' + t.id); if (t.sprinklered) assert.ok(m[1].includes(t.sprinklerSystem || 'NFPA'), name + ': FP-101 system for type ' + t.id); }
    const AN = accessNeed(plan, ctx.types, ctx.tf), acc = out['fp-access'].match(/class="blk acc" data-have="(\d+)" data-need="(\d+)"/);
    assert.ok(acc && +acc[1] === AN.have && +acc[2] === AN.need, name + ': FP-101 access roads = accessNeed'); for (const r of AN.reasons) assert.ok(fp.includes(r.ref), name + ': FP-101 gives ' + r.ref);
    assert.ok(fp.includes(AN.have + ' provided, ' + AN.need + ' needed'), name + ': FP-101 have vs need');
  }
  // C-301: a fire service for every sprinklered building (buildings, not types), a domestic service for every building
  const spr = types.filter(t => t.sprinklered).reduce((s, t) => s + t.count, 0), fs = [...out['c-utility'].matchAll(/class="fsvc" data-b="([^"]*)"/g)].map(m => m[1]);
  if (types.reduce((s, t) => s + t.count, 0) === (plan.elements || []).filter(e => e.kind === 'building').length) assert.equal(fs.length, spr, name + ': C-301 fire services = sprinklered buildings (' + spr + ')');
  assert.equal(new Set(fs).size, fs.length, name + ': one fire service a building'); assert.ok(txt(out['c-utility']).includes(fs.length + ' ea'), name + ': C-301 counts them');
  assert.match(txt(out['c-utility']), /ASSUMED HERE — CONFIRM PROVIDER/, name + ': C-301 mains are assumptions');
  // L-101: frontage trees required and shown by the same rule, and a reason where they fall short
  const lp = txt(out['l-plan']); for (const m of lp.matchAll(/1 canopy tree per 40 LF, within 30 ft of the line (\d+) (\d+)( — short \d+)?/g)) assert.ok(+m[2] >= +m[1] || /trees fit/.test(lp), name + ': L-101 frontage trees ' + m[2] + ' of ' + m[1]);
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
  // where the pond sits on the ground: C-201 uses the same words as the cover notes (lib/terrain.mjs pondSide)
  for (const tf of [undefined, (x, y) => 150 + 0.01 * Math.hypot(x - 117, y - 6) * -1]) { const tr = terrainFor('retail', tf), up = ctxFor('retail', { terrain: tr }), ps = T.pondSide(up.plan, tr); assert.ok(ps && text(page(up, 'c-grading')).includes(ps.text), 'C-201 shows pondSide: ' + ps?.text); }
  // the mixed site on lidar ground: the proposed surface follows the ground, so the earthwork is near balance (the Oct 20
  // set's fixed slope from the pond bank made 238,700 CY of fill), and C-201 says the net honestly
  { const c = ctxFor('mixed', { terrain: terrainFor('mixed') }), gr = text(page(c, 'c-grading')).replace(/\s+/g, ' '), m = gr.match(/Earthwork \(rough\) ~([\d,]+) CY cut \(pond ~([\d,]+)\), ~([\d,]+) CY fill[^:]*: net (balanced|~[\d,]+ CY (import|export))/), n = v => +v.replace(/,/g, '');
    assert.ok(m, 'mixed C-201 earthwork: ' + (gr.match(/Earthwork.{0,200}/) || [''])[0]); assert.ok(n(m[3]) < 2 * n(m[1]) + 5000 && n(m[2]) > 0, 'mixed: fill near the cut (' + m[1] + ' cut, ' + m[3] + ' fill)');
    const cr = sheetsOf(c, 'mixed on lidar'); cross(c, 'mixed on lidar', cr.out); } }

console.log('slowest site sheet (first draw, geometry included): ' + slow + ' ms');
console.log('site sheets ok');
