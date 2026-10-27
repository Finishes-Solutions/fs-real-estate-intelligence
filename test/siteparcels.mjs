// A site of several parcels laid out parcel by parcel (lib/siteparcels.mjs): the parts and their street sides, which
// parcel the words mean, the programs assigned, the composed options, the re-fit; the parser's per-parcel clauses; and
// the generator's shops, flex and storage galleries (lib/sitegencom.mjs) on the real parcels of 0 Old Houston Hwy @ FM 362.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '../lib/siteplan.mjs';
import * as PARC from '../lib/siteparcels.mjs';
import * as GEN from '../lib/sitegen.mjs';
import { layoutOptions, layoutGallery, refit } from '../lib/sitelayout.mjs';

const FX = JSON.parse(fs.readFileSync(new URL('./fixtures/real/old-houston-fm362.json', import.meta.url)));
const dirOf = c => ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] })[c], edgeTo = (ring, c) => { const d = dirOf(c); return ring.map((p, i) => ({ i, k: S.outwardOf(ring, i)[0] * d[0] + S.outwardOf(ring, i)[1] * d[1], L: S.edgeLen(ring, i) })).filter(e => e.k > 0.6).sort((a, b) => b.k - a.k || b.L - a.L)[0]?.i; };
const b = S.boundaryFrom(FX.site), plan = { id: 'p', name: 'A', origin: b.origin, ring: b.ring, front: null, frontGuess: false, streets: [], setbacks: { ...S.SETBACKS }, program: { use: 'retail' }, elements: [], parcels: FX.parcels.map(p => p.key) };
plan.front = edgeTo(plan.ring, FX.front); plan.streets = [edgeTo(plan.ring, FX.streets)].filter(i => i != null && i !== plan.front);
assert.ok(Math.abs(S.ringArea(plan.ring) / 43560 - 16.16) < 0.1, 'the site is 16.16 acres');

// ---- the parts: each parcel's outline in the plan's feet, its street side ----
const parts = PARC.partsOf(plan, FX.parcels);
assert.equal(parts.length, 3);
const P1 = parts.find(p => p.key === '10680'), P2 = parts.find(p => p.key === '10682'), P3 = parts.find(p => p.key === '10687');
assert.ok(Math.abs(P1.acres - 5.88) < 0.05 && Math.abs(P2.acres - 0.93) < 0.03 && Math.abs(P3.acres - 9.36) < 0.05, 'acres from the outlines: ' + parts.map(p => p.acres));
const outward = (p, i) => S.outwardOf(p.ring, i);
assert.ok(outward(P1, P1.front)[0] > 0.9, 'the retail parcel fronts FM 362 on the east');
assert.ok(outward(P3, P3.front)[1] > 0.8, 'the big parcel fronts Old Houston Hwy on the north');
assert.ok(P2.corner, 'the small parcel is on the corner');
assert.ok(!P1.landlocked && !P3.landlocked && !P2.landlocked);
assert.equal(P1.streets.length, 0, 'the retail parcel touches no side street');

// ---- which parcel the words mean ----
assert.equal(PARC.partFor('the 5.88 acre', parts), P1); assert.equal(PARC.partFor('9.36 ac', parts), P3); assert.equal(PARC.partFor('corner', parts), P2);
assert.equal(PARC.partFor('largest', parts), P3); assert.equal(PARC.partFor('smallest', parts), P2); assert.equal(PARC.partFor('parcel 2', parts), parts[1]); assert.equal(PARC.partFor('the 41119 Old Houston Hwy parcel', parts), P3); assert.equal(PARC.partFor('FM 362 @ Old Houston', parts), P2);
assert.equal(PARC.partFor('the lakefront', parts), null);

// ---- the parser: a program per parcel named ----
const prog = S.guessProgram(FX.ask);
assert.equal(prog.parcels.length, 3); assert.equal(prog.parcels[0].program.use, 'retail'); assert.equal(prog.parcels[0].program.gfa, 45000); assert.equal(prog.parcels[0].program.pads, 3);
assert.equal(prog.parcels[1].program.use, 'industrial'); assert.equal(prog.parcels[2].program.gfa, 80000);
assert.equal(S.normalizeProgram(prog).parcels.length, 3, 'normalized programs keep their parcels');
assert.equal(S.guessProgram('30,000 sf of shops').parcels, undefined, 'no parcel named: no per-parcel programs');
const jobs = PARC.assign(prog, parts);
assert.equal(jobs.find(j => j.part === P1).program.use, 'retail'); assert.equal(jobs.find(j => j.part === P2).program.gfa, 9000); assert.equal(jobs.find(j => j.part === P3).program.gfa, 80000);
const shared = PARC.assign({ use: 'retail', gfa: 48000 }, parts); // one program for the whole site: shared by acreage
assert.equal(shared.reduce((s, j) => s + j.program.gfa, 0) > 45000 && shared.reduce((s, j) => s + j.program.gfa, 0) < 51000, true, 'the size shared by acreage adds back up');
assert.ok(shared.find(j => j.part === P3).program.gfa > shared.find(j => j.part === P1).program.gfa);

