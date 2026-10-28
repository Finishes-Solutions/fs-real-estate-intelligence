// The layout generator (lib/sitegen.mjs, layoutGallery): enumerated, deterministic galleries on the traced real parcels
// (test/fixtures/real): dozens of distinct layouts in a few seconds, the same list twice over, none breaking a rule
// at the top, the arrangements the sites were built with among them (a courtyard ring on Reinke Road, courtyards side
// by side and rows on the 20-acre parcel), every layout parked near what its buildings need, the count asked for met
// at the top of the list.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs');

function siteOf(file) {
  const R = JSON.parse(fs.readFileSync(new URL('./fixtures/real/' + file, import.meta.url)));
  const [lon0, lat0] = R.origin, a = R.angle * Math.PI / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)], kx = 364567 * Math.cos(lat0 * Math.PI / 180);
  const geo = ([fx, fy]) => [lon0 + (fx * ux[0] + fy * uy[0]) / kx, lat0 + (fx * ux[1] + fy * uy[1]) / 364567];
  const B = S.unionParcels([{ type: 'Polygon', coordinates: [R.parcel.concat([R.parcel[0]]).map(geo)] }]);
  const dirOf = c => { const d = ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] })[c]; return [d[0] * ux[0] + d[1] * uy[0], d[0] * ux[1] + d[1] * uy[1]]; };
  const edgeTo = c => { const d = dirOf(c); return B.ring.map((p, i) => ({ i, k: S.outwardOf(B.ring, i)[0] * d[0] + S.outwardOf(B.ring, i)[1] * d[1] })).filter(e => e.k > 0.6).sort((p, q) => q.k - p.k)[0].i; };
  return { site: { ...B, front: edgeTo(R.front), streets: R.streets.map(edgeTo), setbacks: { ...S.SETBACKS } }, ask: R.ask };
}
const metrics = (site, o) => S.metrics({ ...site, program: o.program, elements: o.elements });

for (const [file, want, minN] of [['courtyard-apartments.json', /^Courtyard/, 8], ['garden-apartments.json', /courtyards side by side/, 30]]) {
  const { site, ask } = siteOf(file), prog = S.guessProgram(ask), t0 = Date.now(), g = L.layoutGallery(site, prog), ms = Date.now() - t0;
  console.log(file + ': ' + g.length + ' layouts in ' + ms + ' ms');
  assert.ok(g.length >= minN, file + ': a gallery, not a handful: ' + g.length); assert.ok(ms < 15000, 'in seconds: ' + ms + ' ms');
  assert.ok(g.slice(0, 5).every(o => !o.bad.length), 'the top of the list breaks no rule: ' + g.slice(0, 5).map(o => o.bad.join('; ')).join(' | '));
  assert.ok(g.some(o => want.test(o.label)), file + ': the arrangement it was built with is offered: ' + g.map(o => o.label).filter((l, i, a) => a.indexOf(l) === i).join(' | '));
  const m0 = metrics(site, g[0]); assert.ok(m0.units >= prog.units * 0.85 && m0.units <= prog.units * 1.12, 'the first holds the count asked: ' + m0.units + ' of ' + prog.units);
  for (const o of g.slice(0, 10)) { const m = metrics(site, o); assert.ok(m.spaces >= m.required * 0.85 && m.spaces <= m.required * 1.35, o.label + ': parked near its need: ' + m.spaces + ' of ' + m.required); }
  const keys = g.map(o => o.key); assert.equal(new Set(keys).size, keys.length, 'every layout its own key');
  const g2 = L.layoutGallery(site, prog); assert.deepEqual(g2.map(o => o.key), keys, 'the same list twice over'); assert.deepEqual(g2.map(o => Math.round(o.score)), g.map(o => Math.round(o.score)), 'and the same scores');
  const labels = new Set(g.map(o => o.label.split(' · ')[0])); assert.ok(labels.size >= 3, 'more than one arrangement: ' + [...labels].join(' | '));
}
console.log('sitegen: ok');
