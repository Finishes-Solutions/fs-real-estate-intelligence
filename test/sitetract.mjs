// One use on a tract of its own (lib/sitetract.mjs): warehouses beside homes always get their own tract along one end
// of the frontage, with their own truck entrance and a landscape buffer, so no home is reached past the truck court;
// shops beside apartments on a site too shallow for the bands get their own tract instead of the broken fallbacks; the
// zones keep the program's numbering; a re-fit keeps the tract as it is.
import assert from 'node:assert/strict';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const siteOf = (w, d) => { const b = S.unionParcels([mk([-95.9, 30.05], [[0, 0], [w, 0], [w, d], [0, d]])]); return { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[1] < -0.9), setbacks: { ...S.SETBACKS } }; };
const bad = (plan, o) => S.check({ ...plan, program: o.program, elements: o.elements }).filter(i => i.level === 'bad').map(i => i.text);
const inside = (e, ring) => S.inRing([e.x, e.y], ring);

// ---- warehouses, shops, apartments and homes on 80 acres ----
{ const site = siteOf(2600, 1340), prog = S.guessProgram('40,000 sf retail, 150,000 sf warehouse, 240 apartments and 80 single-family homes');
  const out = L.layoutOptions(site, prog, { count: 2 }), o = out[0]; assert.ok(o?.elements?.length, 'a layout');
  assert.equal(o.recipe?.tract?.kind, 'industrial', 'the warehouses on a tract of their own: ' + o.name);
  const ring = o.recipe.tract.ring, wh = o.elements.filter(e => e.kind === 'building' && e.use === 'industrial'), homes = o.elements.filter(e => e.kind === 'building' && ['sfr', 'multifamily'].includes(e.use));
  assert.ok(wh.length && wh.every(e => inside(e, ring)), 'every warehouse on the tract');
  assert.ok(wh.reduce((t, e) => t + S.gfaOf(e), 0) >= 150000 * 0.97, 'the floor area asked for: ' + Math.round(wh.reduce((t, e) => t + S.gfaOf(e), 0)));
  assert.ok(homes.length && !homes.some(e => inside(e, ring)), 'no home on it');
  assert.ok(S.entrancesOf(o.elements).some(e => e.lot === 'tract:industrial' && /truck entrance/.test(e.note || '')), 'its own truck entrance');
  assert.ok(o.notes[0].startsWith('The warehouses on a ') && /landscape buffer/.test(o.notes[0]), o.notes[0]);
  for (const z of o.zones) if (z.zone != null) assert.equal(o.program.zones[z.zone].use, z.use, z.name + ' is zone ' + z.zone);
  for (const e of o.elements.filter(e => e.kind === 'building' && e.zone != null && e.use !== 'amenity')) assert.equal(o.program.zones[e.zone].use, e.use, (e.name || e.use) + ' in zone ' + e.zone);
  assert.deepEqual(bad(site, o), []);
  // a re-fit keeps the tract and what's on it
  const plan = { ...site, program: o.program, elements: o.elements, recipe: o.recipe, zones: o.zones }, r = L.refit(plan, { amount: 'current' });
  const key = els => els.filter(e => /^tract:/.test(e.lot || '')).map(e => e.id).sort().join();
  assert.ok(r?.elements?.length, 'a re-fit: ' + (r?.why || '')); assert.equal(key(r.elements), key(o.elements), 'the tracts as they were'); assert.equal(r.recipe?.tract?.kind, 'industrial'); }

// ---- shops and apartments on a 15-acre lot about 400 ft deep: no room for the bands ----
{ const site = siteOf(1140, 570), prog = S.guessProgram('retail along the front and apartments behind');
  const o = L.layoutOptions(site, prog, { count: 2 })[0]; assert.ok(o?.elements?.length);
  // (the bands lay this lot out now, shops along the front and the apartments behind: the tract is the fallback for when they can't)
  if (o.recipe?.tract) { assert.equal(o.recipe.tract.kind, 'commercial', 'the shops on a tract of their own: ' + o.name); assert.ok(o.name.startsWith('Shops on their own tract'), o.name); }
  else assert.ok(!/Simple layout/.test(o.name), 'a real layout, not a fallback: ' + o.name);
  assert.ok(o.elements.some(e => e.kind === 'building' && e.use === 'retail') && o.elements.filter(e => e.kind === 'building' && e.use === 'multifamily').length >= 4, 'shops and apartments');
  assert.deepEqual(bad(site, o), []); }

// ---- no homes: no tract (warehouses and shops share the site as before) ----
{ const site = siteOf(2600, 1340), o = L.layoutOptions(site, S.guessProgram('40,000 sf retail and a 300,000 sf warehouse'), { count: 1 })[0];
  assert.ok(o?.elements?.length && !o.recipe?.tract, 'no tract: ' + o?.name); }
console.log('sitetract: ok');
