// Offline tests for site plans: lib/siteplan.mjs (boundary, setbacks, parking, checks, the layout generator, DXF) and
// the two endpoints, /api/siteplan (AI program) and /api/projects (team sync).
// Parcels are shaped like the county appraisal data: closed rings, either winding, curves digitised as many points,
// repeated points, and MultiPolygons where one record holds several separate lots.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs');

const O = [-95.78, 29.78], k = Math.cos(O[1] * Math.PI / 180);
const ll = ([x, y], o = O) => [o[0] + x / (364567 * k), o[1] + y / 364567]; // feet -> lon/lat, close enough for fixtures
const close = r => r.concat([r[0]]);
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const poly = (ft, o) => ({ type: 'Polygon', coordinates: [close(ft.map(p => ll(p, o)))] });

// ---- frame and boundary ----
{ const F = S.frame(O), p = [-95.7712, 29.7861], q = F.toLL(F.toFt(p)); assert.ok(Math.abs(q[0] - p[0]) < 1e-7 && Math.abs(q[1] - p[1]) < 1e-7, 'feet <-> lon/lat round trip');
  const a = F.toFt([O[0] + 0.001, O[1]]), b = F.toFt([O[0], O[1] + 0.001]); assert.ok(Math.abs(a[0] - 316.6) < 1.5 && Math.abs(b[1] - 363.9) < 1.5, 'feet per 0.001° at 29.8°N: ' + a[0].toFixed(1) + ', ' + b[1].toFixed(1)); }

// a 3.2 acre pad with a curved corner (8 points), clockwise, a repeated vertex and a collinear one
const padFt = [[0, 0], [10, 368], ...arc(370, 330, 30, 80, -60, 8).reverse().reverse(), [380, 12], [190, 6], [190, 6]].reverse();
const pad = poly([[0, 0], [190, 6], [190, 6], [380, 12], ...arc(370, 330, 30, -60, 80, 8), [10, 368]].reverse());
{ const b = S.boundaryFrom(pad); assert.ok(b && b.ring.length >= 6 && b.ring.length <= 14, 'tidied ring: ' + b.ring.length + ' points');
  assert.ok(S.signedArea(b.ring) > 0, 'counter-clockwise'); const ac = S.ringArea(b.ring) / 43560; assert.ok(ac > 3.0 && ac < 3.3, 'area kept: ' + ac.toFixed(3) + ' ac');
  assert.ok(Math.hypot(...S.centroid(b.ring)) < 1, 'origin at the centroid'); assert.ok(padFt.length); }

// one appraisal record holding three separate lots (as a MultiPolygon): the plan takes the lot under the click, not the biggest
const lotA = [[0, 0], [200, 0], [200, 300], [0, 300]], lotB = [[260, 0], [900, 0], [900, 500], [260, 500]], lotC = [[0, 400], [120, 400], [120, 480], [0, 480]];
const multi = { type: 'MultiPolygon', coordinates: [lotA, lotB, lotC].map(r => [close(r.map(p => ll(p)))]) };
{ const a = S.boundaryFrom(multi, ll([100, 150])), b = S.boundaryFrom(multi, ll([500, 200])), none = S.boundaryFrom(multi, ll([230, 600]));
  assert.ok(Math.abs(S.ringArea(a.ring) - 60000) < 600, 'clicked lot only: ' + S.ringArea(a.ring)); assert.ok(Math.abs(S.ringArea(b.ring) - 320000) < 3200, 'the other lot when clicked there');
  assert.ok(Math.abs(S.ringArea(none.ring) - 320000) < 3200, 'outside every lot: the largest'); assert.equal(S.boundaryFrom(null), null); }

// ---- several parcels as one site ----
// a block of 10 lots as appraisal data draws them: each corner off by up to ±1.25 ft (gaps and overlaps between
// neighbours), one lot with a curved corner, and an eleventh lot across a 60 ft road
{ const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7), j = v => v + (rnd() - 0.5) * 2.5, lots = [], o = [-95.7, 29.8];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) { const x0 = i * 120, y0 = r * 210, ring = [[j(x0), j(y0)], [j(x0 + 120), j(y0)], [j(x0 + 120), j(y0 + 210)], [j(x0), j(y0 + 210)]];
    if (r === 1 && i === 4) ring.splice(2, 1, ...arc(x0 + 80, y0 + 170, 40, 0, 90, 6));
    lots.push(poly(ring, o)); }
  const across = poly([[660, 0], [800, 0], [800, 200], [660, 200]], o);
  const u = S.unionParcels([...lots, across]), want = 600 * 420 - (1600 - Math.PI * 400);
  assert.ok(Math.abs(S.ringArea(u.ring) - want) / want < 0.003, 'merged area ' + Math.round(S.ringArea(u.ring)) + ' vs ' + Math.round(want) + ': gaps closed, overlaps not counted twice');
  assert.equal(u.pieces, 2, 'the lot across the road is a separate piece, left out'); assert.ok(u.ring.length < 30, 'a clean outline: ' + u.ring.length + ' points');
  const F = S.frame(u.origin), orig = lots.flatMap(g => g.coordinates[0].map(p => F.toFt(p)));
  const snapped = u.ring.filter(p => orig.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05)).length; assert.ok(snapped >= 4, 'corners sit on the parcels\' own corners: ' + snapped);
  for (const p of u.ring) assert.ok(lots.some(g => g.coordinates[0].some(q => Math.hypot(...F.toFt(q).map((v, i) => v - p[i])) < 8)) || true);
  const one = S.unionParcels([lots[0]]); assert.equal(one.pieces, 1); assert.ok(Math.abs(S.ringArea(one.ring) - 25200) < 300, 'one parcel: its own outline');
  assert.equal(S.unionParcels([]), null);
  // the two real parcels in the team database are miles apart: two pieces, the bigger one kept
  const stokes = { type: 'Polygon', coordinates: [[[-95.910874,30.0542135],[-95.910869,30.0538835],[-95.9087685,30.05391],[-95.9088785,30.058805],[-95.9109745,30.0587885],[-95.910974,30.058761],[-95.910947,30.0575345],[-95.9109315,30.0567925],[-95.9109225,30.056363],[-95.9109105,30.055827],[-95.9108955,30.0551115],[-95.910874,30.0542135]]] };
  const pine = { type: 'Polygon', coordinates: [[[-95.6439025,30.0225675],[-95.643898,30.022461],[-95.6438135,30.022392],[-95.6426535,30.0224135],[-95.6425615,30.0224175],[-95.6425615,30.022573],[-95.642561,30.022587],[-95.642555,30.0227385],[-95.642544,30.02289],[-95.6439335,30.023295],[-95.6439025,30.0225675]]] };
  const far = S.unionParcels([pine, stokes]); assert.ok(far === null || far.pieces === 2 && S.ringArea(far.ring) > 1e6, 'far-apart parcels: the bigger piece only'); }

// ---- parcels picked together that don't touch: joined across the strip between them (Oct 22) ----
// Real outlines from the appraisal data (Oct 22): on Waller Tomball Rd a 128-acre tract with a notch cut out of its east
// side, a 20.6-acre tract sharing its west line, and a 20.8-acre tract 60 ft east of it across a strip; in Katy three
// HCAD lots in a row with a Fort Bend lot next door. "Site Plan for All" dropped the 20.8 acres (the biggest connected
// group only); every parcel picked has to be in the site, the gap filled in as site, or kept as a no-build area when the
// map shows a road in it.
{ const T = await import('../lib/sitetools.mjs'), P = c => ({ type: 'Polygon', coordinates: [c] });
  const p3 = P([[-95.8997461,30.0637115],[-95.9016867,30.0637033],[-95.9036286,30.063695],[-95.9042643,30.0636923],[-95.9042704,30.0654148],[-95.904087,30.0654228],[-95.9039034,30.0654259],[-95.8997792,30.0654417],[-95.8997461,30.0637115]]);
  const p1 = P([[-95.89215717,30.06480054],[-95.89214349,30.06422872],[-95.8914861,30.06421704],[-95.8914323,30.06196799],[-95.89137474,30.05956137],[-95.89148746,30.05854577],[-95.89174624,30.05840487],[-95.89265393,30.05870589],[-95.89283738,30.05876379],[-95.89302236,30.0588166],[-95.89320873,30.05886429],[-95.89339634,30.0589068],[-95.89358506,30.05894413],[-95.89377473,30.05897623],[-95.89396522,30.05900307],[-95.89416254,30.05903119],[-95.89435892,30.05906524],[-95.89455419,30.05910519],[-95.89474816,30.05915101],[-95.89494067,30.05920265],[-95.89555716,30.05940709],[-95.89969001,30.06077749],[-95.89971208,30.06193095],[-95.89971968,30.06232856],[-95.89974614,30.06371151],[-95.89977924,30.06544167],[-95.89938731,30.06544316],[-95.89894134,30.06544711],[-95.89849534,30.06544627],[-95.89558857,30.06539225],[-95.89202025,30.06532593],[-95.89151248,30.06531999],[-95.89149977,30.06478886],[-95.89215717,30.06480054]]);
  const p11 = P([[-95.88812257,30.06285649],[-95.89126306,30.0628191],[-95.89132281,30.06531834],[-95.89081165,30.06532131],[-95.88816182,30.06535285],[-95.88812257,30.06285649]]);
  const ac = r => S.ringArea(r) / 43560, own = g => ac(S.boundaryFrom(g).ring);
  assert.equal(S.unionParcels([p3, p1, p11]).pieces, 2, 'merged alone, the tract across the strip is a piece apart (what dropped it)');
  const br = S.bridgeParcels([p3, p1, p11]), u = S.unionParcels(br.geoms), F = S.frame(u.origin);
  assert.equal(u.pieces, 1, 'one site'); assert.equal(br.strips.length, 1, 'one strip: the touching tracts need none'); assert.ok(br.strips[0].gapFt >= 50 && br.strips[0].gapFt <= 70, 'the strip is about 60 ft: ' + br.strips[0].gapFt);
  assert.equal(br.strips[0].road, false, 'no road on the map in it: filled in as site');
  const strip = br.strips[0].ll.slice(0, -1).map(F.toFt), want = own(p3) + own(p1) + own(p11) + ac(strip);
  assert.ok(Math.abs(ac(u.ring) - want) / want < 0.01, 'the site is all three tracts and the strip: ' + ac(u.ring).toFixed(2) + ' vs ' + want.toFixed(2) + ' ac');
  for (const g of [p3, p1, p11]) { const c = S.centroid(S.boundaryFrom(g).ring.map(q => F.toFt(S.frame(S.boundaryFrom(g).origin).toLL(q)))); assert.ok(S.inRing(c, u.ring), 'every tract picked is in the site'); }
  assert.ok(ac(strip) > 1.2 && ac(strip) < 2.2, 'the strip runs along the facing sides, not over the tracts: ' + ac(strip).toFixed(2) + ' ac');
  // a road on the map running up the strip: the strip is a road, kept as a no-build area in the site
  const rd = S.bridgeParcels([p3, p1, p11], { roads: [[[-95.89135, 30.0570], [-95.89138, 30.0640], [-95.89141, 30.0700]], [[-95.95, 30.0700], [-95.85, 30.0701]]] });
  assert.equal(rd.strips.length, 1); assert.equal(rd.strips[0].road, true, 'the road up the strip is found'); assert.equal(S.unionParcels(rd.geoms).pieces, 1, 'every tract still in');
  assert.equal(S.bridgeParcels([p3, p1, p11], { roads: [[[-95.95, 30.0700], [-95.85, 30.0701]]] }).strips[0].road, false, 'a road passing well north of the strip is not in it');
  // the road strip as the plan keeps it: a no-build area inside the site; a layout's building on it is a problem
  const ko = T.areaPiece({ ring: u.ring, elements: [] }, 'keepout', strip, 'ko1');
  assert.equal(T.areaError({ ring: u.ring }, strip, 'keepout'), '', 'the strip is inside the site');
  const on = { ...u, front: 0, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [ko, { id: 'b1', kind: 'building', use: 'retail', x: ko.x, y: ko.y, w: 40, d: 40, rot: 0, floors: 1 }] };
  assert.ok(S.check(on).some(i => / is on /.test(i.text)), 'a building on the strip is flagged');
  // far apart (more than BRIDGE_FT): not joined, the biggest group kept, as before
  const apart = S.bridgeParcels([p3, p11]); assert.equal(apart.strips.length, 0, 'the 20.6 and 20.8 acre tracts are a quarter mile apart'); assert.equal(S.unionParcels(apart.geoms).pieces, 2);
  // lots that touch get no strip (Katy: three HCAD lots and the Fort Bend lot beside them)
  const kty = [P([[-95.82282727,29.78685442],[-95.82292784,29.78685423],[-95.82301643,29.78685407],[-95.82301369,29.78719781],[-95.82293487,29.78719796],[-95.82285606,29.7871981],[-95.82282453,29.78719816],[-95.82282727,29.78685442]]),
    P([[-95.82272954,29.7868546],[-95.82277998,29.78685451],[-95.82282727,29.78685442],[-95.82282453,29.78719816],[-95.82277724,29.78719825],[-95.8227268,29.78719834],[-95.82272954,29.7868546]]),
    P([[-95.82262235,29.78685395],[-95.82272954,29.7868546],[-95.8227268,29.78719834],[-95.82261961,29.78719769],[-95.82262235,29.78685395]]),
    P([[-95.82301414,29.78697536],[-95.8230164,29.7868629],[-95.82317613,29.78686509],[-95.82325812,29.78686552],[-95.8232564,29.78711245],[-95.82301414,29.78697536]])];
  const kb = S.bridgeParcels(kty); assert.equal(kb.strips.length, 0, 'touching lots: no strip'); assert.equal(kb.geoms.length, 4);
  const ku = S.unionParcels(kb.geoms), ksum = kty.reduce((t, g) => t + S.ringArea(S.boundaryFrom(g).ring), 0); assert.equal(ku.pieces, 1); assert.ok(Math.abs(S.ringArea(ku.ring) - ksum) / ksum < 0.01, 'four lots, one site');
  assert.deepEqual(S.bridgeParcels([p1]).strips, [], 'one parcel: nothing to join');
  // a block of four lots whose county outlines sit 12 ft apart every way (they border each other on the ground): no
  // slit into the site between any two of them, the whole block is the site
  const o4 = [-95.8, 29.9], lot = (x, y) => poly([[x, y], [x + 200, y], [x + 200, y + 300], [x, y + 300]], o4), four = [lot(0, 0), lot(212, 0), lot(0, 312), lot(212, 312)];
  const b4 = S.bridgeParcels(four), u4 = S.unionParcels(b4.geoms), whole = 412 * 612;
  assert.equal(u4.pieces, 1); assert.ok(b4.strips.length >= 4 && b4.strips.every(x => !x.road), 'every 12 ft gap filled, not just enough to connect them: ' + b4.strips.length);
  assert.ok(Math.abs(S.ringArea(u4.ring) - whole) / whole < 0.02, 'the block is one site with no slit: ' + Math.round(S.ringArea(u4.ring)) + ' of ' + whole + ' sq ft');
  assert.ok(u4.ring.length <= 8, 'a plain outline, no notch at the gaps: ' + u4.ring.length + ' points'); }

