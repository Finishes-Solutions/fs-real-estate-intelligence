// The robustness sweep's fixes (docs/LAYOUT-ENGINE.md item 42, scripts/layout-sweep.mjs): a flag lot's entry kept inside
// its lot lines and joined to the strip's drive; no layout handed back with nothing built in it, and an empty answer said
// in plain words; event venues laid out; slivers
// at the stored precision not read as overlaps; podium forms with no floors given drawn as podiums; a podium garage's
// entrance at either end of its back face; studio apartments "in garden buildings" read as one program; no shop box
// counted as a detached home. Each on the sweep's own synthetic lots (no holdout outline), with the sweep's harness.
import assert from 'node:assert/strict';
import * as S from '../lib/siteplan.mjs';
import * as B from '../lib/layoutbrief.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import * as V from '../lib/layoutcheck.mjs';
import * as SW from '../scripts/layout-sweep.mjs';

const run = (family, ac, ask) => { const p = SW.planOf({ family, ac }, {}); return { p, rec: RUN.runBrief(B.briefFromRequest(ask, p)) }; };
const top = r => r.rec.options[0];
const failed = r => top(r)?.validation.failed || [];

// ---------- 0. the sweep itself: ~300 fixed runs, every one with its own name; the lots as asked ----------
{
  const fake = { ring: [[0, 0], [100, 0], [100, 100]] }, real = Object.fromEntries(['real-courtyard-apartments', 'real-garden-apartments', 'real-retail-corner', 'real-old-houston-fm362', 'real-ralston-rd'].map(k => [k, fake]));
  const runs = SW.buildRuns(real), ids = new Set(runs.map(r => r.id));
  assert.ok(runs.length >= 300 && ids.size === runs.length, 'about 300 runs, each its own: ' + runs.length);
  assert.ok(!runs.some(r => /P35|P36|E054|P18/.test(r.id + (r.lot || ''))), 'no holdout outline in the sweep');
  for (const f of SW.FAM) { const L = SW.FAMILIES[f](5), a = S.ringArea(L.ring) / 43560 + (f === 'flag' ? 0 : 0); assert.ok(Math.abs(a - 5) < 0.05, f + ': 5 acres as asked (' + a.toFixed(2) + ')'); }
  assert.deepEqual(SW.buildRuns(real).map(r => r.id), runs.map(r => r.id), 'the same runs every time');
  assert.equal(SW.classify({ outcome: 'feasible', status: 'pass', failed: [], warnings: [], notes: [], ratio: 1 }), 'ok');
  assert.equal(SW.classify({ outcome: 'no-feasible-found', problems: [] }), 'empty-silent:no-feasible-found');
  assert.equal(SW.classify({ outcome: 'no-feasible-found', status: 'fail', failed: ['program.u1'], notes: ['Fits about 90 of the 120 units asked for.'] }), 'program-short-said');
}

// ---------- 1. a flag lot: the body's entry stays inside the lot lines and is one drive with the strip's ----------
{
  const r = run('flag', 5, 'a 2-story office building, 40,000 sf'), o = top(r);
  assert.equal(o.validation.status, 'pass', 'the office on the flag lot passes: ' + failed(r));
  const entry = o.elements.filter(e => e.kind === 'drive' && e.entry);
  assert.equal(entry.length, 1, 'one way in, up the strip');
  for (const e of o.elements.filter(e => e.kind === 'drive')) assert.ok(S.shapeOf(e).every(p => S.inRing(p, r.p.ring) || S.ringArea(r.p.ring) && Math.min(...r.p.ring.map((a, i) => S.segDist(p, a, r.p.ring[(i + 1) % r.p.ring.length]))) < 0.6 && p[1] <= 0.6), (e.name || e.id) + ': no paving across a neighbour’s lot line');
  // the body's entry laid out away from the mouth (a garage deck in the way of a straight drive): a drive across just inside the mouth joins them
  const g = run('flag', 3, 'parking garage, 400 spaces');
  assert.equal(top(g).validation.status, 'pass', 'the garage on the flag lot passes: ' + failed(g));
  // and as many townhomes as fit on a flag lot keep passing (the bench's LOT-flag-th shape is item 23's)
  const t = run('flag', 2, 'single-family homes, as many as fit'); assert.ok(!failed(t).some(c => /containment|entrance/.test(c)), 'homes on a small flag lot: ' + failed(t));
}

// ---------- 2. nothing built is never the answer; an empty answer is said ----------
{
  const r = run('rect-strip', 2, 'duplexes, as many as fit');
  for (const o of r.rec.options) assert.ok(o.quantities.totals.units > 0, 'no option without its homes');
  if (!r.rec.options.length) { assert.equal(r.rec.outcome, 'no-feasible-found'); assert.match(r.rec.problems[0].msg, /^No layout found for .* the land inside the setbacks is [\d.]+ ac, about \d+ ft across at its narrowest/, 'said: ' + r.rec.problems[0]?.msg); }
  const m = run('rect-sq', 2.5, 'mid-rise apartments, 4 stories, as many as fit');
  assert.ok(m.rec.options.every(o => o.quantities.totals.units > 0), 'no layout of a clubhouse and parking alone handed back for apartments');
  if (!m.rec.options.length) assert.ok(m.rec.problems.length && /No layout found/.test(m.rec.problems[0].msg));
  const p = { ring: [[0, 0], [10, 0], [10, 10], [0, 10]], front: 0, streets: [], setbacks: { ...S.SETBACKS }, elements: [] }, msg = RUN.nothingFits(B.briefFromRequest('garden apartments, as many as fit', p)).msg;
  assert.match(msg, /garden/i, 'names what was asked: ' + msg);
}

