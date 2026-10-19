// Offline tests for the commercial parking-field engine (lib/siteparking.mjs) on realistic lots: a 5-acre lot with
// slightly skewed sides, a 2-acre square, a 3-acre corner lot with a side street, a corner lot with its corner clipped,
// a wedge, the 8-sided FM 362 ring (a notch out of its back), and a 20-acre tract. For each commercial use the
// recommended option must be one a civil engineer would sketch: no rule broken, no aisle that dead-ends, a clear
// stacking distance at the main entry with no stall beside it, every wall of every building within 150 ft of a fire
// lane, a rear service drive for shops and restaurants (unless the note says there's no room), whole rows of six stalls
// or more, straight rows that line up, enough parking, and at least the floor area the older stacks laid out.
// Then the brief an AI hands the engine (opts.brief), and a building dragged in the editor and re-fitted.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PK = await import('../lib/siteparking.mjs');

const FM = [[-441.8, -191.92], [475.3, -185.63], [474.61, -55.83], [354.06, -58.81], [353.81, 31.2], [474.04, 34.19], [472.83, 185.77], [-446.13, 190.03]];
const LOTS = {
  lot5ac: { ring: [[0, 0], [520, 0], [540, 430], [10, 445]] },
  square2ac: { ring: [[0, 0], [300, 0], [300, 290], [0, 290]] },
  corner3ac: { ring: [[0, 0], [380, 0], [380, 340], [0, 340]], streets: [1] },
  clipped: { ring: [[0, 0], [330, 0], [400, 70], [400, 380], [0, 380]], streets: [2] },
  wedge: { ring: [[0, 0], [700, 0], [60, 620]] },
  fm362: { ring: FM, front: 7 },
  big20: { ring: [[0, 0], [1000, 0], [1010, 880], [0, 870]] }
};
const planOf = lk => ({ origin: [-95.8245, 29.7855], front: LOTS[lk].front ?? 0, setbacks: { ...S.SETBACKS }, elements: [], ...LOTS[lk] });
const P = {
  retail: { use: 'retail', gfa: 25000 }, retailMax: { use: 'retail', max: true }, restaurant: { use: 'restaurant', gfa: 6000, extras: ['drivethru'] },
  office: { use: 'office', gfa: 40000, floors: 2 }, medical: { use: 'medical', gfa: 20000 }, hotel: { use: 'hotel', gfa: 55000, floors: 4 },
  church: { use: 'church', gfa: 15000 }, other: { use: 'other', gfa: 20000 }
};
// [program, lot, the floor area the older stacks laid out on it before this engine (sq ft)]
const CASES = [
  ['retail', 'lot5ac', 25000], ['retail', 'square2ac', 11246], ['retail', 'corner3ac', 25000], ['retail', 'clipped', 25000], ['retail', 'wedge', 25000], ['retail', 'fm362', 50000], ['retail', 'big20', 200000],
  ['retailMax', 'lot5ac', 35434], ['retailMax', 'corner3ac', 19521], ['retailMax', 'fm362', 59250],
  ['restaurant', 'lot5ac', 12000], ['restaurant', 'square2ac', 5600 /* (the older stacks put 6,000 here only with a dead-end aisle and stalls at the mouth of the entry) */], ['restaurant', 'corner3ac', 6000], ['restaurant', 'big20', 89145],
  ['office', 'lot5ac', 40000], ['office', 'clipped', 27233], ['office', 'wedge', 40000],
  ['medical', 'square2ac', 9564], ['medical', 'lot5ac', 20000], ['medical', 'fm362', 40000],
  ['hotel', 'lot5ac', 55000], ['hotel', 'corner3ac', 55000], ['hotel', 'big20', 494999],
  ['church', 'lot5ac', 15000], ['church', 'clipped', 13650],
  ['other', 'lot5ac', 20000], ['other', 'wedge', 20000]
];