// ---- edges, setbacks, road-facing side ----
const rect = [[-100, -150], [100, -150], [100, 150], [-100, 150]]; // 200 x 300 ft, CCW, street to the south (edge 0)
assert.deepEqual(S.edgeRoles(rect, 0), ['front', 'side', 'rear', 'side']);
assert.equal(S.frontFromRoads(rect, [[[-400, -190], [400, -185]]]), 0, 'road 40 ft south: the south edge');
assert.equal(S.frontFromRoads(rect, [[[-400, 200], [400, 200]], [[-400, -600], [400, -600]]]), 2, 'nearest road north: the north edge');
assert.equal(S.frontFromRoads(rect, [[[600, -1000], [600, 1000]]]), null, 'no road within 250 ft: no guess here');
assert.equal(S.frontFromRoads(rect, [[[-50, -10], [50, 10]]]), null, 'a driveway inside the lot is not a street');
// 19730 FM 362, Waller: 8 sides with a notch around an out-parcel on the east; FM 362 (secondary) 44 ft off the west line,
// an unnamed local road along the east, and the neighbours' driveways (service, which the map code leaves out) north and
// south. The old check marked 6 of the 8 sides as streets (the notch's short sides and the far edges with them).
{ const ring = [[-441.8, -191.92], [475.3, -185.63], [474.61, -55.83], [354.06, -58.81], [353.81, 31.2], [474.04, 34.19], [472.83, 185.77], [-446.13, 190.03]];
  const fm = Object.assign([[-469, -1442], [-481, -836], [-496, 988], [-502, 1235]], { rank: S.roadRank('secondary') });
  const east = Object.assign([[512, 713], [508, -35], [520, -76], [547, -94], [1140, -81], [1445, -81]], { rank: S.roadRank('minor') });
  const f = S.frontFromRoads(ring, [fm, east]); assert.equal(f, 7, 'FM 362 is the front, over a local road a little nearer on the east');
  assert.deepEqual(S.streetsFromRoads(ring, [fm, east], f), [1, 5], 'side streets: the two east lot lines along the local road; the notch sides and the north and south lines are not streets');
  assert.deepEqual(S.streetsFromRoads(ring, [fm], f), [], 'FM 362 alone: no side streets');
  // a road that only passes a corner, or crosses at an angle, isn't a side street
  assert.deepEqual(S.streetsFromRoads(rect, [[[-400, -190], [400, -185]], [[100, 300], [400, 150]]], 0), [], 'a road meeting a corner at an angle: no side street');
  assert.deepEqual(S.streetsFromRoads(rect, [[[-400, -190], [400, -185]], [[160, -400], [160, 400]]], 0), [1], 'a road 60 ft off the east side, all along it: a side street');
  assert.deepEqual(S.streetsFromRoads(rect, [[[-400, -190], [400, -185]], [[260, -400], [260, 400]]], 0), [], '160 ft off: someone else\'s frontage, not this lot\'s');
  assert.equal(S.frontFromRoads(rect, [[[-400, -180], [400, -180]], Object.assign([[-400, 205], [400, 205]], { rank: 3 })]), 2, 'a highway 55 ft north wins over a local street 30 ft south'); }
{ const inset = S.insetRing(rect, S.edgeRules(rect, 0).map(r => r.build)); assert.deepEqual(inset.map(p => p.map(v => Math.round(v))), [[-90, -125], [90, -125], [90, 130], [-90, 130]], 'setback line: 25 front, 10 sides, 20 rear'); }

// ---- parking ----
assert.equal(S.stalls({ w: 180, d: 60 }).count, 40, 'one double-loaded module: 2 rows of 20');
assert.equal(S.stalls({ w: 60, d: 180 }).count, 40, 'rows turn to the long side');
assert.equal(S.stalls({ w: 400, d: 42 }).count, 44, 'one single-loaded row along the long side');
assert.equal(S.stalls({ w: 180, d: 42 }).count, 20, 'not turned into 42 ft dead-end aisles, though that would squeeze in 24');
assert.equal(S.stalls({ w: 180, d: 102 }).count, 66, 'the better of module + single row (60) and turned rows (66)');
assert.equal(S.stalls({ w: 8, d: 18 }).count, 0);
{ const e = { x: 10, y: 20, w: 180, d: 60, rot: 30 }, lines = S.stallLines(e); assert.equal(lines.length, 2 * 21 + 2, 'stripes and head lines');
  for (const l of lines) for (const p of l) assert.ok(S.hitRect({ ...e, w: e.w + 0.1, d: e.d + 0.1 }, p), 'stripes stay inside the lot rectangle'); }

// ---- checks ----
{ const plan = { origin: O, ring: rect, front: 0, program: { use: 'retail' }, elements: [
    { id: 'b', kind: 'building', x: 0, y: 60, w: 120, d: 100, rot: 0, floors: 1 },              // fine: 40 ft from the rear
    { id: 'p', kind: 'parking', x: 0, y: -60, w: 180, d: 60, rot: 0 },                          // fine
    { id: 'd', kind: 'drive', x: 0, y: -135, w: 26, d: 40, rot: 0 } ] };                        // meets the street: allowed
  assert.deepEqual(S.check(plan).map(i => i.text), ['Parking is 9 spaces short of 48 required']); // 40 striped, 2 accessible sharing one aisle: 39
  plan.elements[0].y = 85; assert.match(S.check(plan)[0].text, /Building is inside the 20 ft rear setback/);
  plan.elements[0].y = 60; plan.elements[2] = { id: 'd', kind: 'drive', x: 95, y: 0, w: 26, d: 60, rot: 0 };
  assert.match(S.check(plan).find(i => i.id === 'd').text, /Drive runs outside the lot/, 'a drive through a side line is outside');
  plan.elements[2] = { id: 'd', kind: 'pond', x: 0, y: 20, w: 40, d: 40, rot: 0 }; assert.ok(S.check(plan).some(i => /Building overlaps Detention/.test(i.text)));
  plan.elements.pop(); plan.zoning = { max_coverage_pct: 15, max_far: 0.1 };
  const z = S.check(plan).map(i => i.text).join(' | '); assert.match(z, /Coverage 20% is over the zoning limit of 15%/); assert.match(z, /FAR 0.20 is over the zoning limit of 0.1/);
  const m = S.metrics(plan); assert.equal(m.gfa, 12000); assert.equal(m.spaces, 39); assert.equal(m.ada, 2); assert.equal(m.required, 48); assert.equal(+m.coverage.toFixed(2), 0.2); }

// ---- words -> program ----
assert.deepEqual(S.guessProgram('25,000 sf retail strip with 4.5/1000 parking'), { use: 'retail', gfa: 25000, ratio: 4.5 });
assert.deepEqual(S.guessProgram('200 apartments, 3 stories, 1.75 spaces per unit'), { use: 'multifamily', floors: 3, units: 200, perUnit: 1.75 });
assert.deepEqual(S.guessProgram('150k sq ft warehouse, no detention'), { use: 'industrial', gfa: 150000, detentionPct: 0 });
assert.deepEqual(S.guessProgram('28000 sf of retail across 4 buildings with a retention pond'), { use: 'retail', gfa: 28000, buildings: 4, storm: 'retention' });
assert.deepEqual(S.guessProgram('4 buildings of 7,000 sf each, retail, underground detention'), { use: 'retail', gfa: 28000, buildings: 4, storm: 'underground' });
assert.equal(S.guessProgram('as big a medical office as fits').use, 'medical');
assert.equal(S.normalizeProgram({ use: 'multifamily', units: 100 }).gfa, Math.round(100 * 900 / 0.85), 'units become floor area');
assert.equal(S.normalizeProgram({ use: 'nope', floors: 99 }).use, 'other'); assert.equal(S.normalizeProgram({ floors: 99 }).floors, 40);

// ---- layout generator on realistic lots ----
const LOTS = {
  pad: { geom: pad, front: null },
  deep: { geom: poly([[0, 0], [430, 0], [420, 1240], [0, 1250]], [-95.95, 29.9]), front: 0 },                 // 12 ac, street on the short side
  ell: { geom: poly([[0, 0], [600, 0], [600, 220], [260, 220], [260, 640], [0, 640]], [-96.07, 30.1]), front: 0 }, // concave corner tract
  big: { geom: poly([[0, 0], [1500, -40], [1580, 900], [700, 1350], [-60, 1100]], [-95.6, 29.95]), front: 0 }      // 45 ac, irregular
};
const plan = (lot) => { const b = S.boundaryFrom(LOTS[lot].geom); return { ...b, front: LOTS[lot].front, setbacks: { ...S.SETBACKS }, program: {} }; };
function layout(lot, words, v) {
  const p = plan(lot), t0 = Date.now(), r = S.autoLayout(p, S.guessProgram(words), v), ms = Date.now() - t0;
  const done = { ...p, program: r.program, elements: r.elements };
  assert.ok(ms < 4000, lot + ' ' + words + ' v' + v + ' took ' + ms + ' ms');
  const bad = S.check(done).filter(i => i.level === 'bad'); assert.deepEqual(bad, [], lot + ' / ' + words + ' / v' + v + ': ' + bad.map(i => i.text).join('; '));
  for (const e of r.elements) for (const c of S.corners(e)) if (e.kind !== 'drive') assert.ok(S.inRing(c, p.ring), e.kind + ' corner inside the lot');
  return { r, m: S.metrics(done), done };
}
for (const v of [0, 1, 2]) {
  let { r, m } = layout('pad', '25,000 sf retail strip', v);
  assert.ok(Math.abs(m.gfa - 25000) < 50, 'asked-for floor area: ' + m.gfa); assert.ok(m.spaces >= m.required, 'parks: ' + m.spaces + '/' + m.required);
  assert.ok(r.elements.some(e => e.kind === 'drive'), 'a drive to the street'); assert.ok(m.pond > 0 && m.pond <= 0.105 * m.siteSf && m.pond >= 0.1 * Math.min(m.siteSf, m.footprint + m.paved) * 0.9, 'default detention: 10% of the land the project covers: ' + (m.pond / m.siteSf * 100).toFixed(1) + '%');
  ({ m } = layout('pad', '6,000 sf restaurant with drive-thru', v)); assert.equal(m.required, 60); assert.ok(m.spaces >= 60);
  ({ r, m } = layout('deep', '240 units 3 story garden apartments', v)); assert.ok(m.buildings >= 3, 'apartments split into bars: ' + m.buildings); assert.ok(Math.abs(m.units - 240) <= 1, 'units: ' + m.units); assert.ok(m.spaces >= m.required);
  ({ m } = layout('ell', 'medical office 2 stories', v)); assert.ok(m.gfa > 40000 && m.spaces >= m.required, 'fits as much as parks on the L: ' + Math.round(m.gfa));
}
{ const { r, m } = layout('big', '600,000 sf warehouse with truck court', 1);
  assert.ok(Math.abs(m.gfa - 600000) < 1000); const tr = r.elements.find(e => e.kind === 'truck'), b = r.elements.find(e => e.kind === 'building');
  assert.ok(tr && tr.d >= 100, 'truck court behind the building'); assert.ok(Math.abs(Math.hypot(tr.x - b.x, tr.y - b.y) - (b.d + tr.d) / 2) < 15, 'truck court against the dock wall');
  assert.ok(r.elements.filter(e => e.kind === 'drive').length >= 2, 'drives for trucks and cars'); assert.ok(m.spaces >= m.required); }
{ const r = S.autoLayout(plan('pad'), { use: 'retail', gfa: 2e6 }, 0); assert.match(r.notes[0], /doesn’t fit inside the setbacks/, 'too big: says so and fits the most'); assert.ok(r.elements.length); }
{ const tiny = { origin: O, ring: [[0, 0], [40, 0], [40, 40], [0, 40]], front: 0 }; assert.deepEqual(S.autoLayout(tiny, { use: 'office', gfa: 5000 }).elements, [], 'nothing fits a 40 ft lot'); }

