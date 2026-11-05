// Mixed-use plans parked and laid out under a city's rules (docs/LAYOUT-ENGINE.md item 33), found by an agent test through
// the MCP server on a 24.8 ac Waller parcel: (1) each use judged at its own rule (a hotel by its keys, shops at their
// ratio, homes at the city's two a home, each with the city's reserve), by the run and by the independent check alike;
// (2) the reserve applied once when the plan handed to the run is the guardrails' effective plan already; (3) angled
// parking asked for on a mixed plan drawn where it can be, else said; (4) a small Waller site with a hotel and shops
// laid out in zones (the hotel keeps its type), a deeper pond where the 4 ft one leaves no room, the zoneless simple
// layout only as a last resort and then keeping the zones. Synthetic sites, the street on edge 0; the app's path into
// the run (lib/guardrails.mjs forLayout, then lib/layoutrun.mjs runPlan).
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), V = await import('../lib/layoutcheck.mjs'), B = await import('../lib/layoutbrief.mjs'), RUN = await import('../lib/layoutrun.mjs'), G = await import('../lib/guardrails.mjs'), L = await import('../lib/sitelayout.mjs');

const SB = { front: 25, side: 10, rear: 20, paving: 10 };
const waller = (w, h) => ({ origin: [-95.93, 30.06], ring: [[0, 0], [w, 0], [w, h], [0, h]], front: 0, streets: [], setbacks: { ...SB }, elements: [], params: { guard: { mode: 'on' } } });
const ASK = 'a 120-key hotel and 20,000 sf of retail, parking behind the buildings';
// the app's way in: the guardrails' plan and program (the reserve already on the program), then runPlan
const appRun = (plan, ask, opts = {}) => { const prog = S.guessProgram(ask), g = G.forLayout({ ...plan, program: prog }, prog, { count: 3 }); return { g, r: RUN.runPlan(g.plan, g.program, { ...g.opts, ...opts }, { ask }) }; };
const judged = (g, o) => V.validateLayout({ ...g.plan, elements: o.elements, program: o.program }, o.run.brief);