const rowsOf = els => els.filter(e => e.kind === 'parking');
// the checks every recommended option is held to
function sound(plan, o, what, use) {
  const p = { ...plan, elements: o.elements, program: o.program }, m = S.metrics(p), iss = S.check(p);
  assert.ok(o.recipe?.pf, what + ': laid out by the parking-field engine');
  assert.deepEqual(iss.filter(i => i.level === 'bad').map(i => i.text), [], what + ': no rule broken');
  assert.deepEqual(iss.filter(i => / dead-ends /.test(i.text)).map(i => i.text), [], what + ': no aisle dead-ends');
  assert.deepEqual(iss.filter(i => /is at the mouth of/.test(i.text)).map(i => i.text), [], what + ': nothing at the mouth of the entry');
  const th = PK.throatOf(p, o.elements); assert.ok(th, what + ': a main entry');
  assert.deepEqual(th.stalls, [], what + ': no stall beside the entry throat');
  assert.ok(th.len >= 45, what + ': a clear stacking distance (' + Math.round(th.len) + ' ft)');
  assert.deepEqual(PK.fireReach(o.elements).map(f => Math.round(f.d)), [], what + ': every wall within 150 ft of a fire lane');
  assert.deepEqual(PK.stubRows(o.elements).map(e => S.stalls(e).count), [], what + ': no stub rows');
  assert.ok(m.spaces >= m.required, what + ': parking ' + m.spaces + ' of ' + m.required);
  if (use === 'retail' || use === 'restaurant') assert.ok(o.elements.some(e => e.kind === 'drive' && e.name === 'Service drive') || o.notes.some(t => /No room for a rear service drive/.test(t)), what + ': a rear service drive');
  // straight rows that line up: every row square to the others (one angle, or a quarter turn from it)
  const angs = rowsOf(o.elements).map(e => ((((e.rot || 0) % 90) + 90) % 90)), a0 = angs[0];
  assert.ok(angs.every(a => Math.min(Math.abs(a - a0), 90 - Math.abs(a - a0)) < 0.6), what + ': rows square to each other');
  // islands: a planted end at each end of every row of eight stalls or more
  assert.ok(rowsOf(o.elements).every(e => e.caps || Math.round(e.w / (e.sw || S.STALL.w)) < 8), what + ': planted row ends');
  assert.ok(o.elements.filter(e => e.kind === 'pond').length <= 1, what + ': one pond');
  return m;
}

// ---- every commercial use, the recommended option ----
const seen = [];
for (const [pn, lk, before] of CASES) {
  const plan = planOf(lk), what = pn + ' on ' + lk, t0 = Date.now(), opts = L.layoutOptions(plan, P[pn]), ms = Date.now() - t0;
  assert.ok(opts.length >= 1, what + ': options');
  const m = sound(plan, opts[0], what, P[pn].use);
  assert.ok(m.gfa >= before - 1, what + ': ' + Math.round(m.gfa) + ' sq ft, at least the ' + before + ' laid out before');
  assert.ok(ms < 20000, what + ': ' + ms + ' ms');
  seen.push(what + ' ' + Math.round(m.gfa) + ' sf ' + m.spaces + '/' + m.required + ' ' + ms + ' ms');
}
// the corner lot is reached from both streets
{ const plan = planOf('corner3ac'), o = L.layoutOptions(plan, P.retail)[0];
  assert.ok(S.entrancesOf(o.elements).length >= 2, 'a corner lot: a second entrance'); }
// a medical office the program doesn't fix the floors of goes up a floor rather than build less, and says so
{ const plan = planOf('square2ac'), o = L.layoutOptions(plan, P.medical)[0];
  assert.equal(o.program.floors, 2, 'two floors'); assert.ok(o.notes.some(t => /two floors|of the 20,000 sq ft/.test(t)), 'it says how much fits and why: ' + o.notes.join(' / ')); }
// "as much as fits" says what bound it
{ const o = L.layoutOptions(planOf('lot5ac'), P.retailMax)[0]; assert.ok(o.notes.some(t => /^As much as fits: .*(parking|setbacks|coverage|FAR)/.test(t)), 'the binding constraint: ' + o.notes.join(' / ')); }

// ---- the brief ----
assert.equal(typeof PK.BRIEF_SHAPE, 'object'); assert.ok(PK.BRIEF_SHAPE.buildings[0].at.includes('front'));
{ const b = PK.normalizeBrief({ buildings: [{ use: 'spa', gfa: 'lots', at: 'top', facing: 'street' }, null, { use: 'restaurant', gfa: 4500, floors: 1, at: 'corner' }], parking: 'diagonal', pond: 'none', serviceDrive: 'yes', pads: 9 });
  assert.deepEqual(b.buildings[0], { use: null, gfa: null, floors: null, w: null, d: null, at: null, facing: 'street' }, 'what it doesn’t know is dropped');
  assert.equal(b.buildings.length, 2); assert.equal(b.parking, null); assert.equal(b.pond, 'none'); assert.equal(b.serviceDrive, null); assert.equal(b.pads, 4);
  assert.equal(PK.normalizeBrief({}), null); assert.equal(PK.normalizeBrief('two pads'), null);
  const pr = PK.briefProgram({ use: 'retail', gfa: 1000 }, { buildings: [{ gfa: 12000 }, { use: 'restaurant', w: 60, d: 50 }] });
  assert.equal(pr.gfa, 15000); assert.equal(pr.buildings, 2); }
