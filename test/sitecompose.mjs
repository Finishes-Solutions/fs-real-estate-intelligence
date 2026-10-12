// Offline tests for detailed and mixed-use site plans (lib/sitecompose.mjs) and the site plan sheet (lib/sitesheet.mjs).
// Lots: a 20-acre tract shaped like a surveyed one (four slightly skewed lines, street along the long west line) and
// a real 27-acre parcel from the team database.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), C = await import('../lib/sitecompose.mjs'), G = await import('../lib/sitesheet.mjs');

const O = [-95.6954, 29.6657], k = 364567 * Math.cos(O[1] * Math.PI / 180), ll = ([x, y]) => [O[0] + x / k, O[1] + y / 364567];
const tract = S.boundaryFrom({ type: 'Polygon', coordinates: [[[0, 0], [716, 25], [759, 1244], [-47, 1219], [0, 0]].map(ll)] });
const west = tract.ring.findIndex((p, i) => { const q = tract.ring[(i + 1) % tract.ring.length]; return S.outwardOf(tract.ring, i)[0] < -0.9; });
const stokes = S.boundaryFrom({ type: 'Polygon', coordinates: [[[-95.910874,30.0542135],[-95.910869,30.0538835],[-95.9087685,30.05391],[-95.9088785,30.058805],[-95.9109745,30.0587885],[-95.910974,30.058761],[-95.910947,30.0575345],[-95.9109315,30.0567925],[-95.9109225,30.056363],[-95.9109105,30.055827],[-95.9108955,30.0551115],[-95.910874,30.0542135]]] });

// ---- words to zones ----
const words = '37,700 sf retail with 2 pads, a commons with a lake, 120 apartments, 18 townhomes and 12 duplex units';
const g = S.guessProgram(words);
assert.deepEqual(g.zones.map(z => z.use), ['retail', 'amenity', 'multifamily', 'townhomes', 'duplex'], 'zones from the street back');
assert.deepEqual([g.zones[0].gfa, g.zones[0].pads, g.zones[2].units, g.zones[3].units, g.zones[4].units], [37700, 2, 120, 18, 12]);
assert.deepEqual(S.guessProgram('mixed use: 3-story apartments (240 units) behind 20k sf of shops').zones.map(z => z.use + (z.units || z.gfa)), ['retail20000', 'multifamily240']);
assert.equal(S.guessProgram('25,000 sf retail strip').zones, undefined, 'one use: no zones');
assert.equal(S.normalizeProgram({ use: 'retail', zones: [{ use: 'retail' }] }).zones, null);

// ---- a mixed-use plan ----
const run = (base, front, prog, v = 0) => { const plan = { ...base, front, setbacks: { ...S.SETBACKS }, program: prog }, t0 = Date.now(), r = C.composeSite(plan, S.normalizeProgram(prog), v), ms = Date.now() - t0;
  Object.assign(plan, { elements: r.elements, zones: r.zones, program: r.program }); return { plan, r, ms, m: S.metrics(plan), bad: S.check(plan).filter(i => i.level === 'bad') }; };
