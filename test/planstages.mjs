// The site plan's stages (lib/planstages.mjs): Site › Layout › Pro forma › Renderings & plans, confirmed in turn, with
// the panel's sections per stage (lib/planview.mjs), and Start as a Parking Lot on square and skewed sites.
import assert from 'node:assert/strict';
import * as STG from '../lib/planstages.mjs';
import * as S from '../lib/siteplan.mjs';
import { planSections } from '../lib/planview.mjs';

const site = () => ({ id: 'o1', ring: [[0, 0], [400, 0], [400, 300], [0, 300]], front: 0, setbacks: { ...S.SETBACKS }, elements: [], program: { use: 'retail' } });

// ---- stages ----
const a = site();
assert.equal(STG.current(a), 'site', 'a new option starts at the site');
assert.deepEqual(Object.values(STG.status(a)).map(x => x.state), ['open', 'locked', 'locked', 'locked']);
assert.equal(STG.reachable(a, 'layout'), false);
assert.equal(STG.blocker({ ring: [] }, 'site'), 'Draw the site first.');
STG.confirm(a, 'site', { by: 'Matt', now: '2026-10-21T10:00:00Z' });
assert.equal(STG.current(a), 'layout', 'confirming the site opens the layout');
assert.equal(STG.status(a).site.by, 'Matt');
assert.ok(STG.blocker(a, 'layout'), 'a layout needs a building');
a.elements.push({ id: 'b1', kind: 'building', x: 200, y: 150, w: 100, d: 60, rot: 0, floors: 1 });
assert.equal(STG.blocker(a, 'layout'), '');
STG.confirm(a, 'layout');
assert.equal(STG.current(a), 'proforma');
STG.confirm(a, 'proforma');
assert.equal(STG.current(a), 'deliver', 'all three confirmed: renderings and plans');
// a change after confirming: that stage and the ones after it need confirming again
a.pf = { landPrice: 900000 };
assert.equal(STG.status(a).proforma.state, 'stale', 'a pro forma input changed since');
assert.equal(STG.status(a).deliver.state, 'locked');
STG.confirm(a, 'proforma'); assert.equal(STG.status(a).deliver.state, 'open');
a.elements[0].x += 40;
assert.equal(STG.status(a).layout.state, 'stale', 'a building moved since the layout was confirmed');
assert.equal(STG.status(a).proforma.state, 'locked');
assert.equal(STG.current(a), 'layout');
a.elements[0].x -= 40;
assert.equal(STG.current(a), 'deliver', 'put back as it was: confirmed again');
a.ring[2] = [420, 300];
assert.equal(STG.status(a).site.state, 'stale', 'the outline changed since the site was confirmed');
a.ring[2] = [400, 300];
STG.reopen(a, 'site');
assert.equal(STG.current(a), 'site', 'reopened');
assert.equal(STG.status(a).layout.state, 'locked');
STG.confirm(a, 'site'); assert.equal(STG.current(a), 'deliver', 'the later confirmations still count once the site is confirmed unchanged');

// an option laid out before stages existed: its site counts as confirmed, so it opens in Layout
const old = { ...site(), elements: [{ id: 'b', kind: 'building', x: 200, y: 150, w: 100, d: 60, rot: 0 }] };
assert.equal(STG.current(old), 'layout');
assert.equal(STG.status(old).site.implied, true);
STG.confirm(old, 'layout');
assert.equal(STG.status(old).site.state, 'done', 'confirming its layout keeps the site confirmed');
assert.equal(STG.current(old), 'proforma');
const old2 = { ...site(), elements: [{ id: 'b', kind: 'building', x: 200, y: 150, w: 100, d: 60, rot: 0 }] };
STG.reopen(old2, 'site'); assert.equal(STG.current(old2), 'site');
// easements alone are part of the site, not a layout
assert.equal(STG.current({ ...site(), elements: [{ id: 'k', kind: 'keepout', poly: [[0, 0], [20, 0], [20, 20]] }] }), 'site');

// New Option › Blank site: the same site, still confirmed, so the new option opens at Layout; an implied one isn't copied
const bl = S.blankOf(a, { id: 'o2', name: 'Option B' });
assert.equal(STG.current(bl), 'layout', 'a blank option of a confirmed site starts at the layout');
assert.equal(bl.stages.layout, undefined, 'only the site’s confirmation comes along');
assert.equal(STG.current(S.blankOf(old2, { id: 'o3', name: 'Option C' })), 'site');
assert.equal(STG.current(S.blankOf(site(), { id: 'o4', name: 'Option D' })), 'site', 'an unconfirmed site stays unconfirmed');