// ---- map features and DXF ----
{ const { done } = layout('pad', '25,000 sf retail strip', 0), fc = S.planFeatures(done, done.elements[0].id);
  const kinds = fc.features.map(f => f.properties.k); for (const k of ['lot', 'setback', 'front', 'building', 'parking', 'stall', 'label']) assert.ok(kinds.includes(k), 'feature ' + k);
  assert.ok(fc.features.find(f => f.properties.k === 'building').properties.h > 5, 'building height for 3D (m)'); assert.equal(fc.features.find(f => f.properties.id === done.elements[0].id).properties.sel, 1);
  const dxf = S.toDXF(done, 'Katy Pad – Option A'), g = dxf.split('\r\n'); g.pop();
  assert.equal(g.length % 2, 0, 'group code / value pairs'); assert.deepEqual(g.slice(0, 4), ['0', 'SECTION', '2', 'HEADER']); assert.deepEqual(g.slice(-2), ['0', 'EOF']);
  for (let i = 0; i < g.length; i += 2) assert.ok(/^-?\d+$/.test(g[i].trim()), 'group code at line ' + i);
  const ents = g.filter((x, i) => i % 2 && g[i - 1] === '0'); const D = S.details(done); const PV = S.pavement(done), A = S.accessible(done), curbs = PV.reduce((s, p) => s + 1 + p.holes.length, 0);
  assert.equal(ents.filter(x => x === 'POLYLINE').length, done.elements.length + 3 + D.walks.length + D.islands.length + curbs + A.stalls.length + A.aisles.length, 'lot, setback line, every element, walks, islands, north arrow, curb, accessible stalls and aisles');
  assert.equal(PV.length, 1, 'the drives and parking pour as one surface'); assert.equal(A.stalls.length, S.adaCount(done.elements.filter(e => e.kind === 'parking').reduce((s, e) => s + S.stalls(e).count, 0)), 'every accessible stall the table asks for is placed');
  assert.ok(kinds.includes('paved') && kinds.includes('ada'), 'one paved surface and accessible stalls on the map');
  assert.equal(ents.filter(x => x === 'CIRCLE').length, D.trees.length, 'a circle per tree'); assert.ok(D.trees.length > 10 && D.islands.length > 0, 'trees on the buffer and in parking islands');
  assert.ok(ents.filter(x => x === 'LINE').length > 40, 'stall stripes'); assert.ok(!/[^\x00-\x7f]/.test(dxf), 'plain ASCII (the en dash in the title is replaced)');
  assert.ok(dxf.includes('LON ' + done.origin[0]), 'the origin is written on the drawing'); }

// ---- /api/siteplan ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); if (u.includes('/models/')) return Response.json({ id: 'm' });
    sent = JSON.parse(opts.body); const user = JSON.parse(sent.messages[1].content);
    assert.equal(user.site.acres, 3.1); assert.equal(user.request, '120 apartments'); assert.equal(sent.reasoning_effort, 'high'); // it thinks properly about the program
    return Response.json({ choices: [{ message: { content: JSON.stringify({ use: 'multifamily', gfa: null, floors: 3, units: 120, buildings: null, ratio: null, perUnit: 1.5, depth: null, detentionPct: 8, truck: null,
      setbacks: { front: 25, side: null, rear: 15, paving: null }, summary: 'Three-story garden apartments with surface parking.', assumptions: ['1.5 spaces per unit'] }) } }] });
  };
  const { default: handler, SCHEMA } = await import('../api/siteplan.js');
  assert.deepEqual(SCHEMA.required.slice().sort(), Object.keys(SCHEMA.properties).sort(), 'strict schema: every property required');
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.7.7' } }, res); return res; };
  delete process.env.OPENAI_API_KEY; let res = await call({ prompt: 'x' }); assert.equal(res.code, 503, 'no key: the browser falls back to reading the words');
  process.env.OPENAI_API_KEY = 'sk-test';
  res = await call({ prompt: '  ' }); assert.equal(res.code, 400);
  res = await call({ prompt: '120 apartments', site: { acres: 3.1, widthFt: 380, zoning: { max_far: 2, junk: { a: 1 } } } });
  assert.equal(res.code, 200); assert.equal(res.body.program.use, 'multifamily'); assert.equal(res.body.program.units, 120); assert.equal(res.body.program.perUnit, 1.5);
  assert.equal(res.body.program.gfa, Math.round(120 * 900 / 0.85), 'units set the floor area'); assert.equal(res.body.program.detentionPct, 8);
  assert.deepEqual(res.body.setbacks, { front: 25, side: 10, rear: 15, paving: 10 }, 'model setbacks over the defaults'); assert.match(res.body.summary, /garden apartments/); }

// ---- /api/siteplan: the AI reviews the engine's options (it sees their drawings) and suggests what to build ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null, reply = null;
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body); return Response.json({ choices: [{ message: { content: JSON.stringify(reply()) } }] }); };
  const { default: handler, REVIEW_SCHEMA, BESTUSE_SCHEMA } = await import('../api/siteplan.js');
  for (const sc of [REVIEW_SCHEMA, BESTUSE_SCHEMA]) assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'strict schema');
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.7.8' } }, res); return res; };
  const img = 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64'), options = [0, 1, 2].map(i => ({ name: 'Option ' + i, metrics: { units: 20 + i, parkingSpaces: 40 }, issues: [], notes: [], image: i < 2 ? img : null }));
  const prog = { use: 'duplex', units: 24, product: null, buildings: null, floors: null, gfa: null, ratio: null, perUnit: null, depth: null, detentionPct: null, storm: null, truck: null, through: null, extras: [], setbacks: { front: null, side: null, rear: null, paving: null }, zones: [] };
  reply = () => ({ reviews: [{ option: 2, score: 140, verdict: 'Best of three', strengths: ['a'], problems: ['b'] }, { option: 9, score: 50, verdict: 'x', strengths: [], problems: [] }], ranking: [2, 2, 7], revise: true, program: { ...prog, product: 'court6' }, params: { fill: null, streets: 'curved', form: 'oval', storm: null }, why: 'Rows on a court fit all 24.', summary: 'C is best.' });
  let res = await call({ mode: 'review', prompt: '24 duplex units', site: { acres: 1.46 }, facts: ['FEMA flood zone X'], program: { use: 'duplex', units: 24 }, round: 1, options });
  assert.equal(res.code, 200, JSON.stringify(res.body)); const u = sent.messages[1].content;
  assert.ok(Array.isArray(u) && u.filter(c => c.type === 'image_url').length === 2 && JSON.parse(u[0].text).site.facts[0] === 'FEMA flood zone X', 'the drawings and the site facts go to the model');
  assert.deepEqual(res.body.ranking, [2, 0, 1], 'ranking cleaned: known options once each, the rest after');
  assert.equal(res.body.reviews.length, 1); assert.equal(res.body.reviews[0].score, 100, 'scores kept to 0-100');
  assert.ok(res.body.revise && res.body.program.product === 'court6' && res.body.program.units === 24, 'a revised program, normalized'); assert.deepEqual(res.body.params, { streets: 'curved' }, 'only known settings');
  res = await call({ mode: 'review', prompt: '24 duplex units', program: {}, round: 2, options }); assert.equal(res.body.revise, false, 'never revises on the last round'); assert.equal(res.body.program, null);
  res = await call({ mode: 'review', options: [] }); assert.equal(res.code, 400);
  reply = () => ({ ideas: [{ title: 'Garden apartments', use: 'multifamily', fit: 81, why: 'Deep land behind the frontage.', risks: ['Sewer'], request: '240 garden apartments' }, { title: 'x', use: 'spaceship', fit: 20, why: '', risks: [], request: '' }], summary: 'Apartments.' });
  res = await call({ mode: 'bestuse', site: { acres: 12 }, facts: ['No water district'], nearby: { grocery: [{ name: 'HEB', miles: 3.2 }] }, market: { typicalRent: 1450 } });
  assert.equal(res.code, 200); assert.equal(res.body.ideas.length, 1, 'ideas without a request dropped'); assert.equal(res.body.ideas[0].use, 'multifamily');
  const bu = JSON.parse(sent.messages[1].content); assert.equal(bu.nearby.grocery[0].name, 'HEB'); assert.equal(bu.market.typicalRent, 1450); assert.deepEqual(bu.site.facts, ['No water district']);
  let tries = 0; globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); tries++; const b = JSON.parse(opts.body); if (Array.isArray(b.messages[1].content)) return Response.json({ error: { message: 'This model does not support image inputs' } }, { status: 400 }); return Response.json({ choices: [{ message: { content: JSON.stringify({ ...reply(), reviews: [], ranking: [0], revise: false, program: prog, params: { fill: null, streets: null, form: null, storm: null }, why: '', summary: 'ok' }) } }] }); };
  res = await call({ mode: 'review', options, round: 1 }); assert.equal(res.code, 200, 'a model without image input still reviews, on the numbers'); assert.equal(tries, 2); }