// ---- (1) each use at its own rule: the brief's rules, the check's count on a drawn hotel and shops ----
{
  const plan = waller(1300, 831), prog = S.guessProgram(ASK), g = G.forLayout({ ...plan, program: prog }, prog, {});
  const b = RUN.governingParking(B.briefFromProgram(g.program, g.plan, { text: ASK, parser: 'app' }), g.plan, g.program), by = b.rules.values.parkingByUse?.v;
  assert.ok(by, 'a mixed plan governed use by use'); assert.equal(b.rules.values.parkingPer1000.v, null, 'no one ratio laid on every use');
  assert.equal(by.retail.per1000, 4.2, 'shops: 4 a 1,000 sf with the 5% reserve'); assert.equal(by.hotel.perKey, 1.05, 'the hotel: one a key with the reserve'); assert.equal(by.hotel.sfPerKey, 550);
  // the independent check on a drawing: 120 keys and 20,000 sf of shops need 126 + 84 = 210, not 86,000 sf at the shops' ratio (362)
  const els = [{ id: 'h', kind: 'building', use: 'hotel', zone: 1, btype: 'hotel-limited', keys: 120, x: 300, y: 400, w: 254, d: 65, floors: 4 }, { id: 'r', kind: 'building', use: 'retail', zone: 0, x: 800, y: 300, w: 200, d: 100, floors: 1 }];
  const q = V.quantities({ ...g.plan, elements: els, program: g.program }, B.canonicalBrief(b)).parking;
  assert.equal(q.required, 210, 'per use: ' + q.required); assert.match(q.rule, /use by use/);
  const q2 = V.quantities({ ...g.plan, elements: els.map(e => ({ ...e, keys: undefined })), program: g.program }, B.canonicalBrief(b)).parking; // (no keys stated: the hotel's floor area at 550 sf a key)
  assert.equal(q2.required, Math.ceil(254 * 65 * 4 / 550 * 1.05 + 84 - 0.01));
  // homes in a mixed plan: the city's two a home with the reserve; townhomes keep their own rule (garages)
  const pm = S.guessProgram('20,000 sf retail along the road, 200 apartments behind and 40 townhomes'), gm = G.forLayout({ ...plan, program: pm }, pm, {});
  const bm = RUN.governingParking(B.briefFromProgram(gm.program, gm.plan, { text: '', parser: 'app' }), gm.plan, gm.program).rules.values.parkingByUse.v;
  assert.equal(bm.multifamily.perUnit, 2.1); assert.equal(bm.retail.per1000, 4.2); assert.equal(bm.townhomes, undefined);
  // the run: every option judged per use and parked to it (before: 380 required, every option failing parking.count)
  const { g: g2, r } = appRun(plan, ASK); assert.equal(r.outcome, 'feasible');
  for (const o of r.options) { const v = judged(g2, o), qq = v.quantities.parking; assert.equal(qq.required, 210, o.name + ': ' + qq.required); assert.ok(qq.provided >= qq.required, o.name); assert.notEqual(v.checks.find(c => c.id === 'parking.count').status, 'fail'); }
  assert.equal(r.options[0].check.status, 'pass'); const h = r.options[0].elements.filter(e => e.kind === 'building' && e.use === 'hotel');
  assert.ok(h.length && h.every(e => e.btype === 'hotel-limited') && h.reduce((t, e) => t + e.keys, 0) === 120, 'the hotel typed, its 120 keys');
}
// ---- (2) the reserve once: an effective plan (the app's and the MCP's) is not factored again ----
{
  const plan = waller(900, 500), ask = '120 garden apartments, 3 stories', prog = S.guessProgram(ask), g = G.forLayout({ ...plan, program: prog }, prog, {});
  assert.equal(g.program.perUnit, 2.1, 'the effective program carries the reserve');
  const b = RUN.governingParking(B.briefFromProgram(g.program, g.plan, { text: ask, parser: 'app' }), g.plan, g.program);
  assert.equal(b.rules.values.parkingPerUnit.v, 2.1, 'not 2.205'); assert.ok(b.rules.guarded, 'the brief marked as governed');
  RUN.governingParking(b, g.plan, g.program); assert.equal(b.rules.values.parkingPerUnit.v, 2.1, 'a second call leaves it');
  const raw = RUN.governingParking(B.briefFromProgram(prog, plan, { text: ask, parser: 'app' }), plan, prog); assert.equal(raw.rules.values.parkingPerUnit.v, 2.1, 'the raw plan: the same rule');
  const mb = RUN.briefForPlan(g.plan, g.program, g.opts, { ask }); assert.equal(mb.rules.values.parkingPerUnit.v, 2.1);
  // mixed, through the effective plan: 4.2 for the shops, not 4.41
  const pm = S.guessProgram(ASK), gm = G.forLayout({ ...plan, program: pm }, pm, {}), bb = RUN.briefForPlan(gm.plan, gm.program, gm.opts, { ask: ASK });
  assert.equal(bb.rules.values.parkingByUse.v.retail.per1000, 4.2); assert.equal(bb.rules.values.parkingByUse.v.hotel.perKey, 1.05);
}
// ---- (3) angled parking asked for on a mixed plan: drawn where the aisles allow, else said ----
{
  const plan = waller(1300, 831), { g, r } = appRun(plan, 'a 120-key hotel and 20,000 sf of retail, 60 degree angled parking');
  const o = r.options[0], ang = o.elements.filter(e => e.kind === 'parking' && S.stallAng(e) === 60), ow = o.elements.filter(e => e.kind === 'drive' && e.oneWay);
  assert.ok(ang.length >= 3 && ow.length >= 2, 'angled rows on one-way aisles: ' + ang.length + ' / ' + ow.length); assert.equal(o.check.status, 'pass');
  assert.ok(o.notes.some(t => /^Angled parking, as asked: 60° stalls on \d+ of the \d+ parking aisles/.test(t)));
  const v = judged(g, o); assert.equal(v.checks.find(c => c.id === 'access.one-way')?.status, 'pass'); assert.ok(v.quantities.parking.provided >= v.quantities.parking.required);
  assert.ok(!v.checks.some(c => !c.hard && c.status === 'fail'), 'no warnings');
  // every option angled or saying why not
  for (const x of r.options) assert.ok(x.elements.some(e => e.kind === 'parking' && S.stallAng(e)) || x.notes.some(t => /Angled parking at 60° was asked for, but/.test(t)), x.name);
  // a mixed plan with no aisle a drive joins at both ends: square, and the note says why
  const brief = B.canonicalBrief(B.briefFromRequest('a hotel with 120 keys and 20,000 sf of retail, angled parking', { ...plan, params: {} }));
  const lone = { elements: [{ id: 'b', kind: 'building', use: 'retail', zone: 0, x: 400, y: 300, w: 200, d: 100 }, { id: 'a', kind: 'drive', x: 400, y: 180, w: 200, d: 24, rot: 0, note: '24 ft drive aisle' }, { id: 'p', kind: 'parking', x: 400, y: 159, w: 180, d: 18, rot: 0, row: 1 }], program: { use: 'retail', zones: [{ use: 'retail' }, { use: 'hotel' }] } };
  const said = RUN.angleMixed(plan, lone, brief); assert.ok(!said.elements.some(e => S.stallAng(e)), 'kept square'); assert.ok(said.tplNotes.some(t => /keeps square stalls on two-way aisles: its parking rows have no aisle/.test(t)));
  // not asked: untouched
  const nb = B.canonicalBrief(B.briefFromRequest('a hotel with 120 keys and 20,000 sf of retail', { ...plan, params: {} })); assert.equal(RUN.angleMixed(plan, lone, nb), lone);
  // a single-use plan (item 36: the older generator's square rows, apartments' included) is tried too and says why not;
  // one that already says why (the field engine's square fallback) is left alone
  const sb = B.canonicalBrief(B.briefFromRequest('150 apartments with angled parking', { ...plan, params: {} })), one = { ...lone, program: { use: 'multifamily' } };
  const s1 = RUN.angleMixed(plan, one, sb); assert.ok(s1.tplNotes.some(t => /Angled parking was asked for, but this layout keeps square stalls/.test(t)));
  const told = { ...one, notes: ['Angled parking was asked for, but on this lot no layout with angled stalls parks the program.'] }; assert.equal(RUN.angleMixed(plan, told, sb), told);
}
// ---- (4) a small Waller site: zones, the hotel typed, parked to the requirement or saying why ----
{
  const plan = waller(900, 630); // 13.0 ac: 1 ac-ft a developed acre, 4 ft deep, about 4.5 ac of pond
  const { g, r } = appRun(plan, ASK, { deeper: true }), o = r.options[0], v = judged(g, o);
  assert.equal(o.check.status, 'pass', o.name + ' ' + o.check.failed.join(',')); assert.match(o.name, /deep pond/, 'the deeper pond makes room: ' + o.name);
  assert.ok(v.quantities.parking.provided >= v.quantities.parking.required && v.quantities.parking.required === 210);
  for (const x of r.options) { assert.ok(!/^Simple layout/.test(x.name), x.name); const h = x.elements.filter(e => e.kind === 'building' && e.use === 'hotel'); assert.ok(h.length && h.every(e => e.zone === 1 && e.btype === 'hotel-limited' && e.keys > 0), x.name + ': the hotel typed'); }
  // at the plan's 4 ft only: zone layouts still (no simple layout), short of the program and saying what would make room
  const { r: r4 } = appRun(plan, ASK);
  for (const x of r4.options) { assert.ok(!/^Simple layout/.test(x.name), x.name); assert.ok(x.elements.some(e => e.kind === 'building' && e.use === 'hotel' && e.btype === 'hotel-limited'), x.name);
    if (x.check.status !== 'pass') assert.ok(x.notes.some(t => /a deeper pond .* or underground storage/.test(t)), x.name + ': says why'); }
  // the simple layouts (the last resort, a lot too small for the zone bands) keep each building's zone, so the hotel keeps its type
  const tiny = { ...waller(300, 250), params: {} }, simple = L.layoutOptions(tiny, S.guessProgram('a 120-key hotel and 20,000 sf of retail'), { count: 3 });
  assert.ok(simple.length && simple.every(x => /^Simple layout/.test(x.name)), simple.map(x => x.name).join(', '));
  for (const x of simple) { const bs = x.elements.filter(e => e.kind === 'building' && e.use !== 'amenity'); assert.ok(bs.length && bs.every(e => e.zone === (e.use === 'hotel' ? 1 : 0)), 'zones kept'); }
  const rec = RUN.runBrief(B.briefFromRequest('a 120-key hotel and 20,000 sf of retail', tiny));
  for (const x of rec.options.filter(x => /^Simple layout/.test(x.name))) { assert.ok(x.elements.some(e => e.use === 'hotel' && e.btype === 'hotel-limited' && e.keys > 0), 'typed'); if (x.validation.checks.find(c => c.id === 'parking.count').status === 'fail') assert.ok(x.notes.some(t => /^A simple layout: .* parks \d+ of the \d+ spaces required/.test(t)), 'short and saying so'); }
}
console.log('mixed parking: ok');