// ---------- 3. an event venue is laid out (its form was missing from the engine's list) and parked at 10 a 1,000 sf ----------
{
  const r = run('corner', 4, 'event venue 12,000 sf'), o = top(r);
  assert.notEqual(r.rec.outcome, 'unsupported');
  assert.equal(o.validation.status, 'pass', failed(r).join(','));
  assert.equal(o.quantities.parking.required, 120, '10 a 1,000 sf');
}

// ---------- 5. overlaps: a sliver at the stored precision along two long turned pieces isn't one; a real one is ----------
{
  const ring = [[-500, -500], [500, -500], [500, 500], [-500, 500]], a = 22.92, c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
  const at = (v, w, d, k) => ({ id: k, kind: k === 'b' ? 'building' : 'drive', x: +(-s * v).toFixed(2), y: +(c * v).toFixed(2), w, d, rot: a, ...(k === 'b' ? { use: 'storage', floors: 1 } : {}) });
  const lay = gap => ({ ring, front: 0, streets: [], setbacks: { ...S.SETBACKS }, elements: [at(0, 360, 26, 'd'), at(28 - gap, 170, 30, 'b')] });
  const ov = l => V.validateLayout(l).checks.find(x => x.id === 'overlap.level-aware').status;
  assert.equal(ov(lay(0.012)), 'pass', 'a 0.012 ft sliver along 170 ft (2 sf) is not an overlap');
  assert.equal(ov(lay(2)), 'fail', 'a 2 ft overlap along 170 ft is');
}

// ---------- 6. podium forms with no floors given: drawn as podiums, the floors assumed said ----------
{
  const p = SW.planOf({ family: 'rect-sq', ac: 4 }, {}), E = B.toEngine(B.canonicalBrief(B.briefFromRequest('podium apartments, 200 units', p)));
  assert.equal(E.program.floors, 7, 'podium apartments: 5 over 2'); assert.ok(E.mapping.some(m => /7 floors assumed/.test(m)), 'said');
  assert.equal(B.toEngine(B.canonicalBrief(B.briefFromRequest('8-story tower on a podium, 300 apartments', p))).program.floors, 8, 'the floors asked kept');
  const r = run('rect-sq', 4, 'podium apartments, 200 units'), o = top(r);
  assert.ok(o.elements.some(e => e.kind === 'building' && e.form === 'tower' && +e.parkLevels > 0), 'apartments over a parking podium');
  assert.ok(o.quantities.totals.units >= 150, 'about the count asked, not 3-story garden buildings: ' + o.quantities.totals.units);
}

// ---------- 7. a podium garage's entrance at either end of its back face (the ramp follows) ----------
{
  const b = { kind: 'building', form: 'tower', x: 0, y: 0, w: 280, d: 128, rot: 0, podium: 2, parkLevels: 2, floors: 7, lobbyFace: '-v' };
  const e1 = S.garageEntry({ ...b, garageFace: '+v' }), e2 = S.garageEntry({ ...b, garageFace: '+v-' }), g2 = S.garagePlan({ ...b, garageFace: '+v-' });
  assert.ok(e1.at[0] > 100 && e2.at[0] < -100 && Math.abs(e1.at[1] - e2.at[1]) < 0.01, 'the same face, the other end: ' + e1.at + ' / ' + e2.at);
  assert.ok(g2.ramp.u1 <= 0.01 && S.garagePlan({ ...b, garageFace: '+v' }).ramp.u0 >= -0.01, 'the ramp at that end');
  assert.equal(S.garageEntry({ ...b, garageFace: '-v-' }).face, '+u', 'never on the lobby’s face');
  const r = run('L', 3, 'podium apartments, 200 units');
  assert.ok(!failed(r).includes('access.garage'), 'the podium on the L lot gets its garage entrance: ' + failed(r));
}

// ---------- 8. studio apartments in garden buildings: one program with the studio mix ----------
{
  const p = S.guessProgram('180 studio apartments in 3-story garden buildings');
  assert.ok(!p.zones && p.units === 180 && p.floors === 3 && p.mix?.[0]?.name === 'Studio', JSON.stringify(p));
  assert.equal(S.guessProgram('garden apartments, townhomes and studio apartment buildings').zones.filter(z => z.use === 'multifamily').length, 2, 'named beside other apartments: a zone of their own, as before');
}

// ---------- 9. detached homes: never a shop box counted as one home ----------
{
  const r = run('rect-wide', 1, 'build-to-rent cottages, as many as fit');
  for (const o of r.rec.options) assert.ok(!o.elements.some(e => e.kind === 'building' && e.use === 'sfr' && e.w * e.d > 4000), 'no 8,500 sf "cottage"');
  if (!r.rec.options.length) assert.match(r.rec.problems[0].msg, /No layout found/);
}
console.log('layoutsweep: ok');