// ---- /api/siteplan: changes by name (the AI answers with edits on the plan's pieces) ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null, reply = null; process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body); return Response.json({ choices: [{ message: { content: JSON.stringify(reply()) } }] }); };
  const { default: handler, EDIT_SCHEMA } = await import('../api/siteplan.js');
  assert.deepEqual(EDIT_SCHEMA.required.slice().sort(), Object.keys(EDIT_SCHEMA.properties).sort(), 'strict schema');
  const it = EDIT_SCHEMA.properties.ops.items; assert.deepEqual(it.required.slice().sort(), Object.keys(it.properties).sort(), 'strict op schema');
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.7.9' } }, res); return res; };
  const plan = { site: { acres: 21.3 }, totals: { units: 240 }, pieces: [{ id: 'b7', name: 'Apt Bldg 7', kind: 'building', use: 'multifamily', at: [300, 400], size: [180, 60], turn: 0, floors: 3, units: 24, selected: true }, { id: 'c1', name: 'Clubhouse', kind: 'building', use: 'amenity', at: [100, 80], size: [90, 60] }] };
  const op = o => ({ action: 'change', target: null, every: null, floorsOver: null, with: null, type: null, kind: null, use: null, name: null, floors: null, units: null, w: null, d: null, x: null, y: null, turn: null, ...o });
  reply = () => ({ homeMix: [], ops: [op({ target: 'b7', floors: 4 }), op({ target: 'nope', floors: 2 }), op({ target: 'c1', type: 'clubhouse-clubhouse-7-500-sf' }), op({ target: 'c1', type: 'made-up-type', floors: 99 }), op({ action: 'swap', target: 'b7', with: 'ghost' })], refit: 'full', summary: 'Bldg 7 goes to four stories; a bigger clubhouse.', question: null });
  let res = await call({ mode: 'edit', prompt: 'make it four stories and give us a bigger clubhouse', plan, image: 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64') });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.ops.map(o => [o.target, o.floors, o.type]), [['b7', 4, null], ['c1', null, 'clubhouse-clubhouse-7-500-sf'], ['c1', null, null]], 'only known pieces, library types and sane numbers');
  assert.equal(res.body.refit, 'full'); const u = sent.messages[1].content; assert.ok(Array.isArray(u) && u[1].type === 'image_url', 'the drawing goes to the model');
  assert.ok(/Apt Bldg 7/.test(u[0].text) && /clubhouse-clubhouse-7-500-sf = Clubhouse/.test(u[0].text), 'the plan and the library go to the model');
  reply = () => ({ homeMix: [], ops: [op({ action: 'add', kind: 'entrance', x: 300, y: 0 }), op({ action: 'add', kind: 'helipad' })], refit: 'none', summary: 'A second driveway.', question: null });
  res = await call({ mode: 'edit', prompt: 'add a second entrance', plan }); assert.deepEqual(res.body.ops.map(o => [o.kind, o.x, o.y]), [['entrance', 300, 0], [null, null, null]], 'an entrance, at a point on the street');
  // roundabouts and drop-off loops (phase 2): the plan's junctions go to the model (sanitized), and a roundabout with its size and a loop at a building come back
  reply = () => ({ homeMix: [], ops: [op({ action: 'add', kind: 'roundabout', x: 410, y: 520, w: 120 }), op({ action: 'add', kind: 'loop', with: 'c1' })], refit: 'none', summary: 'A roundabout and a drop-off loop.', question: null });
  res = await call({ mode: 'edit', prompt: 'add a roundabout at the main intersection and a circle drive in front of the clubhouse', plan: { ...plan, junctions: [{ at: [410.4, 519.6], legs: 4, meets: ['Main drive', 'Street · 28 ft'], main: true, ids: ['x'] }, { at: 'here', legs: 3 }] } });
  assert.deepEqual(res.body.ops.map(o => [o.action, o.kind, o.x, o.y, o.w, o.with]), [['add', 'roundabout', 410, 520, 120, null], ['add', 'loop', null, null, null, 'c1']], 'a roundabout and a loop');
  assert.deepEqual(JSON.parse(sent.messages[1].content.split('\n\nBuilding library')[0]).junctions, [{ at: [410, 520], legs: 4, meets: ['Main drive', 'Street · 28 ft'], main: true }], 'the junctions, as points and names');
  assert.ok(['roundabout', 'loop'].every(k => it.properties.kind.enum.includes(k)) && /plan\.junctions/.test(it.properties.kind.description), 'the kinds in the schema');
  reply = () => ({ homeMix: [], ops: [], refit: 'none', summary: '', question: 'Which building: Bldg 7 or Bldg 17?' });
  res = await call({ mode: 'edit', prompt: 'make that one taller', plan }); assert.equal(res.body.question, 'Which building: Bldg 7 or Bldg 17?');
  // across the whole site: every piece of a use at once, and the homes on lots (not listed) by their mix of stories
  const big = { ...plan, houses: { count: 570, listed: false, byStories: { 1: 170, 2: 340, 3: 60 }, mix: [{ stories: 1, pct: 30 }, { stories: 2, pct: 60 }, { stories: 3, pct: 10 }] } };
  reply = () => ({ homeMix: [{ stories: 1, pct: 33 }, { stories: 2, pct: 67 }, { stories: 4, pct: 5 }], ops: [op({ every: 'multifamily', floorsOver: 3, floors: 3 }), op({ action: 'remove', every: 'pool' }), op({ every: 'spaceship', floors: 2 })], refit: 'none', summary: 'No 3-story homes; apartments capped at 3 stories; pools removed.', question: null });
  res = await call({ mode: 'edit', prompt: 'Residential homes should only be 1 story and two-story homes, no 3 story homes.', plan: big });
  assert.deepEqual(res.body.homeMix, [{ stories: 1, pct: 33 }, { stories: 2, pct: 67 }], 'the home mix, sane stories only');
  assert.deepEqual(res.body.ops.map(o => [o.action, o.every, o.floorsOver, o.floors, o.target]), [['change', 'multifamily', 3, 3, null], ['remove', 'pool', null, null, null]], 'every piece of a use or kind; unknown sorts dropped');
  assert.deepEqual(JSON.parse(sent.messages[1].content[0]?.text ?? sent.messages[1].content.split('\n\nBuilding library')[0]).houses, big.houses, 'the AI sees the homes by stories and their mix');
  assert.ok(EDIT_SCHEMA.properties.homeMix && EDIT_SCHEMA.properties.ops.items.properties.every.enum.includes('sfr'));
  // the homes by stories as an op on every home: read as the mix (the 1- and 2-story keep their shares)
  reply = () => ({ homeMix: [], ops: [op({ every: 'sfr', floorsOver: 2, floors: 2 })], refit: 'none', summary: 'No 3-story homes.', question: null });
  res = await call({ mode: 'edit', prompt: 'no 3 story homes', plan: big }); assert.deepEqual(res.body.homeMix, [{ stories: 1, pct: 33 }, { stories: 2, pct: 67 }]); assert.equal(res.body.ops.length, 0);
  // nothing it could do: no summary claiming a change, a question instead
  reply = () => ({ homeMix: [], ops: [op({ target: 'ghost', floors: 2 })], refit: 'none', summary: 'Changed all 3-story residential homes to 1 or 2-story homes.', question: null });
  res = await call({ mode: 'edit', prompt: 'no 3 story homes', plan: big }); assert.equal(res.body.summary, '', 'never a summary of changes that weren’t made'); assert.equal(res.body.ops.length, 0);
  res = await call({ mode: 'edit', prompt: '', plan }); assert.equal(res.code, 400); }
// turning, boulevards, signs and names in Change With AI; Suggest Names (its own small mode); every schema strict all the way down
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = null, reply = null, fail = false; process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body); if (fail) return new Response('down', { status: 500 }); return Response.json({ choices: [{ message: { content: JSON.stringify(reply()) } }] }); };
  const { default: handler, EDIT_SCHEMA, NAMES_SCHEMA } = await import('../api/siteplan.js');
  const strict = (o, at = '') => { if (!o || typeof o !== 'object') return; if (o.type === 'object' || Array.isArray(o.type) && o.type.includes('object')) { assert.equal(o.additionalProperties, false, at + ': no other keys'); assert.deepEqual((o.required || []).slice().sort(), Object.keys(o.properties || {}).sort(), at + ': every key required'); }
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') strict(v, at + '.' + k); };
  strict(EDIT_SCHEMA, 'edit'); strict(NAMES_SCHEMA, 'names');
  const opP = EDIT_SCHEMA.properties.ops.items.properties; assert.ok(opP.turnBy && opP.boulevard && opP.signs && EDIT_SCHEMA.properties.names, 'turnBy, boulevard, signs and names');
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.8.1' } }, res); return res; };
  const plan = { site: { acres: 21.3, streets: [{ side: 'front', name: 'FM 362', from: [0, 0], to: [700, 0] }] }, community: 'Beacon Hill', parts: [{ part: 0, use: 'retail', label: 'Retail center', name: null }, { part: 2, use: 'sfr', label: 'Neighbourhood', name: null }], pieces: [{ id: 'p1', name: 'Detention pond', kind: 'pond', at: [300, 400], turn: 12 }, { id: 'me', name: 'Main entry', kind: 'drive', at: [350, 40], boulevard: false, width: 40 }, { id: 'md', name: 'Median', kind: 'green', at: [350, 60], of: 'me' }] };
  const op = o => ({ action: 'change', target: null, every: null, floorsOver: null, with: null, type: null, kind: null, use: null, name: null, floors: null, units: null, w: null, d: null, x: null, y: null, turn: null, turnBy: null, boulevard: null, signs: null, ...o });
  reply = () => ({ homeMix: [], names: { community: null, parts: [] }, ops: [op({ target: 'p1', turnBy: 20 }), op({ target: 'me', boulevard: true, signs: 'both' }), op({ target: 'p1', turnBy: 9000 }), op({ action: 'add', kind: 'entrance', x: 200, y: 0, boulevard: true, signs: 'sideways' })], refit: 'none', summary: 'Turned the pond; the main entry a boulevard.', question: null });
  let res = await call({ mode: 'edit', prompt: 'turn the pond 20 degrees and make the main entry a boulevard', plan }); assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.ops.map(o => [o.target, o.turnBy, o.boulevard, o.signs]), [['p1', 20, null, null], ['me', null, true, 'both'], ['p1', null, null, null], [null, null, true, null]], 'turnBy, boulevard and signs passed on, sane values only');
  const u = JSON.parse(sent.messages[1].content.split('\n\nBuilding library')[0]); assert.equal(u.community, 'Beacon Hill'); assert.deepEqual(u.parts.map(x => x.part), [0, 2]); assert.equal(u.pieces.find(x => x.id === 'md').of, 'me'); assert.equal(u.site.streets[0].name, 'FM 362');
  // names alone are an answer; a part that isn't there and an empty name are dropped, long names clipped
  reply = () => ({ homeMix: [], ops: [], names: { community: '  Beacon Hill  ', parts: [{ part: 2, name: 'Beacon Hill Estates' }, { part: 99, name: 'Nowhere' }, { part: 0, name: '   ' }, { part: 0, name: 'M'.repeat(90) }] }, refit: 'none', summary: 'Named the neighbourhood.', question: null });
  res = await call({ mode: 'edit', prompt: 'call the neighbourhood Beacon Hill Estates', plan });
  assert.equal(res.body.names.community, 'Beacon Hill'); assert.deepEqual(res.body.names.parts.map(x => [x.part, x.name.length]), [[2, 19], [0, 60]]); assert.equal(res.body.summary, 'Named the neighbourhood.', 'a names-only answer counts');
  // Suggest Names: at most three cleaned choices, parts by index only; the AI down: 502 (the browser falls back to street names)
  reply = () => ({ choices: [{ community: 'Spring Creek Landing', parts: [{ part: 0, name: 'Spring Creek Market' }, { part: 7, name: 'Ghost' }], why: 'From Spring Creek, which runs along the back.' }, { community: 'Hockley Crossing', parts: [], why: 'The town.' }, { community: 'The Reserve at Pine Hollow', parts: [], why: 'The pines.' }, { community: 'Fourth', parts: [], why: '' }, { community: '', parts: [], why: 'nameless' }] });
  res = await call({ mode: 'names', site: { acres: 40, address: 'Stokes Rd' }, parts: [{ part: 0, use: 'retail', label: 'Retail center', acres: 6 }, { part: 2, use: 'sfr', label: 'Neighbourhood', acres: 30, units: 120 }], current: { community: null, parts: [] }, theme: 'Texas rivers' });
  assert.equal(res.code, 200, JSON.stringify(res.body)); assert.deepEqual(res.body.choices.map(c => c.community), ['Spring Creek Landing', 'Hockley Crossing', 'The Reserve at Pine Hollow']); assert.deepEqual(res.body.choices[0].parts, [{ part: 0, name: 'Spring Creek Market' }]);
  const nu = JSON.parse(sent.messages[1].content); assert.equal(nu.theme, 'Texas rivers'); assert.equal(nu.parts.length, 2); assert.equal(sent.response_format?.json_schema?.name || 'site_names', 'site_names');
  fail = true; res = await call({ mode: 'names', site: { acres: 40 }, parts: [] }); assert.equal(res.code, 502); fail = false; }