const lot5 = planOf('lot5ac'), mainOf = o => o.elements.filter(e => e.kind === 'building' && e.note !== 'QSR / coffee · drive-thru');
{ // two pads along the street, beside the way in, each with its drive-thru lane; the program's 25,000 sq ft on top
  const o = L.layoutOptions(lot5, P.retail, { brief: { pads: 2 } })[0];
  sound(lot5, o, 'two pads', 'retail');
  const pads = o.elements.filter(e => e.kind === 'building' && e.note === 'QSR / coffee · drive-thru'); assert.equal(pads.length, 2, 'two pads');
  assert.equal(o.elements.filter(e => e.note === 'Drive-thru lane').length, 2, 'each with its lane');
  assert.ok(Math.abs(mainOf(o).reduce((t, e) => t + S.gfaOf(e), 0) - 25000) < 300, 'and the 25,000 sq ft');
  for (const p of pads) assert.ok(p.y < Math.min(...mainOf(o).map(e => e.y)), 'pads in front of the shops'); }
{ // shops at the street, parking behind them
  const o = L.layoutOptions(lot5, P.retail, { brief: { parking: 'back', buildings: [{ use: 'retail', gfa: 12000, at: 'left', facing: 'street' }, { use: 'restaurant', gfa: 5000, at: 'right', facing: 'street' }] } })[0];
  sound(lot5, o, 'parking behind', 'retail');
  const B = mainOf(o), rows = rowsOf(o.elements); assert.equal(B.length, 2, 'the two buildings');
  assert.ok(B.every(b => b.y < Math.min(...rows.map(e => e.y))), 'both nearer the street than every row of parking');
  assert.ok(B.some(b => b.use === 'restaurant'), 'each building its own use');
  const m = S.metrics({ ...lot5, elements: o.elements, program: o.program }); assert.ok(Math.abs(m.gfa - 17000) < 200 && m.spaces >= m.required, 'parked at each use’s own ratio: ' + m.spaces + '/' + m.required); }
{ // no pond: none drawn, and the note says where the water goes
  const o = L.layoutOptions(lot5, P.retail, { brief: { pond: 'none' } })[0];
  assert.equal(o.elements.filter(e => e.kind === 'pond').length, 0); assert.ok(o.notes.some(t => /No pond, as the brief asks/.test(t)), o.notes.join(' / ')); }
{ // parking at the sides: rows running back from the street, the building between them
  const o = L.layoutOptions(lot5, { use: 'office', gfa: 30000, floors: 2 }, { brief: { parking: 'sides' } })[0];
  sound(lot5, o, 'parking at the sides', 'office'); assert.ok(o.recipe.deep, 'rows running back'); }
{ // a brief that can't be done as asked: the nearest that fits, and a note that says what changed
  const o = L.layoutOptions(planOf('square2ac'), P.retail, { brief: { parking: 'back', buildings: [{ use: 'retail', gfa: 30000, at: 'front' }, { use: 'retail', gfa: 30000, at: 'front' }] } })[0];
  assert.ok(o?.elements?.length, 'something still comes back');
  assert.ok(o.notes.some(t => /brief/.test(t)), 'and says how it differs from the brief: ' + o.notes.join(' / ')); }

// ---- the editor: a building dragged, the plan re-fitted round it ----
{
  const o = L.layoutOptions(lot5, P.retail, { count: 1 })[0], p = { ...lot5, elements: structuredClone(o.elements), program: o.program, recipe: o.recipe };
  const B = p.elements.find(e => e.kind === 'building'); B.x += 30; B.pinned = true;
  const r = L.refit(p, { amount: 'current' }); assert.ok(r?.elements?.length, 're-fits');
  const kept = r.elements.find(e => e.id === B.id); assert.ok(kept && Math.abs(kept.x - B.x) < 0.01 && Math.abs(kept.y - B.y) < 0.01, 'the dragged building stays where it was put');
  const q = { ...p, elements: r.elements }, m = S.metrics(q), iss = S.check(q);
  assert.deepEqual(iss.filter(i => i.level === 'bad').map(i => i.text), [], 'no rule broken after the re-fit');
  assert.deepEqual(iss.filter(i => / dead-ends /.test(i.text)).map(i => i.text), [], 'no dead ends after the re-fit');
  assert.ok(m.spaces >= m.required && Math.abs(m.gfa - 25000) < 1500, 'the same plan, parked: ' + Math.round(m.gfa) + ' sf ' + m.spaces + '/' + m.required);
  assert.deepEqual(PK.fireReach(r.elements).map(f => Math.round(f.d)), [], 'still within reach of a fire lane');
}

console.log('parkingfield: ' + seen.length + ' layouts sound');
for (const s of seen) console.log('  ' + s);