// ---- the panel's sections per stage ----
const ids = o => planSections(o).map(s => s.id).join(' ');
assert.equal(ids({ stage: 'site' }), 'spSiteSec');
assert.equal(ids({ stage: 'layout' }), 'spDrawSec spAiSec spParams spWaysSec', 'a blank layout: add by hand first, then the AI');
assert.equal(ids({ stage: 'layout', laidOut: true, layouts: true, selected: true }), 'spSel spLayouts spDrawSec spAiSec spChgSec spParams spWaysSec spNums spAskSec');
assert.equal(ids({ stage: 'proforma', laidOut: true }), 'spPfSec spNums spAskSec');
assert.equal(ids({ stage: 'deliver', laidOut: true }), 'spRender spPlanSet spExport');
assert.equal(ids({ stage: 'layout', drawing: true }), 'spDrawSite', 'drawing the site: only that');
assert.deepEqual(planSections({ stage: 'deliver', laidOut: true }).map(s => s.label), ['Render', 'Plan set', 'Export']);

// ---- Start as a Parking Lot ----
const inside = (p, ring, tol = 0.6) => S.inRing(p, ring) || ring.some((q, k) => S.segDist(p, q, ring[(k + 1) % ring.length]) < tol);
function check(pl, label) {
  const r = STG.parkingLot(pl, { newId: (n => () => 'p' + n++)(1) });
  assert.ok(!r.error, label + ': ' + r.error);
  const lots = r.elements.filter(e => e.kind === 'parking'), drive = r.elements.find(e => e.kind === 'drive');
  assert.ok(lots.length >= 1 && drive, label + ': rows and a drive');
  const rules = S.edgeRules(pl.ring, pl.front, pl.setbacks, pl.streets), inner = S.insetRing(pl.ring, rules.map(x => x.pave));
  for (const e of lots) for (const c of S.corners(e)) assert.ok(inside(c, inner, 1), label + ': a row stays inside the paving setbacks');
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) assert.ok(!S.rectsOverlap(lots[i], lots[j], 0.5), label + ': rows don’t overlap');
  for (const p of drive.path) assert.ok(inside(p, pl.ring), label + ': the drive is on the site');
  assert.equal(r.spaces, lots.reduce((s, e) => s + S.stalls(e).count, 0));
  assert.ok(r.spaces > 0);
  return r;
}
const sq = check(site(), 'a 400 × 300 ft lot');
assert.equal(sq.spaces, 288, '4 double-loaded bays of 36 stalls a side');
assert.ok(sq.elements.filter(e => e.kind === 'parking').every(e => e.rot === 0), 'rows run along the street side');
// a building dropped on the lot cuts the stalls under it (the same cut a building added by hand makes)
const plan = { ...site(), elements: sq.elements };
const bld = { id: 'b', kind: 'building', x: 200, y: 154, w: 120, d: 80, rot: 0 };
const cut = S.cutRows(plan.elements, S.outline(bld), 5);
const after = cut.filter(e => e.kind === 'parking').reduce((s, e) => s + S.stalls(e).count, 0);
assert.ok(after < sq.spaces && after > sq.spaces / 2, 'the stalls under the building give way, the rest stay (' + after + ' of ' + sq.spaces + ')');
for (const e of cut.filter(e => e.kind === 'parking')) assert.ok(!S.rectsOverlap(e, bld, 0.5), 'no stall under the building');
// a skewed, turned tract with the street on a slanting edge (like a parcel off a diagonal road), and custom stall sizes
const sk = { id: 's', ring: [[0, 0], [520, 160], [430, 560], [-60, 420]], front: 0, setbacks: { ...S.SETBACKS }, elements: [], program: { use: 'retail' }, params: { stallW: 10, stallD: 19, aisle: 26 } };
const r2 = check(sk, 'a skewed tract');
const ang = Math.atan2(160, 520) * 180 / Math.PI;
assert.ok(r2.elements.filter(e => e.kind === 'parking').every(e => Math.abs(e.rot - +ang.toFixed(2)) < 0.02), 'rows follow the slanting street side');
assert.ok(r2.elements.filter(e => e.kind === 'parking').every(e => e.sw === 10 && e.sd === 19 && e.sa === 26), 'the plan’s stall sizes');
// the street side picked as another edge: the rows turn with it
check({ ...sk, front: 1 }, 'the same tract fronting its east side');
// too small
assert.ok(STG.parkingLot({ ...site(), ring: [[0, 0], [60, 0], [60, 50], [0, 50]] }).error);
assert.ok(STG.parkingLot({ ring: [] }).error);

console.log('planstages ok: confirming stages in turn, changes since, reopening, sections per stage and the parking lot start');