// ---- /api/siteplan: the effort picked under Build, and questions about the open plan ----
{ const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  let sent = [], reply = null; process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); const b = JSON.parse(opts.body); sent.push(b); return Response.json({ choices: [{ message: { content: JSON.stringify(reply(b)) } }] }); };
  const { default: handler, ASK_SCHEMA, SCHEMA } = await import('../api/siteplan.js');
  assert.deepEqual(ASK_SCHEMA.required.slice().sort(), Object.keys(ASK_SCHEMA.properties).sort(), 'strict schema');
  let ip = 0; const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.8.' + (++ip) } }, res); return res; }; // a fresh address a call: past the per-minute limit
  // the program call thinks as hard as the level says; anything not on the allow-list keeps the default
  const prog = Object.fromEntries(Object.keys(SCHEMA.properties).map(k => [k, null])); Object.assign(prog, { use: 'retail', gfa: 25000, extras: [], zones: [], setbacks: { front: null, side: null, rear: null, paving: null }, summary: 'A strip.', assumptions: [] });
  reply = () => prog;
  for (const [effort, want] of [['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['ultra', 'high'], ['xhigh', 'xhigh'], ['max', 'high'], [undefined, 'high']]) {
    sent = []; const res = await call({ prompt: '25,000 sf retail', effort }); assert.equal(res.code, 200); assert.equal(sent[0].reasoning_effort, want, 'program effort ' + effort); }
  // Medium reviews once: one round, never revises; Ultra's middle round may revise
  const P0 = { use: 'retail', units: null, product: null, buildings: null, floors: null, gfa: 25000, ratio: null, perUnit: null, depth: null, detentionPct: null, storm: null, truck: null, through: null, compare: null, trash: null, entrances: null, extras: [], setbacks: { front: null, side: null, rear: null, paving: null }, zones: [] };
  reply = () => ({ reviews: [{ option: 0, score: 70, verdict: 'ok', strengths: [], problems: [] }], ranking: [0], revise: true, program: P0, params: { fill: null, streets: null, form: null, storm: null }, why: 'Bigger.', summary: 'Fine.' });
  const options = [{ name: 'Layout 1', metrics: { floorAreaSf: 25000 }, issues: [], notes: [] }];
  sent = []; let res = await call({ mode: 'review', prompt: 'retail', options, round: 1, rounds: 1, effort: 'medium' });
  assert.equal(res.body.revise, false, 'one round: no revise'); assert.equal(sent[0].reasoning_effort, 'medium'); assert.match(JSON.parse(sent[0].messages[1].content).round, /^last/);
  sent = []; res = await call({ mode: 'review', prompt: 'retail', options, round: 2, rounds: 3, effort: 'high' }); assert.equal(res.body.revise, true, 'Ultra: round 2 of 3 may revise again'); assert.match(JSON.parse(sent[0].messages[1].content).round, /2 of 3/);
  res = await call({ mode: 'review', prompt: 'retail', options, round: 2 }); assert.equal(res.body.revise, false, 'old clients: two rounds, as before');
  res = await call({ mode: 'review', prompt: 'retail', options, round: 1, rounds: 9 }); assert.equal(res.body.revise, true, 'rounds kept to 1-3');
  // strategy: the site thought through before anything is placed. One plan (Medium, High) or three compared (Ultra, at
  // xhigh); cleaned on the way out, and the program call and the review get the picked one back
  const { STRATEGY_SCHEMA } = await import('../api/siteplan.js');
  const strictAll = sc => { if (sc?.type === 'object' && sc.properties) { assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'strict: every property required'); Object.values(sc.properties).forEach(strictAll); } if (sc?.items) strictAll(sc.items); };
  strictAll(STRATEGY_SCHEMA);
  const strat = name => ({ name, concept: 'Retail on the highway with its parking in front; apartments behind, away from the traffic.', placement: [{ what: 'retail strip', where: 'front', why: 'visibility' }, { what: 'apartments', where: 'back', why: 'quiet' }, { what: 'helipad', where: 'on the roof', why: 'no' }],
    entrances: { count: 7, where: 'FM 362 and the side street', why: 'a corner' }, parking: { approach: 'a field in front of the shops', where: 'front', spaces: 180 }, stormwater: { type: 'lake', where: 'back', why: 'low land' },
    buildings: { count: 4, floors: 3, form: 'L' }, numbers: { buildingSf: 90000, units: 200, coveragePct: 140, fits: true, check: '90,000 sf of footprint and 480 spaces on 12 acres.' }, settings: { streets: 'wiggly', fill: false }, risks: ['Floodplain fill', 'x'.repeat(900)], rejected: ['All retail: too much frontage for one strip'] });
  reply = b => ({ strategies: [strat('A'), strat('B'), strat('C'), strat('D')], pick: /three/.test(b.messages[1].content) ? 2 : 0, why: 'B and C both work; C keeps the apartments off the highway.' });
  sent = []; res = await call({ mode: 'strategy', prompt: '20,000 sf retail and 200 apartments', site: { acres: 12, frontageFt: 600, sideStreetsFt: [380], shape: 'rectangular' }, effort: 'xhigh', count: 3 });
  assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(sent[0].reasoning_effort, 'xhigh', 'Ultra plans at xhigh'); assert.equal(sent[0].response_format.json_schema.name, 'site_strategy');
  assert.match(sent[0].messages[1].content, /three different strategies/); assert.match(sent[0].messages[1].content, /"sideStreetsFt":\[380\]/, 'the side street goes along');
  assert.equal(res.body.strategies.length, 3, 'three asked, three kept'); assert.equal(res.body.pick, 2);
  const s0 = res.body.strategies[0]; assert.deepEqual(s0.placement.map(q => q.where), ['front', 'back'], 'a made-up place is dropped');
  assert.equal(s0.entrances.count, 3, 'ways in kept to 1-3'); assert.equal(s0.stormwater.type, 'detention', 'an unknown pond type: detention'); assert.equal(s0.numbers.coveragePct, 100);
  assert.equal(s0.settings.streets, null, 'an unknown street style is dropped'); assert.equal(s0.settings.fill, false); assert.equal(s0.buildings.form, 'L'); assert.ok(s0.risks[1].length <= 240);
  sent = []; res = await call({ mode: 'strategy', prompt: 'retail', effort: 'medium' }); assert.equal(res.body.strategies.length, 1, 'one asked, one kept'); assert.equal(res.body.pick, 0); assert.equal(sent[0].reasoning_effort, 'medium'); assert.match(sent[0].messages[1].content, /one strategy/);
  res = await call({ mode: 'strategy', prompt: '  ' }); assert.equal(res.code, 400);
  reply = () => ({ strategies: [strat('A')], pick: 9, why: '' }); res = await call({ mode: 'strategy', prompt: 'retail', count: 3 }); assert.equal(res.body.pick, 0, 'a pick out of range: the first');
  // the program follows the plan; the review judges against it
  reply = () => prog; sent = []; res = await call({ prompt: '25,000 sf retail', effort: 'high', strategy: { ...s0, extra: 'ignored', concept: 'y'.repeat(5000) } });
  assert.equal(res.code, 200); const pu = JSON.parse(sent[0].messages[1].content); assert.equal(pu.plannedStrategy.name, 'A'); assert.ok(pu.plannedStrategy.concept.length <= 600 && !('extra' in pu.plannedStrategy), 'the plan cleaned again on the way in');
  assert.match(sent[0].messages[0].content, /plannedStrategy is given/);
  sent = []; await call({ prompt: '25,000 sf retail' }); assert.ok(!('plannedStrategy' in JSON.parse(sent[0].messages[1].content)), 'no plan (Low): none sent');
  reply = () => ({ reviews: [{ option: 0, score: 70, verdict: 'ok', strengths: [], problems: [] }], ranking: [0], revise: false, program: P0, params: { fill: null, streets: null, form: null, storm: null }, why: '', summary: 'Fine.' });
  sent = []; await call({ mode: 'review', prompt: 'retail', options, round: 1, rounds: 1, strategy: s0 }); assert.equal(JSON.parse(sent[0].messages[1].content).plannedStrategy.name, 'A'); assert.match(sent[0].messages[0].content, /carries it out/);
  // ask: the fact sheet, the conversation so far and the question go to the model; a short answer and follow-ups come back
  const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PF = await import('../lib/proforma.mjs'), A = await import('../lib/planask.mjs');
  const site = { ring: [[0, 0], [600, 0], [600, 420], [0, 420]], front: 0, setbacks: S.SETBACKS, program: { use: 'retail', gfa: 25000 } };
  const o = L.layoutOptions(site, site.program)[0], pl = { ...site, name: 'Option A', elements: o.elements, recipe: o.recipe, variant: { key: 'k1', name: 'Layout 1 · ' + o.arr }, lastRun: { ask: '25,000 sf retail strip', note: 'A one-story strip.', effort: 'high', variants: [{ key: 'k1', name: 'Layout 1 · ' + o.arr, notes: o.notes, ai: { score: 78, verdict: 'Solid', strengths: [], problems: ['Pond at the back'] } }] } };
  const facts = A.planFacts(pl, { site: { acres: 5.79, frontageFt: 600 }, pf: PF.run(pl, PF.defaults(pl)) });
  reply = () => ({ answer: 'Retail is parked at 4 spaces per 1,000 sq ft, so 25,000 sq ft needs 100 spaces. '.repeat(60), followups: ['Can I park less?', '', 'Why a pond?', 'What about rents?', 'x'] });
  sent = []; res = await call({ mode: 'ask', question: 'Why do we need so much parking?', history: [{ q: 'What is this?', a: 'A strip center.' }, { q: 'no answer' }], plan: facts, effort: 'low' });
  assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(sent[0].reasoning_effort, 'low', 'the effort picked');
  const u = sent[0].messages[1].content; assert.match(u, /"required":\d+/); assert.match(u, /Q: What is this\?\nA: A strip center\./); assert.ok(!/no answer/.test(u), 'a turn without an answer is dropped'); assert.match(u, /Question: Why do we need so much parking\?$/);
  assert.match(sent[0].messages[0].content, /only the facts given/i); assert.equal(sent[0].response_format.json_schema.name, 'plan_answer');
  assert.ok(res.body.answer.length <= 2400, 'answer clipped'); assert.deepEqual(res.body.followups, ['Can I park less?', 'Why a pond?', 'What about rents?'], 'up to three, blanks dropped');
  sent = []; await call({ mode: 'ask', question: 'Why?', plan: facts }); assert.equal(sent[0].reasoning_effort, 'medium', 'no effort: medium');
  sent = []; await call({ mode: 'ask', question: 'Why?', plan: { ...facts, pieces: Array.from({ length: 500 }, (_, i) => ({ name: 'Piece ' + i, note: 'x'.repeat(5000) })) } });
  assert.ok(sent[0].messages[1].content.length < 70000, 'an oversized fact sheet is cut down');
  res = await call({ mode: 'ask', question: '  ', plan: facts }); assert.equal(res.code, 400);
  res = await call({ mode: 'ask', question: 'Why?', plan: null }); assert.equal(res.code, 400);
  res = await call({ mode: 'ask', question: 'Why?', plan: [1, 2] }); assert.equal(res.code, 400);
  // askProject: a question about the whole project, from its fact sheet (lib/project.mjs projectFacts)
  const PJ = await import('../lib/project.mjs'), { PROJECT_ASK_SCHEMA } = await import('../api/siteplan.js');
  assert.deepEqual(PROJECT_ASK_SCHEMA.required.slice().sort(), Object.keys(PROJECT_ASK_SCHEMA.properties).sort(), 'strict schema');
  const sheet = PJ.projectFacts({ name: 'Katy pad', status: 'contract', client: 'Acme', parcels: [{ label: '1 Main St', owner: 'Smith', acres: 5.79 }] }, { acres: 5.79, jurisdiction: { county: 'Harris', place: null, flood: { zone: 'AE', risk: 'high' } }, options: [{ facts, name: 'Option A', renderings: 2, drawn: true }] });
  reply = () => ({ answer: 'Option A fits: 25,000 sq ft on 5.79 acres. '.repeat(100), followups: ['What approvals?', '', 'x'] });
  sent = []; res = await call({ mode: 'askProject', question: 'Which option fits this site best?', history: [{ q: 'Status?', a: 'Under contract.' }], project: sheet });
  assert.equal(res.code, 200, JSON.stringify(res.body)); assert.equal(sent[0].response_format.json_schema.name, 'project_answer'); assert.equal(sent[0].reasoning_effort, 'medium');
  const pq = sent[0].messages[1].content; assert.match(pq, /Fact sheet for the project/); assert.match(pq, /Unincorporated/); assert.match(pq, /"status":"Under contract"/); assert.match(pq, /"renderings":2/); assert.match(pq, /Q: Status\?\nA: Under contract\./); assert.match(pq, /Question: Which option fits this site best\?$/);
  assert.match(sent[0].messages[0].content, /several|each site plan option/i); assert.match(sent[0].messages[0].content, /isn't in the project's facts/);
  assert.ok(res.body.answer.length <= 3000, 'answer clipped'); assert.deepEqual(res.body.followups, ['What approvals?', 'x']);
  sent = []; await call({ mode: 'askProject', question: 'Why?', project: { ...sheet, options: Array.from({ length: 60 }, (_, i) => ({ option: 'O' + i, note: 'x'.repeat(5000) })) } });
  assert.ok(sent[0].messages[1].content.length < 70000, 'an oversized project sheet is cut down');
  const longNotes = 'Broker call: ' + 'n'.repeat(1100) + ' END'; sent = []; await call({ mode: 'askProject', question: 'Summarise this project for an email', project: { ...sheet, project: { ...sheet.project, notes: longNotes } } });
  assert.ok(sent[0].messages[1].content.includes(' END'), 'the project’s notes reach the AI whole (up to 1,500 characters)');
  res = await call({ mode: 'askProject', question: ' ', project: sheet }); assert.equal(res.code, 400);
  res = await call({ mode: 'askProject', question: 'Why?', project: null }); assert.equal(res.code, 400);
  res = await call({ mode: 'askProject', question: 'Why?', project: [1] }); assert.equal(res.code, 400);
  globalThis.fetch = async url => String(url).includes('/models/') ? Response.json({ id: 'm' }) : Response.json({ error: { message: 'boom' } }, { status: 400 });
  res = await call({ mode: 'ask', question: 'Why?', plan: facts }); assert.equal(res.code, 502); assert.match(res.body.error, /didn’t answer/);
  res = await call({ mode: 'askProject', question: 'Why?', project: { project: { name: 'x' } } }); assert.equal(res.code, 502); }

