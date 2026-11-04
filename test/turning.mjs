// Turning movements, fire-lane width and dead ends (lib/turning.mjs, checked in lib/layoutcheck.mjs) and the garage
// ramp (lib/siteplan.mjs garagePlan): measured on drawn geometry, a planning-level check. No network.
import assert from 'node:assert/strict';
const T = await import('../lib/turning.mjs'), V = await import('../lib/layoutcheck.mjs'), B = await import('../lib/layoutbrief.mjs'), RUN = await import('../lib/layoutrun.mjs'), S = await import('../lib/siteplan.mjs');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', n, name); };
const RECT = { origin: [-96.42, 30.38], ring: [[0, 0], [900, 0], [900, 500], [0, 500]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 } };

// an L of two 24 ft drives with a square inside corner
const A = { id: 'a', kind: 'drive', x: 200, y: 112, w: 300, d: 24 }, Bd = { id: 'b', kind: 'drive', x: 338, y: 250, w: 24, d: 300 };
ok('a square corner of two 24 ft drives: a car turns, a fire truck does not; a 30 ft curb return lets it', () => {
  const els = [A, Bd], sites = T.turnSites(els), pv = T.pavingOf(els);
  assert.ok(sites.length >= 1, 'the inside corner is a turn site');
  const t = sites[0]; assert.equal(T.turnFits(t, T.VEHICLES.P, pv).ok, true, 'a car');
  assert.equal(T.turnFits(t, T.VEHICLES.FIRE, pv).ok, false, 'a fire truck (30 / 50 ft) cannot');
  const curb = { id: 'c', kind: 'drive', poly: T.curbReturn(t, 30) };
  assert.equal(T.turnFits(t, T.VEHICLES.FIRE, T.pavingOf([A, Bd, curb])).ok, true, 'with the curb return it can');
});
ok('a bend drawn along a path: a wide, gentle bend passes the fire truck, a tight narrow one does not', () => {
  const wide = { id: 'p', kind: 'drive', path: [[0, 0], [200, 0], [200, 200]], width: 28, r: 45 }, tight = { ...wide, id: 'q', width: 20, r: 12 };
  for (const [e, want] of [[wide, true], [tight, false]]) { const s = T.turnSites([e]); assert.equal(s.length, 1); assert.equal(T.turnFits(s[0], T.VEHICLES.FIRE, T.pavingOf([e])).ok, want, JSON.stringify(e)); }
});
ok('a dead end over 150 ft on the fire route needs a turnaround; a cul-de-sac bulb is one; a parking aisle is not a fire lane', () => {
  const loop = [{ id: 'l1', kind: 'drive', x: 450, y: 100, w: 600, d: 24 }, { id: 'l2', kind: 'drive', x: 450, y: 300, w: 600, d: 24 }, { id: 'l3', kind: 'drive', x: 162, y: 200, w: 24, d: 224 }, { id: 'l4', kind: 'drive', x: 738, y: 200, w: 24, d: 224 }];
  const spur = { id: 's', kind: 'drive', x: 450, y: 412, w: 24, d: 200 }, touch = (a, b) => S.gapBetween(S.shapeOf(a), S.shapeOf(b)) <= 1;
  assert.deepEqual(T.deadEnds(loop.concat([spur]), touch).map(x => x.id), ['s']);
  assert.deepEqual(T.deadEnds(loop.concat([{ ...spur, bulb: true }]), touch), []);
  assert.deepEqual(T.deadEnds(loop.concat([{ ...spur, d: 120, y: 372 }]), touch), [], 'a 120 ft spur is short enough');
  assert.deepEqual(T.deadEnds(loop.concat([spur]), touch, e => e.id, e => !!e.entry, e => e.id !== 's'), [], 'off the fire route (a parking aisle): not reported');
});
ok('the check: a two-way drive under 20 ft fails (hard); a one-way drive-thru lane is not a fire lane', () => {
  const brief = B.canonicalBrief(B.briefFromRequest('6,000 sf retail', RECT));
  const base = [{ id: 'e', kind: 'drive', name: 'Main entry', entry: true, x: 450, y: 30, w: 24, d: 60 }, { id: 'd', kind: 'drive', x: 450, y: 72, w: 400, d: 24 }, { id: 'b1', kind: 'building', use: 'retail', x: 450, y: 160, w: 100, d: 60 }];
  const chk = els => V.validateLayout({ ...RECT, elements: els }, brief).checks.find(c => c.id === 'access.fire-width');
  assert.equal(chk(base).status, 'pass'); assert.equal(chk(base).hard, true);
  assert.equal(chk(base.map(e => e.id === 'd' ? { ...e, d: 16 } : e)).status, 'fail');
  assert.equal(chk(base.concat([{ id: 'q', kind: 'drive', name: 'Drive-thru', note: 'Drive-thru · one way', x: 450, y: 220, w: 200, d: 12 }])).status, 'pass');
});
ok('the run rounds the entry\'s corners so a fire truck turns in (exactly 120 garden apartments)', () => {
  const o = RUN.runBrief(B.briefFromRequest('exactly 120 garden apartments, 3 stories', RECT)).options[0], c = id => o.validation.checks.find(k => k.id === id);
  assert.equal(o.validation.status, 'pass'); assert.equal(c('eng.turning.fire').status, 'pass', JSON.stringify(c('eng.turning.fire')));
  assert.ok(o.elements.some(e => e.curb), 'curb returns drawn'); assert.equal(c('access.dead-end').status, 'pass'); assert.equal(c('access.fire-width').status, 'pass');
});
ok('a garage ramp: long enough for the rise on a 240 ft podium, too short on a 120 ft one; heights stated', () => {
  const big = S.garagePlan({ w: 240, d: 128 }).rampSpec, small = S.garagePlan({ w: 120, d: 128 }).rampSpec;
  assert.equal(big.fits, true, JSON.stringify(big)); assert.equal(big.kind, 'speed'); assert.ok(big.need > 70 && big.need < 90);
  assert.equal(small.fits, false, JSON.stringify(small));
  assert.equal(S.garagePlan({ w: 240, d: 128 }).heights.ground.clear, 8.17);
  assert.ok(Math.abs(S.rampLengthFor(10, 'parking') - 150) < 0.5, 'a 10 ft rise at 6.67% is 150 ft');
});
console.log('turning: ' + n + ' passed');