for (const v of [0, 1, 2]) {
  const { plan, r, ms, m, bad } = run(tract, west, g, v), B = plan.elements.filter(e => e.kind === 'building'), by = u => B.filter(e => e.use === u);
  assert.ok(ms < 5000, 'took ' + ms + ' ms');
  assert.deepEqual(bad, [], 'v' + v + ': ' + bad.map(i => i.text).join('; '));
  assert.equal(r.zones.length, 5, 'every zone is drawn'); assert.ok(Math.abs(r.zones.reduce((s, z) => s + z.acres, 0) - m.acres) < 0.5, 'the zones cover the site');
  assert.equal(by('multifamily').reduce((s, e) => s + (e.units ?? Math.floor(e.w * e.d * e.floors * 0.85 / 900)), 0) >= 115, true, 'about 120 apartments');
  assert.equal(by('townhomes').reduce((s, e) => s + e.units, 0), 18); assert.equal(by('duplex').reduce((s, e) => s + e.units, 0), 12);
  const retail = by('retail').reduce((s, e) => s + e.w * e.d * e.floors, 0); assert.ok(Math.abs(retail - 37700) < 400, 'retail floor area: ' + Math.round(retail));
  assert.ok(B.some(e => /^Pad /.test(e.name)), 'pad sites'); assert.ok(B.some(e => e.name === 'Clubhouse') && plan.elements.some(e => e.kind === 'pool'), 'clubhouse and pool');
  assert.ok(plan.elements.some(e => e.kind === 'pond' && e.name === 'Amenity lake'), 'the commons holds the detention as a lake');
  assert.ok(plan.elements.some(e => e.name === 'Main entry') && plan.elements.filter(e => e.name === 'Internal drive').length >= 1, 'entry and internal drives');
  const names = by('multifamily').map(e => e.name); assert.deepEqual(names, names.map((_, i) => 'Apt Bldg ' + (i + 1)), 'one numbering across the site');
  for (const e of plan.elements) if (e.kind !== 'drive') for (const c of S.corners(e)) assert.ok(S.inRing(c, plan.ring), e.kind + ' ' + (e.name || '') + ' inside the lot');
  assert.ok(m.garages === 18 * 2 + 12, 'garages: 2 per townhome, 1 per duplex unit');
}
{ // the real parcel: mixed use and a single use both come out clean
  const a = run(stokes, null, S.guessProgram('25,000 sf retail, a park with pickleball and a playground, 60 townhomes'));
  assert.deepEqual(a.bad, [], a.bad.map(i => i.text).join('; ')); assert.ok(a.plan.elements.some(e => e.kind === 'court') && a.plan.elements.some(e => e.kind === 'play'));
  const b = run(stokes, null, { use: 'retail', gfa: 30000, pads: 2 }); assert.deepEqual(b.bad, []); assert.equal(b.r.zones.length, 1);
  assert.ok(b.plan.elements.filter(e => /^Pad /.test(e.name || '')).length >= 1, 'pads on a single retail site'); assert.ok(b.plan.elements.some(e => e.name === 'Building A'));
  const c = run(stokes, null, { use: 'multifamily', units: 200 }); assert.ok(c.plan.elements.some(e => e.name === 'Clubhouse'), 'apartments get a clubhouse'); }

// ---- the drawing and the sheet ----
{ const { plan, r } = run(tract, west, g), turn = G.streetDown(plan), t = G.turned(plan, turn), f = t.ring[west], f2 = t.ring[(west + 1) % t.ring.length];
  assert.ok(Math.max(f[1], f2[1]) - Math.min(...t.ring.map(p => p[1])) < 60, 'turned so the street is at the bottom of the sheet');
  const svg = G.planSVG(plan, { px: 1000 }).svg; assert.match(svg, /^<svg[^>]+viewBox/); assert.match(svg, />APT BLDG 1</); assert.match(svg, /<circle/, 'trees');
  const html = G.sheetHTML({ plan, planName: 'Option A', project: { name: 'Westmoor <Commons>' }, size: 'tabloid', parcels: [{ label: '17625 MADDEN RD', owner: 'MADDEN PARTNERS LLC', propId: 'R131833', acres: 17.137 }],
    facts: ['FEMA flood zone X — outside the 100-year floodplain.'], notes: r.notes, address: '17625 Madden Rd', county: 'Fort Bend County, Texas', date: 'October 12, 2026' });
  assert.match(html, /^<!doctype html>/i); assert.match(html, /@page\{size:17in 11in/); assert.match(html, /SCALE: 1" = \d+' ON 11" × 17"/);
  for (const h of ['Site data &amp; land use', 'Development program &amp; parking', 'Parcels', 'Notes — constraints & due diligence', 'Legend', 'CONCEPTUAL — FOR FEASIBILITY ONLY', 'SP-1']) assert.ok(html.includes(h), 'sheet has ' + h);
  assert.ok(html.includes('Westmoor &lt;Commons&gt;') && !html.includes('<Commons>'), 'names are escaped'); assert.ok(html.includes('MADDEN PARTNERS LLC') && html.includes('FEMA flood zone X'));
  const d = G.sheetData(plan); assert.ok(d.land.some(r => r[0] === 'Front — Retail'), 'land use by zone'); assert.ok(d.program.some(r => /Townhomes — 3 bldgs/.test(r[0])));
  assert.match(G.sheetHTML({ plan, size: 'archd' }), /@page\{size:36in 24in/, 'ARCH D'); }

console.log('mixed-use site plans ok');