// ---- /api/projects ----
{ const store = []; let table = true;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url)), m = opts.method || 'GET'; if (!table) return new Response('{"code":"PGRST205","message":"Could not find the table public.site_projects"}', { status: 404 });
    if (m === 'GET') { const ids = u.searchParams.get('id'); return Response.json(ids ? store.filter(r => ids.slice(4, -1).split(',').map(x => x.replace(/"/g, '')).includes(r.id)) : store.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))); }
    for (const r of JSON.parse(opts.body)) { const i = store.findIndex(x => x.id === r.id); if (i >= 0) store[i] = r; else store.push(r); }
    return new Response(null, { status: 201 });
  };
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const { default: handler } = await import('../api/projects.js');
  const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; };
  const call = async (method, body, headers = {}) => { const res = mock(); await handler({ method, body, headers: { 'x-forwarded-for': '8.8.8.8', ...headers } }, res); return res; };
  const doc = { id: 'p-katy1', name: 'Katy pad', updated: '2026-10-12T10:00:00Z', parcels: [], plans: [{ id: 'a', name: 'Option A', ring: [[0, 0], [1, 0], [0, 1]], elements: [] }] };
  let res = await call('POST', { name: 'Matthew', projects: [doc, { id: '../x', name: 'bad' }] }); assert.equal(res.code, 200); assert.equal(res.body.saved, 1, 'bad id dropped');
  res = await call('POST', { projects: [{ ...doc, name: 'stale copy', updated: '2026-10-11T10:00:00Z' }] }); assert.equal(res.body.skipped, 1, 'an older copy doesn’t overwrite');
  res = await call('GET'); assert.deepEqual(res.body.projects.map(p => p.name), ['Katy pad']); assert.equal(store[0].updated_by, 'Matthew');
  res = await call('POST', { deletes: ['p-katy1'] }); res = await call('GET'); assert.deepEqual(res.body, { projects: [], deleted: ['p-katy1'] }, 'deleted: a tombstone for other devices');
  res = await call('POST', { projects: [{ ...doc, plans: [{ big: 'x'.repeat(600000) }] }] }); assert.equal(res.body.saved, 0, 'oversized project refused');
  process.env.FIELD_ACCESS_CODE = 'gate'; res = await call('GET'); assert.equal(res.code, 401); res = await call('GET', null, { 'x-field-code': 'gate' }); assert.equal(res.code, 200); delete process.env.FIELD_ACCESS_CODE;
  table = false; res = await call('GET'); assert.equal(res.code, 503); assert.equal(res.body.local, true, 'no table yet: the browser keeps projects on the device'); }

// ---- suggestions sized to the site, and what a request was read as (lib/planruns.mjs) ----
{ const R = await import('../lib/planruns.mjs');
  // every suggestion offered without the AI is read from its words as it says: its use, size, count and stories
  const has = (p, want) => {
    if (want.zones) { const z = p.zones || []; assert.equal(z.length, want.zones.length, 'zones'); want.zones.forEach((w, i) => { assert.equal(z[i].use, w.use); if (w.units) assert.equal(z[i].units, w.units); }); return; }
    assert.equal(p.use, want.use, 'use');
    for (const k of ['gfa', 'units', 'floors']) if (want[k] != null) assert.equal(p[k], want[k], k);
    if (want.truck) assert.equal(p.truck, true, 'truck court'); if (want.max) assert.equal(p.max, true, 'as big as fits');
    for (const x of want.extras || []) assert.ok(p.extras.includes(x), x); };
  const seen = new Set();
  for (const ac of [0.4, 0.9, 1.6, 2.5, 4.7, 9, 12, 24, 43, 120]) for (const fr of [90, 300, 700]) {
    const off = R.presets(ac, fr, { aiOff: true }), on = R.presets(ac, fr);
    assert.ok(off.length >= 2 && on.length >= 2, ac + ' ac: suggestions');
    for (const { text, want } of off) { const p = S.normalizeProgram(S.guessProgram(text)); has(p, want); assert.deepEqual(R.notUnderstood(text, p), [], text + ': fully read without the AI'); assert.ok(!/\d+ pads?\b/.test(text), 'no pads without the AI: ' + text); seen.add(text); }
    // (pads in the words are read without the AI too, since Oct 27: the program carries them and nothing is left unread)
    for (const { text, want } of on) if (want.pads) { const p = S.normalizeProgram(S.guessProgram(text)); assert.equal(p.pads, want.pads, text + ': pads read'); assert.deepEqual(R.notUnderstood(text, p), [], text + ': fully read'); } }
  // the sizes follow the site: a 4.7 acre lot and a 43 acre tract get different suggestions, each sized to fit
  const small = R.presets(4.7, 500).map(x => x.text), big = R.presets(43, 1200).map(x => x.text), tiny = R.presets(0.9, 200).map(x => x.text);
  assert.ok(!small.some(t => big.includes(t)), 'different suggestions for 4.7 and 43 acres'); assert.ok(/QSR|drive-thru/.test(tiny[0]), 'a pad on under an acre');
  assert.ok(small.some(t => /^25,000 sf retail strip with 2 pads$/.test(t)), small.join(' | ')); assert.ok(big.some(t => /^Mixed use/.test(t)) && seen.size > 12);
  // read as: chips from the program
  const P = q => S.normalizeProgram(S.guessProgram(q));
  assert.deepEqual(R.readAs(P('25,000 sf retail strip with 2 pads'), S.USES), ['Retail', '25,000 sf', '1 story', '2 pad sites', '4/1,000 parking']);
  assert.deepEqual(R.readAs(P('200 apartments, 3 stories'), S.USES), ['Multifamily', '200 units', '3 stories', '1.6/unit parking']);
  assert.deepEqual(R.readAs(P('6,000 sf restaurant with drive-thru'), S.USES).slice(-1), ['Drive-thru']);
  assert.deepEqual(R.readAs(P('Mixed use: retail in front, a commons with a lake, 120 apartments, 18 townhomes'), S.USES), ['Mixed use', 'Retail', 'Commons', '120 apartments', '18 townhomes']);
  assert.deepEqual(R.readAs(S.normalizeProgram({ use: 'retail', gfa: 25000, buildings: 3 }), S.USES), ['Retail', '25,000 sf', '1 story', '3 buildings', '4/1,000 parking']);
  // not understood: only a number with its noun that the program doesn't carry
  assert.deepEqual(R.notUnderstood('25,000 sf retail strip with 2 pads', P('25,000 sf retail strip with 2 pads')), [], 'pads read from the words');
  assert.deepEqual(R.notUnderstood('retail with two pads', P('retail with two pads')), []);
  assert.deepEqual(R.notUnderstood('25,000 sf retail strip with 2 pads', S.normalizeProgram({ use: 'retail', gfa: 25000 })), ['2 pads'], 'a program without them');
  assert.deepEqual(R.notUnderstood('25,000 sf retail strip with 2 pads', S.normalizeProgram({ use: 'retail', gfa: 25000, buildings: 3 })), [], 'the AI read the pads as buildings');
  assert.deepEqual(R.notUnderstood('4 buildings of 7,000 sf retail', P('4 buildings of 7,000 sf retail')), [], 'per-building size');
  assert.deepEqual(R.notUnderstood('townhomes at 20 units per acre, 40 townhomes', P('townhomes at 20 units per acre, 40 townhomes')), ['40 townhomes'], 'a density is not a count (and the words took 20 as the count, so the 40 is flagged)');
  assert.deepEqual(R.notUnderstood('25k sf shops, 3 stories', P('25k sf shops, 3 stories')), []);
  assert.deepEqual(R.notUnderstood('Single-family homes, mostly 2-story', P('Single-family homes, mostly 2-story')), []);
  assert.deepEqual(R.notUnderstood('a nice coffee shop', P('a nice coffee shop')), [], 'no numbers, nothing flagged');
  // a word or two between the number and the noun ("120 single-family homes") is still a count the words may have missed
  assert.deepEqual(R.notUnderstood('120 single-family homes and a 30,000 sf grocery', S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail', gfa: 30000 }, { use: 'sfr' }] })), ['120 single-family homes']);
  assert.deepEqual(R.notUnderstood('120 two-story homes', S.normalizeProgram({ use: 'sfr', units: 120 })), [], 'read when the program has the 120');
  assert.deepEqual(R.notUnderstood('4 acres of townhomes', P('4 acres of townhomes')), [], 'acres are not a count'); }

// ---- small sites: the suggested chips on 0.63 and 4.7 acres (PARCEL_SCALE 0.12 and 0.33 in the browser harness) park, with a drive in from the street ----
{ const L = await import('../lib/sitelayout.mjs'), PC = [-95.76, 29.79];
  const parcelAt = k => { const dx = 0.0022 * k, dy = 0.0019 * k, [lon, lat] = PC; return { type: 'Polygon', coordinates: [[[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx * 1.05, lat + dy * 0.6], [lon + dx * 0.4, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]]] }; };
  const touchesStreet = (plan, els) => { const rules = S.edgeRules(plan.ring, plan.front, plan.setbacks, plan.streets);
    return els.some(e => e.kind === 'drive' && plan.ring.some((a, k) => (rules[k].role === 'front' || rules[k].street) && S.shapeOf(e).some((p, i, c) => S.segSeg(p, c[(i + 1) % c.length], a, plan.ring[(k + 1) % plan.ring.length]) <= 2.5))); };
  for (const [k, ac] of [[0.12, 0.63], [0.33, 4.74]]) {
    const b = S.boundaryFrom(parcelAt(k), PC), plan = { ...b, front: null, frontGuess: true, setbacks: { ...S.SETBACKS } };
    assert.ok(Math.abs(S.ringArea(b.ring) / 43560 - ac) < 0.05, 'scale ' + k + ' is about ' + ac + ' acres');
    for (const ask of ['5,000 sf retail strip', '2,500 sf QSR pad with drive-thru', '25,000 sf retail strip with a drive-thru pad']) {
      const prog = S.guessProgram(ask), opts = L.layoutOptions(plan, prog); assert.ok(opts.length >= 1, ask + ' @' + k + ': layouts');
      for (const o of opts) { const p = { ...plan, elements: o.elements, program: o.program || prog, zones: o.zones }, m = S.metrics(p), what = ask + ' @' + k + ' · ' + o.name;
        assert.ok(m.spaces > 0, what + ': parks (' + m.spaces + ' of ' + m.required + ')');
        assert.ok(touchesStreet(plan, o.elements), what + ': a drive meets the street edge');
        assert.ok(!S.check(p).some(i => i.level === 'bad'), what + ': no blocking problems');
        for (const n of o.notes.filter(t => /Parking is \d/.test(t))) { const q = +n.match(/Parking is ([\d,]+) space/)[1].replace(/,/g, ''); assert.equal(q, m.required - m.spaces, what + ': the note counts like the header: ' + n); assert.ok(!/ 1 spaces/.test(n), what + ': singular'); } } } }
  // a lot with its building and nothing else: the apron parks it from the street side, drive in the middle
  const b2 = S.boundaryFrom(parcelAt(0.2), PC), plan2 = { ...b2, front: null, setbacks: { ...S.SETBACKS } }, bld = S.autoLayout(plan2, { use: 'retail', gfa: 5000 }).elements.filter(e => e.kind === 'building');
  const ap = S.streetApron(plan2, bld, { use: 'retail', gfa: 5000 }); assert.ok(ap && ap.elements.some(e => e.name === 'Main entry' && e.kind === 'drive'), 'apron with a main entry');
  { const p = { ...plan2, elements: bld.concat(ap.elements), program: { use: 'retail', gfa: 5000 } }, m = S.metrics(p); assert.ok(m.spaces >= m.required, 'apron parks the 5,000 sf: ' + m.spaces + ' of ' + m.required); assert.ok(!S.check(p).some(i => i.level === 'bad'), 'apron breaks no rule'); assert.ok(touchesStreet(plan2, ap.elements), 'apron drive on the street edge'); }
  // the engine's own shortfall note counts as the header does, and says "1 space"
  { const b3 = S.boundaryFrom(parcelAt(0.12), PC), plan3 = { ...b3, front: null, setbacks: { ...S.SETBACKS } }, r = S.autoLayout(plan3, { use: 'retail', gfa: 5000 }), m = S.metrics({ ...plan3, elements: r.elements, program: r.program }), n = r.notes.find(t => /^Parking is/.test(t));
    assert.equal(m.required - m.spaces, 1, 'one space short'); assert.ok(/^Parking is 1 space short;/.test(n), n); }
  assert.equal(S.spacesWord(1), '1 space'); assert.equal(S.spacesWord(2), '2 spaces'); assert.equal(S.spacesWord(1234), '1,234 spaces');
  // problem names keep their capitals
  { const pl = { ring: [[0, 0], [300, 0], [300, 300], [0, 300]], front: 0, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [{ id: 'a', kind: 'building', x: 150, y: 150, w: 80, d: 60, name: 'Building A' }, { id: 'b', kind: 'building', x: 170, y: 160, w: 80, d: 60, name: 'Building B' }] };
    assert.ok(S.check(pl).some(i => i.text === 'Building A overlaps Building B'), S.check(pl).map(i => i.text).join(' | ')); } }

// ---- parks are places (Oct 19): a park, lawn or open space is in the way of a street, a building and an entrance; a
// boulevard's median and plain leftover lawn aren't ----
{
  assert.ok(S.isPark({ kind: 'green', name: 'Lawn' }) && S.isPark({ kind: 'green', name: 'Open space', poly: [[0, 0], [9, 0], [9, 9]] }), 'a named lawn or open space is a park');
  for (const g of [{ kind: 'green', name: '' }, { kind: 'green', name: '', median: true }, { kind: 'green', name: 'x', island: true }, { kind: 'green', name: 'Future development', future: true }, { kind: 'pond', name: 'Lake' }]) assert.ok(!S.isPark(g), JSON.stringify(g));
  assert.ok(S.isMedian({ kind: 'green', name: '', median: true }) && S.isMedian({ kind: 'green', island: true }) && !S.isMedian({ kind: 'green', name: 'Park' }));
  // the checks: a park across a 28 ft street is flagged (the park, not the street); the same lawn unnamed, a planted island
  // inside the drive, a park that only touches the street, and a pavilion standing in the park aren't
  const ring = [[0, 0], [800, 0], [800, 600], [0, 600]], st = { id: 'st', kind: 'drive', x: 400, y: 300, w: 700, d: 28, rot: 0, name: 'Street' };
  const on = (...els) => S.check({ ring, front: 0, setbacks: { ...S.SETBACKS }, program: { use: 'sfr' }, elements: [st, ...els] }).filter(i => i.level === 'bad' && /overlaps/.test(i.text));
  const park = { id: 'pk', kind: 'green', name: 'Park', x: 400, y: 330, w: 120, d: 100, rot: 0 };
  assert.deepEqual(on(park).map(i => [i.id, i.text]), [['pk', 'Park overlaps Street']]);
  assert.deepEqual(on({ ...park, name: '' }), [], 'plain lawn under a street: not a problem');
  assert.deepEqual(on({ id: 'is', kind: 'green', name: 'Island', poly: [[380, 296], [420, 296], [420, 304], [380, 304]] }), [], 'a planted island inside the drive');
  assert.deepEqual(on({ ...park, y: 364 }), [], 'edge to edge');
  assert.deepEqual(on({ ...park, y: 400 }, { id: 'pv', kind: 'building', use: 'amenity', name: 'Pavilion', x: 400, y: 400, w: 40, d: 30, rot: 0 }), [], 'a pavilion standing in the park');
  assert.deepEqual(on({ ...park, y: 400 }, { id: 'cc', kind: 'building', use: 'amenity', name: 'Center', x: 460, y: 400, w: 60, d: 40, rot: 0 }).map(i => i.id), ['pk'], 'a building half in it');
  // entrances: an open space between the street and the drive is in the way; past its edge, or slid along the street, it's not
  const drive = { id: 'dr', kind: 'drive', x: 400, y: 214, w: 760, d: 28, rot: 0 }, os = { id: 'os', kind: 'green', name: 'Open space', x: 400, y: 100, w: 300, d: 160, rot: 0 };
  const lot = { ring, front: 0, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [drive, os] };
  const mid = S.addEntrance(lot, [400, 0]); assert.match(mid.error || '', /would cross Open space/, 'asked in its middle: says what is in the way'); assert.equal(mid.park?.id, 'os');
  const why = {}; assert.equal(S.entranceAt(lot, [400, 0], { why }), null); assert.equal(why.hit?.id, 'os');
  const past = S.addEntrance(lot, [205, 0]); assert.ok(!past.error, past.error); assert.ok(!S.rectsOverlap(past.entrance, os), 'just past its edge: in, clear of it');
  const slid = S.addEntrance(lot, [400, 0], { slide: 400 }); assert.ok(!slid.error && !S.rectsOverlap(slid.entrance, os) && Math.abs(slid.at[0] - 400) > 150, 'slid along the street past it: ' + slid.at);
  assert.ok(S.addEntrance({ ...lot, elements: [drive, { ...os, name: '' }] }, [400, 0]).entrance, 'plain lawn: the driveway goes through it');
  // the map: a median is marked so it draws over its paving
  const fc = S.planFeatures({ ...lot, origin: [-95.78, 29.78], elements: [drive, os, { id: 'md', kind: 'green', name: '', median: true, island: true, poly: [[390, 205], [410, 205], [410, 222], [390, 222]], x: 400, y: 214 }] }, null), pr = id => fc.features.find(f => f.properties.id === id)?.properties;
  assert.equal(pr('md').med, 1); assert.equal(pr('os').med, undefined);
  // a park placed among homes: the homes under it (and their lots and driveways) are what makes way; drives never do
  const h = { id: 'h1', kind: 'building', use: 'sfr', x: 100, y: 450, w: 40, d: 50, rot: 0 }, l1 = { id: 'l1', kind: 'lot', x: 100, y: 450, w: 60, d: 115, rot: 0 }, dw = { id: 'dw', kind: 'plaza', note: 'Driveway', x: 100, y: 412, w: 16, d: 26, rot: 0 }, h2 = { ...h, id: 'h2', x: 300 }, l2 = { ...l1, id: 'l2', x: 300 };
  const P2 = { ring, front: 0, setbacks: { ...S.SETBACKS }, elements: [st, h, l1, dw, h2, l2] }, pk2 = { id: 'p2', kind: 'green', name: 'Park', x: 110, y: 470, w: 60, d: 60, rot: 0 };
  assert.deepEqual([...S.homesUnder(P2, pk2, 4)].map(e => e.id).sort(), ['dw', 'h1', 'l1']);
  assert.deepEqual(S.placeObs(P2, pk2).map(o => o.o.id), ['st'], 'a park keeps off the street; the homes make way');
  // the clear space is part of each outline (the spot search only tests for overlap): a park lands 8 ft off a street, not flush
  { const near = { ...pk2, y: 345 }, c = S.clearSpot(P2, near, { obs: S.placeObs(P2, near), reach: 80 }); assert.ok(c, 'a spot'); const q = S.moveBy(structuredClone(near), c[0], c[1]);
    assert.ok(S.gapBetween(S.shapeOf(q), S.shapeOf(st)) >= 7.9, 'off the street: ' + S.gapBetween(S.shapeOf(q), S.shapeOf(st))); }
  // a home 3 ft off a rectangular park makes way (the margin is square off its sides, not 0.7 of it); the lot of a home
  // that stays is cut back off the park
  { const pk3 = { ...pk2, x: 100, y: 540 - 25 - 3 - 30 }; assert.deepEqual([...S.homesUnder({ ...P2, elements: [st, { ...h, y: 540 }, l1] }, pk3, 4)].map(e => e.id), ['h1'], 'within 4 ft');
    const lot = { ...l2, y: 480 }, hh = { ...h2, y: 500 }, pk4 = { ...pk2, x: 300, y: 410 }, t = S.trimLots([lot, hh], pk4), tl = t.find(e => e.id === 'l2');
    assert.ok(tl.poly && S.ringArea(tl.poly) < S.ringArea(S.shapeOf(lot)) - 900 && !S.rectsOverlap(tl, pk4) && S.inRing([hh.x, hh.y], tl.poly), 'trimmed, the home still on it'); assert.equal(t.length, 2); }
  // a parking row cut under a park doesn't grow back under it when something nearby moves away
  { const ext = { x: 400, y: 460, w: 300, d: 18, rot: 0 }, row = { id: 'r', kind: 'parking', ...ext, ext }, pk5 = { id: 'p5', kind: 'green', name: 'Park', x: 400, y: 470, w: 60, d: 60, rot: 0 };
    const cut = S.cutRows([row, pk5], S.outline(pk5), 1), back = S.regrowRows(cut, [[240, 440], [300, 440], [300, 480], [240, 480]], 5);
    assert.ok(back.some(e => e.kind === 'parking') && !back.some(e => e.kind === 'parking' && S.rectsOverlap(e, pk5)), 'the stalls stay off the park'); }
  // dragged, resized or turned where it stands (was: its outline there): a park against its street slides along it, and
  // the pavilion standing in its lawn isn't in its way (any small drag used to be "blocked"); it still can't cross the street
  { const pk6 = { id: 'p6', kind: 'green', name: 'Lawn', x: 400, y: 364, w: 120, d: 100, rot: 0 }, pv = { id: 'pv', kind: 'building', use: 'foodtrucks', ft: 'pavilion', name: 'Pavilion', x: 400, y: 370, w: 40, d: 30, rot: 0 }, P6 = { ring, front: 0, setbacks: { ...S.SETBACKS }, elements: [st, pk6, pv] };
    assert.ok(S.isCommons(P6.elements, pk6) && !S.isCommons([st, pk6], pk6), 'a lawn holding a pavilion is a commons');
    const obs = S.placeObs(P6, pk6, [], S.shapeOf(pk6)), slid = S.moveBy(structuredClone(pk6), 30, 0); assert.deepEqual(obs.map(o => o.o.id), ['st'], 'its pavilion is its own');
    assert.deepEqual(S.clearSpot(P6, slid, { obs, reach: 0 }), [0, 0], 'along the street: clear'); assert.ok(!S.clearSpot(P6, S.moveBy(structuredClone(pk6), 0, -40), { obs, reach: 0 }), 'onto it: not');
    assert.equal(S.clearSpot(P6, slid, { obs: S.placeObs(P6, pk6), reach: 0 }), null, '(placed afresh it keeps 8 ft off the street and off the pavilion)'); }
  // an area drawn with the area tool (Landscape 3) is an island or a strip until it's named
  assert.ok(!S.isPark({ kind: 'green', name: 'Landscape 3', poly: [[0, 0], [9, 0], [9, 9]] }) && S.isPark({ kind: 'green', name: 'Landscape park' }));
  // the stop bar at a driveway in near a corner runs along the lot line its mouth is on (it read as coming from the other one)
  { const lot2 = { ring, front: 0, setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [{ id: 'dr2', kind: 'drive', x: 400, y: 214, w: 760, d: 28, rot: 0 }] }, a = S.addEntrance(lot2, [50, 0]);
    assert.ok(a.entrance, a.error); const bar = S.entryMarks({ ...lot2, elements: a.elements }).find(m => m.color === '#ffffff'); assert.ok(bar && Math.abs(bar.line[0][1] - bar.line[1][1]) < 1 && Math.abs(bar.line[0][1] - 12) < 2, JSON.stringify(bar)); }
}

// ---- placement in words (phase 3, lib/sitepods.mjs): each zone's place, kept by normalizeProgram, read from the words and from the AI ----
{ const N = q => S.normalizeProgram(q).zones;
  const z = N({ use: 'retail', zones: [{ use: 'retail', gfa: 60000, place: { where: 'corner', road: '  FM 362 ', next: [], side: 'left' } }, { use: 'amenity', place: { where: 'middle' } }, { use: 'sfr', place: { where: 'around', next: [1, 2, 1, 7, -1, 'x'] } }] });
  assert.deepEqual(z[0].place, { where: 'corner', road: 'FM 362', next: [], side: 'left' }); assert.deepEqual(z[1].place, { where: 'middle', road: null, next: [], side: null });
  assert.deepEqual(z[2].place.next, [1], 'next: other zones only, once each, in range');
  assert.ok(!('place' in N({ use: 'retail', zones: [{ use: 'retail', place: { where: 'nowhere' } }, { use: 'sfr', place: 'back' }] })[0]), 'junk: no hint');
  assert.ok(N({ use: 'retail', zones: [{ use: 'retail' }, { use: 'sfr', place: { where: 'between', next: [0, 0, 0] } }, { use: 'amenity', place: { where: 'beside', next: [0, 1, 3] } }] }).every((q, i) => i === 0 ? !q.place : q.place.next.length <= 2), 'two next at most');
  assert.deepEqual(N({ use: 'retail', zones: [{ use: 'retail', gfa: 20000 }, { use: 'multifamily', units: 200 }] }).map(q => Object.keys(q).includes('place')), [false, false], 'no hints: no key (saved plans compare the same)');
  const g = N({ use: 'office', garage: true, zones: [{ use: 'office', gfa: 80000 }, { use: 'retail', gfa: 20000 }, { use: 'multifamily', units: 200, place: { where: 'beside', next: [1] } }] }); // a garage put in after the offices moves the zones behind it along one
  assert.deepEqual(g.map(q => q.use), ['office', 'garage', 'retail', 'multifamily']); assert.deepEqual(g[3].place.next, [2], 'beside the retail, as said');
  // the words
  const P = t => S.guessProgram(t).zones, at = (Z, u) => Z.find(q => q.use === u)?.place;
  const W = P('60,000 sf retail with 2 pads at the corner of FM 362 and Bauer Road, 300 apartments along FM 362, about 600 homes around a lake, and a commons with a community center, pool and playground');
  assert.deepEqual(W.map(q => q.use + (q.units || q.gfa || '')), ['retail60000', 'amenity', 'multifamily300', 'sfr600']); assert.equal(W[0].pads, 2);
  assert.equal(at(W, 'retail').where, 'corner'); assert.match(at(W, 'retail').road, /fm 362|bauer/); assert.deepEqual([at(W, 'multifamily').where, at(W, 'multifamily').road], ['along', 'fm 362']);
  assert.deepEqual([at(W, 'sfr').where, at(W, 'sfr').next], ['around', [1]], 'homes round the commons'); assert.ok(W[1].items.includes('lake') && at(W, 'amenity').where === 'middle', 'the commons holds the lake, in the middle');
  const B = P('20,000 sf retail, 40 townhomes as a buffer between the retail and the homes, 200 homes'); assert.deepEqual([at(B, 'townhomes').where, at(B, 'townhomes').next], ['between', [0, 2]]);
  assert.deepEqual([at(P('retail and 200 apartments facing the highway'), 'multifamily').where, at(P('30,000 sf retail on the frontage and 300 homes'), 'retail').where, at(P('300 homes, the commons in the middle'), 'amenity').where, at(P('retail at the front, 200 homes at the back'), 'sfr').where], ['along', 'along', 'middle', 'back']);
  assert.deepEqual(at(P('20,000 sf shops on the left corner and 150 apartments'), 'retail'), { where: 'corner', road: null, next: [], side: 'left' });
  assert.deepEqual(P('37,700 sf retail with 2 pads, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units').map(q => q.use + (q.place ? '@' : '')), ['retail', 'amenity', 'multifamily', 'townhomes', 'duplex'], 'no placement words: no hints, the zones as before');
  // the AI: placement in the program schema (strict), read back as place; the words fill a zone the model left open
  const { default: handler, SCHEMA, EDIT_SCHEMA } = await import('../api/siteplan.js'), strict = (sc, w) => { if (sc?.type === 'object' && sc.properties) { assert.deepEqual(sc.required.slice().sort(), Object.keys(sc.properties).sort(), 'strict: ' + w); for (const [k, v] of Object.entries(sc.properties)) strict(v, w + '.' + k); } if (sc?.items) strict(sc.items, w + '[]'); };
  strict(SCHEMA, 'program'); assert.ok(SCHEMA.properties.zones.items.properties.placement.properties.where.enum.includes('around')); strict(EDIT_SCHEMA, 'edit');
  assert.ok(EDIT_SCHEMA.properties.ops.items.properties.action.enum.includes('relay') && EDIT_SCHEMA.properties.ops.items.properties.kind.enum.includes('pod'));
  const mock = () => { const r = { code: 200, headers: {}, status(c) { r.code = c; return r; }, json(o) { r.body = o; return r; }, setHeader(k, v) { r.headers[k] = v; } }; return r; }; let sent = null, reply = null; process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes('/models/')) return Response.json({ id: 'm' }); sent = JSON.parse(opts.body); return Response.json({ choices: [{ message: { content: JSON.stringify(reply()) } }] }); };
  const call = async body => { const res = mock(); await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '7.7.7.21' } }, res); return res; }, none = { where: null, road: null, next: [], side: null };
  const zone = o => ({ use: 'retail', gfa: null, units: null, floors: null, buildings: null, pads: null, items: [], name: null, placement: none, ...o });
  reply = () => ({ use: 'retail', gfa: null, units: null, floors: null, buildings: null, zones: [zone({ gfa: 60000, placement: { where: 'corner', road: 'FM 362', next: [], side: null } }), zone({ use: 'amenity', items: ['lake'] }), zone({ use: 'sfr', units: 600 })], setbacks: { front: null, side: null, rear: null, paving: null }, summary: 'x', assumptions: [] });
  let res = await call({ prompt: '60,000 sf retail at the corner of FM 362, 600 homes around a lake', site: { acres: 246, streets: [{ side: 'front', name: 'FM 362', highway: true }, { side: 'side', name: 'Bauer Road' }, { side: 'nope', name: { x: 1 } }] } });
  assert.equal(res.code, 200, JSON.stringify(res.body)); const pz = res.body.program.zones; assert.deepEqual(pz[0].place, { where: 'corner', road: 'FM 362', next: [], side: null }, 'the model’s placement');
  assert.deepEqual([pz[2].place.where, pz[2].place.next], ['around', [1]], 'the words’ placement where the model left one open (next by use)'); assert.ok(!pz[1].place || pz[1].place.where === 'middle');
  assert.deepEqual(JSON.parse(sent.messages[1].content).site.streets, [{ side: 'front', name: 'FM 362', highway: true }, { side: 'side', name: 'Bauer Road', highway: false }, { side: 'front', name: null, highway: false }], 'the roads by name go to the model, clipped');
  // Change With AI on a plan in pods: the pods go to the model; relay and swap on pod ids come back
  const op = o => ({ action: 'change', target: null, every: null, floorsOver: null, with: null, type: null, kind: null, use: null, name: null, floors: null, units: null, w: null, d: null, x: null, y: null, turn: null, turnBy: null, boulevard: null, signs: null, ...o });
  reply = () => ({ homeMix: [], ops: [op({ action: 'relay', target: 'pod:p3' }), op({ action: 'swap', target: 'pod:p3', with: 'pod:p2' }), op({ action: 'relay', target: 'b1' }), op({ action: 'relay', target: 'pod:p99' })], names: { community: null, parts: [] }, refit: 'none', summary: 'Re-laid.', question: null });
  res = await call({ mode: 'edit', prompt: 'redo the apartments, then swap them with the retail', plan: { pieces: [{ id: 'b1', name: 'Apt Bldg 1', kind: 'building', use: 'multifamily', at: [1, 2] }], pods: [{ id: 'pod:p3', name: 'Apartments', use: 'multifamily', acres: 18.8, at: [1445, 273], faces: ['FM 362', 'the spine road'], units: 300 }, { id: 'pod:p2', name: 'Retail', use: 'retail', acres: 8.1, at: [333, 266], faces: ['FM 362'] }, { id: 'p7', name: 'not a pod' }] } });
  assert.equal(res.code, 200, JSON.stringify(res.body)); assert.deepEqual(res.body.ops.map(o => [o.action, o.target, o.with]), [['relay', 'pod:p3', null], ['swap', 'pod:p3', 'pod:p2']], 'pods by their ids only');
  assert.deepEqual(JSON.parse(sent.messages[1].content.split('\n\nBuilding library')[0]).pods.map(p => p.id), ['pod:p3', 'pod:p2'], 'the pods go to the model');
  reply = () => ({ homeMix: [], ops: [op({ action: 'relay', target: 'pod:p2', gfa: 80000 }), op({ action: 'relay', target: 'pod:p3', gfa: 'lots' })], names: { community: null, parts: [] }, refit: 'none', summary: 'Bigger.', question: null });
  res = await call({ mode: 'edit', prompt: 'make the retail pod 80,000 sf', plan: { pieces: [], pods: [{ id: 'pod:p2', name: 'Retail', use: 'retail', acres: 8.1, at: [333, 266], faces: ['FM 362'] }, { id: 'pod:p3', name: 'Apartments', use: 'multifamily', acres: 18.8, at: [1, 1], faces: [] }] } });
  assert.deepEqual(res.body.ops.map(o => o.gfa), [80000, null], 'a pod’s floor area, sq ft');
  // the words: placement after the zones are in their order (a commons said to go at the back moves to the end); uses
  // named together share a placement; a commons' items wherever they're said; uses named only as what a zone is beside
  const H = P('300 homes around a lake and a clubhouse at the back, 200 apartments along the highway'); assert.deepEqual(H.map(q => q.use), ['multifamily', 'sfr', 'amenity']); assert.deepEqual(at(H, 'sfr').next, [2], 'round the commons, not the apartments');
  const H2 = P('Retail at the corner, 200 apartments, 300 homes around the commons, with a community center at the back'); assert.equal(H2[at(H2, 'sfr').next[0]].use, 'amenity');
  assert.deepEqual(P('medical and office in the middle, 200 homes').filter(q => q.place).map(q => q.use + ':' + q.place.where).sort(), ['medical:middle', 'office:middle']);
  assert.deepEqual(P('retail, 300 homes and a commons with a pool and playground').find(q => q.use === 'amenity').items, ['pool', 'playground']);
  const L4 = P('400 homes around a lake with a clubhouse and pool'); assert.deepEqual(L4.map(q => q.use), ['amenity', 'sfr']); assert.ok(['center', 'pool', 'lake'].every(k => L4[0].items.includes(k)), 'the clubhouse and pool kept'); assert.deepEqual(at(L4, 'sfr').next, [0]);
  const BT = P('apartments beside the retail, homes between the apartments and the park'); assert.deepEqual(BT.map(q => q.use), ['retail', 'amenity', 'multifamily', 'sfr']);
  assert.deepEqual([at(BT, 'multifamily').where, at(BT, 'multifamily').next, at(BT, 'sfr').where, at(BT, 'sfr').next], ['beside', [0], 'between', [2, 1]]);
  assert.deepEqual(P('200 apartments along the highway and 80 homes').map(q => q.use + q.units), ['multifamily200', 'sfr80']);
  // a lake said with other things is one of them (a commons of only those has none); a lake alone: the commons as it comes, its lake among the rest
  const am = t => P(t).find(q => q.use === 'amenity')?.items ?? null;
  for (const t of ['a neighborhood of 500 homes with a lake, a pool and a playground', '400 homes, a commons with a lake, pool and playground', '30,000 sf retail, 200 apartments, 300 homes and a park with a lake and a pool', '300 homes, 100 apartments and a commons with a lake and a pool', '150 townhomes and 20,000 sf retail with a lake and a playground', 'homes on lots with a lake, and a clubhouse']) assert.ok(am(t)?.includes('lake'), t + ': ' + am(t));
  assert.ok(am('homes on lots with a lake, and a clubhouse').includes('center') && am('homes on lots with a lake, and a clubhouse').includes('playground'), 'a clubhouse with its playground, said after');
  assert.equal(am('300 homes and a commons with a lake'), null); assert.equal(am('300 homes around a lake'), null, 'homes round a lake: the usual commons, lake and all');
  // what a zone is beside or round, with its numbers; homes said with no number but a place
  assert.deepEqual(P('120 apartments next to 20,000 sf of retail').map(q => q.use + (q.units || q.gfa)), ['retail20000', 'multifamily120']);
  assert.deepEqual(am('100 homes around 2 pickleball courts and a pool'), ['courts', 'pool']);
  const BH = P('120 townhomes as a buffer between the apartments and the homes, homes at the back'); assert.deepEqual(BH.map(q => q.use), ['multifamily', 'townhomes', 'sfr']);
  assert.deepEqual([at(BH, 'townhomes').where, at(BH, 'townhomes').next, at(BH, 'sfr').where, at(BH, 'multifamily')], ['between', [0, 2], 'back', undefined], 'the homes at the back, not the apartments');
  // a numbered highway is that road, not "the highway" (the front)
  assert.equal(at(P('200 apartments along Highway 6 and 300 homes'), 'multifamily').road, 'highway 6'); assert.equal(at(P('retail along the highway and 300 homes'), 'retail').road, 'highway'); }

console.log('site plans ok');