// ---- the options: composed, nothing across a parcel line ----
const t0 = Date.now(), opts = layoutOptions(plan, prog, { count: 2, parcels: parts, perParcel: true }), ms = Date.now() - t0;
assert.ok(opts.length >= 1, 'at least one parcel-by-parcel option'); assert.ok(ms < 40000, 'in under 40 s: ' + ms);
const o = opts[0];
assert.ok(o.parcelByParcel && o.zones.length === 3 && o.program.zones.length === 3, 'three parcels as zones');
for (const part of parts) { const B = o.elements.filter(e => e.kind === 'building' && e.parcel === part.key); assert.ok(B.length >= 1, part.label + ' has a building'); for (const e of B) assert.ok(S.inRing([e.x, e.y], part.ring), part.label + ': ' + (e.name || e.kind) + ' inside its parcel'); }
const uses = part => new Set(o.elements.filter(e => e.kind === 'building' && e.parcel === part.key).map(e => e.use));
assert.ok(uses(P1).has('retail') && uses(P2).has('industrial') && uses(P3).has('industrial'), 'each parcel holds what the words put on it');
assert.ok(o.elements.filter(e => e.kind === 'building' && e.parcel === P1.key && /drive-thru/i.test(e.note || '')).length >= 2, 'pads on the retail parcel');
assert.ok(o.recipe?.parcels?.picks?.length === 3, 'the recipe keeps each parcel’s pick');
const chk = S.check({ ...plan, program: o.program, elements: o.elements, zones: o.zones }).filter(i => i.level === 'bad');
assert.ok(chk.length <= 2, 'the composed plan passes the checks (' + chk.map(i => i.text).join('; ') + ')');
// the re-fit: the same picks again
const r = refit({ ...plan, program: o.program, elements: o.elements, zones: o.zones, recipe: o.recipe }, { parcels: parts });
assert.ok(r?.elements?.length && r.recipe?.parcels, 'a re-fit lays the parcels out again'); assert.deepEqual(r.recipe.parcels.picks.map(p => p.key), o.recipe.parcels.picks.map(p => p.key), 'the same layouts picked');

// ---- the generator's commercial galleries ----
const sub = part => ({ ...plan, ring: part.ring, front: part.front, streets: part.streets, parcels: null });
const shops = layoutGallery(sub(P1), { use: 'retail', gfa: 45000, pads: 3 }, { budgetMs: 20000 });
assert.ok(shops.length >= 20, 'shops: dozens of layouts, got ' + shops.length); assert.ok(shops.slice(0, 5).every(x => !x.bad.length), 'the first five shop layouts are clean');
assert.ok(/^Shops at the back of the field/.test(shops[0].label) && shops[0].elements.filter(e => e.kind === 'building' && /drive-thru/i.test(e.note || '')).length === 3, 'the first has its 3 pads: ' + shops[0].label);
assert.ok(shops.some(x => /an L with a wing/.test(x.label)) && shops.some(x => /inline|^Shops at the back of the field ·/.test(x.label)), 'inline and L forms both offered');
const flex = layoutGallery(sub(P3), { use: 'industrial', gfa: 80000, flex: true }, { budgetMs: 20000 });
assert.ok(flex.length >= 10, 'flex park: got ' + flex.length); assert.ok(flex.some(x => /Rear-loaded pairs/.test(x.label)) && flex.some(x => /Front-loaded/.test(x.label)), 'pairs round a court and front-loaded buildings');
assert.ok(flex.slice(0, 3).every(x => x.elements.some(e => e.kind === 'truck') && !x.bad.length), 'each has its loading and passes');
const sto = layoutGallery(sub(P3), { use: 'storage', gfa: 90000 }, { budgetMs: 20000 });
assert.ok(sto.length >= 10, 'storage: got ' + sto.length); assert.ok(sto[0].elements.some(e => e.storage === 'climate') && sto[0].elements.filter(e => e.storage === 'drive').length >= 2, 'a climate building and drive-up rows');
assert.ok(GEN.covers({ use: 'retail', gfa: 20000 }) && GEN.covers({ use: 'storage', gfa: 60000 }) && !GEN.covers({ use: 'retail', gfa: 20000, zones: [{}, {}] }) && !GEN.covers({ use: 'sfr' }));
const small = layoutGallery(sub(P2), { use: 'industrial', gfa: 9000, flex: true }, { budgetMs: 10000 });
assert.ok(small.length >= 1 && small[0].elements.some(e => e.kind === 'building'), 'a flex building on the 0.93-acre corner');
console.log('siteparcels ok: ' + parts.length + ' parts, ' + opts.length + ' parcel-by-parcel options in ' + ms + ' ms; shops ' + shops.length + ', flex ' + flex.length + ', storage ' + sto.length + ' layouts');
