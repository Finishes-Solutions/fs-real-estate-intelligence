// The detention estimate (lib/hydrology.mjs), the rainfall endpoint (api/rainfall.js) with NOAA's service stood in for,
// and the estimate in the engine and the check (lib/siteplan.mjs stormNeed / stormOf, lib/layoutcheck.mjs eng.detention).
// No network.
import assert from 'node:assert/strict';
const H = await import('../lib/hydrology.mjs'), S = await import('../lib/siteplan.mjs'), B = await import('../lib/layoutbrief.mjs'), RUN = await import('../lib/layoutrun.mjs');
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok ' + n + ' ' + name); };
const near = (a, b, e) => assert.ok(Math.abs(a - b) <= e, a + ' vs ' + b);

ok('TR-55 runoff: the curve-number equation (P 5 in on CN 80: 2.89 in; nothing below the initial abstraction)', () => {
  near(H.runoff(5, 80), 2.89, 0.01); assert.equal(H.runoff(0.3, 70), 0); assert.ok(H.runoff(15, 98) > 14.5);
});
ok('storage grows with the paving and the storm, and the Vs/Vr fit matches TR-55 Table 6-1', () => {
  const a = H.detentionTR55({ acres: 10, imp: 0.4, P: 11.5 }), b = H.detentionTR55({ acres: 10, imp: 0.85, P: 11.5 }), c = H.detentionTR55({ acres: 10, imp: 0.85, P: 15 });
  assert.ok(a.volume < b.volume && b.volume < c.volume, [a.volume, b.volume, c.volume].join(' < '));
  const k = H.VS_VR.III, r = 0.3; near(k[0] + k[1] * r + k[2] * r * r + k[3] * r ** 3, 0.38, 0.01); // (Figure 6-1, type II/III, qo/qi 0.3: about 0.38)
  assert.ok(b.volume / 10 > 0.3 && b.volume / 10 < 0.6, 'ac-ft an acre ' + b.volume / 10);
  assert.match(b.method, /TR-55/);
});
ok('regional rainfall: the upper Texas coast with its district minimum, central Texas, none elsewhere', () => {
  const h = H.regionalRain([-95.80, 30.07]); assert.equal(h.p, 15); assert.equal(h.rp, 100); assert.equal(h.localMin.rate, 0.55);
  assert.equal(H.regionalRain([-96.42, 30.38]).p, 11.5); assert.equal(H.regionalRain([-81, 35]), null);
});
ok('NOAA PFDS text parsed: the 24-hour row by return period', () => {
  const row = i => "['" + Array.from({ length: 10 }, (_, k) => (i + k / 10).toFixed(2)).join("','") + "']", text = "result = 'values';\nquantiles = [" + Array.from({ length: 19 }, (_, i) => row(i)).join(',') + '];\nupper = [];';
  const d = H.parsePFDS(text); assert.equal(d[1], 9); assert.equal(d[100], 9.6); assert.equal(d[1000], 9.9); assert.equal(H.parsePFDS('nothing here'), null);
});

// the endpoint, NOAA stood in for: the point estimate, then the regional figure when the service fails
{ const R = await import('../api/rainfall.js'), text = "quantiles = [" + Array.from({ length: 19 }, (_, i) => "['" + Array.from({ length: 10 }, (_, k) => i === 9 ? String(4 + k) : '1').join("','") + "']").join(',') + '];';
  const a = await R.rainfallFor(29.70, -95.40, 100, { fetchImpl: async () => new Response(text, { status: 200 }) }); assert.equal(a.rain.p, 10); assert.match(a.rain.source, /Atlas 14 point estimate/); assert.ok(!a.fallback);
  const b = await R.rainfallFor(29.71, -95.41, 100, { fetchImpl: async () => new Response('down', { status: 503 }) }); assert.ok(b.fallback); assert.equal(b.rain.p, 15);
  const c = await R.rainfallFor(35, -81, 100, { fetchImpl: async () => new Response('down', { status: 503 }) }); assert.equal(c.rain, null);
  n++; console.log('ok ' + n + ' the rainfall endpoint: NOAA point estimate, else the regional figure, else none'); }

ok('the engine sizes detention by the estimate when the rainfall is known, the rule of thumb when not, a local floor kept', () => {
  const rain = H.regionalRain([-96.42, 30.38]), prog = { use: 'multifamily', units: 200, floors: 3 };
  const rule = S.stormNeed(10, {}, prog, 10), hy = S.stormNeed(10, { storm: { rain } }, prog, 10);
  near(rule.volume, 5.5, 0.01); assert.ok(!rule.hydro); assert.ok(hy.hydro && hy.volume < rule.volume && hy.volume > 2, hy.volume);
  const floored = S.stormNeed(10, { storm: { rain }, code: { storm: { rate: 0.55, source: 'a county rule' } } }, prog, 10); near(floored.volume, 5.5, 0.01); assert.equal(floored.hydro.governs, 'floor');
  const coast = S.stormNeed(10, { storm: { rain: H.regionalRain([-95.8, 30.07]) } }, prog, 10); assert.ok(coast.volume >= 5.5 - 1e-9, 'the district minimum on the coast');
  assert.equal(S.stormNeed(0.6, { storm: { rain } }, prog, 0.6).volume, 0, 'under an acre: none');
});
ok('a run records the rainfall it used, and the check passes or fails the pond against the estimate', () => {
  const site = { origin: [-96.42, 30.38], ring: [[0, 0], [900, 0], [900, 500], [0, 500]], front: 0, streets: [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 } };
  const r = RUN.runBrief(B.briefFromRequest('exactly 120 garden apartments, 3 stories', site)), o = r.options[0], c = o.validation.checks.find(k => k.id === 'eng.detention');
  assert.ok(['pass', 'fail'].includes(c.status), c.status); assert.equal(c.hard, false); assert.match(c.note, /TR-55/); assert.match(c.note, /Atlas 14/); assert.match(c.note, /impervious/);
  assert.ok(r.engineMapping.some(m => /TR-55/.test(m)), 'the run says how detention was estimated');
  assert.equal(RUN.replayRun(r).identical, true);
  const far = RUN.runBrief(B.briefFromRequest('exactly 120 garden apartments, 3 stories', { ...site, origin: [-81, 35] })).options[0].validation.checks.find(k => k.id === 'eng.detention');
  assert.equal(far.status, 'unknown', 'no rainfall known: the rule of thumb, unknown as before');
});
console.log('hydrology: ' + n + ' passed');
