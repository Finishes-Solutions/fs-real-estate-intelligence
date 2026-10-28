// Tests for the detailed BIM model (lib/bimplan.mjs): each building built from its floor-plan design (lib/plandesign.mjs),
// placed on the site plan where the building is. On options laid out on the review lots (scripts/layout-review.mjs):
// garden apartments, townhome rows, a retail strip with pads. Offline; with BIMCRAFT_CLI naming a built bimcraft-cli,
// the apartments are also built by BIMCraft (the whole script must run: one failed command fails the model).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), PD = await import('../lib/plandesign.mjs'), BP = await import('../lib/bimplan.mjs');
const { LOTS } = await import('../scripts/layout-review.mjs');
const BP_MM = 304.8;
const parse = l => { const i = l.indexOf(' '); return [l.slice(0, i), JSON.parse(l.slice(i + 1))]; };
const optionOf = (lot, ask) => { const plan = LOTS[lot].plan(), prog = S.guessProgram(ask), o = L.layoutOptions(plan, prog)[0]; return { ...plan, elements: o.elements, program: o.program || prog }; };

// ---- placement: a design's corners land on its building's corners, its front toward the parking ----
for (const rot of [0, 30, 90, 200]) {
  const e = { id: 'b', kind: 'building', use: 'retail', x: 100, y: 50, w: 120, d: 60, rot }, lot = { kind: 'parking', x: 100, y: -40, w: 200, d: 36, rot: 0 }, pl = PD.placement({ elements: [e, lot] }, e);
  const got = [pl.at(0, 0), pl.at(pl.W, 0), pl.at(pl.W, pl.D), pl.at(0, pl.D)], out = S.outline(e);
  for (const p of got) assert.ok(out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01), rot + '°: a design corner on the building\'s');
  const mid = pl.at(pl.W / 2, 0), back = pl.at(pl.W / 2, pl.D); assert.ok(Math.hypot(mid[0] - 100, mid[1] + 40) < Math.hypot(back[0] - 100, back[1] + 40), rot + '°: the front toward the parking');
}
// the parking, not a service drive behind, sets a shop's front (the strip's storefront faced its service drive)
{ const plan = optionOf('rect5', '25,000 sf retail strip with 2 pad sites'), e = plan.elements.find(x => x.kind === 'building' && x.use === 'retail'), pl = PD.placement(plan, e);
  const lots = plan.elements.filter(x => x.kind === 'parking'), d = p => Math.min(...lots.map(x => Math.hypot(x.x - p[0], x.y - p[1])));
  assert.ok(d(pl.at(pl.W / 2, 0)) < d(pl.at(pl.W / 2, pl.D)), 'the strip faces its parking'); }

// ---- the scripts ----
const cases = { apt: optionOf('rect5', '120 garden apartments, 3 stories, with a clubhouse and pool'), th: optionOf('rect5', '40 townhomes'), ret: optionOf('rect5', '25,000 sf retail strip with 2 pad sites') };
for (const [k, plan] of Object.entries(cases)) {
  const sc = BP.bimPlanScript(plan, { name: k }), cmds = sc.text.trim().split('\n').map(parse), body = cmds.slice(sc.head);
  const blds = plan.elements.filter(e => e.kind === 'building' && e.use !== 'garage');
  assert.equal(sc.buildings.length, blds.length, k + ': every building modelled'); assert.ok(sc.buildings.every(b => b.designed), k + ': every building from its design');
  const types = new Set(cmds.filter(([c]) => c === 'type').map(([, p]) => p.name)), mats = new Set(cmds.filter(([c]) => c === 'material').map(([, p]) => p.name));
  for (const [c, p] of body) { if (p.type) assert.ok(types.has(p.type) || c === 'railing', k + ': ' + c + ' type ' + p.type + ' made in the header'); }
  for (const [, p] of cmds.filter(([c]) => c === 'type' && true)) for (const l of p.layers || []) assert.ok(mats.has(l.material) || ['Metal', 'Timber', 'Concrete'].includes(l.material), k + ': material ' + l.material);
  for (const b of sc.buildings) {
    const mine = body.slice(b.first, b.first + b.n), e = blds.find(x => x.id === b.id), t = PD.buildingTypes(plan).find(t => t.elementIds.includes(b.id));
    assert.ok(mine.filter(([c]) => c === 'floor').length >= b.floors, k + ' ' + b.name + ': a slab a storey'); assert.ok(mine.some(([c]) => c === 'roof'), k + ' ' + b.name + ': roofed');
    assert.ok(mine.some(([c, p]) => c === 'wall' && p.type === BP.WALL_TYPES.partition.name), k + ' ' + b.name + ': interior walls from its rooms');
    // openings of a storey: none closer than its width to another on the same level (BIMCraft refuses the model)
    const ops = mine.filter(([c]) => c === 'door' || c === 'window').map(([, p]) => p);
    for (let i = 0; i < ops.length; i++) for (let j = i + 1; j < ops.length; j++) if (ops[i].level === ops[j].level) assert.ok(Math.hypot(ops[i].at[0] - ops[j].at[0], ops[i].at[1] - ops[j].at[1]) > 600, k + ' ' + b.name + ': openings apart');
    // every opening on the building's footprint or inside it (placed with the building)
    const ring = S.grow(S.outline(e), 8).map(([x, y]) => [(x - sc.origin[0]) * BP_MM, (y - sc.origin[1]) * BP_MM]);
    for (const p of ops) assert.ok(S.inRing(p.at, ring), k + ' ' + b.name + ': an opening at ' + p.at + ' outside the building');
    if (t.use === 'multifamily') { assert.ok(mine.some(([c]) => c === 'railing'), b.name + ': balconies'); assert.ok(mine.some(([c]) => c === 'stair'), b.name + ': breezeway stairs'); }
    if (t.use === 'townhomes') assert.ok(new Set(mine.filter(([c]) => c === 'wall').map(([, p]) => p.type)).size >= 4, b.name + ': the units in their own colours');
  }
  assert.equal(sc.rooms, k === 'ret', k + ': rooms named only on a small model');
}

// ---- built by BIMCraft (when the binary is here) ----
const cli = process.env.BIMCRAFT_CLI;
if (cli && fs.existsSync(cli)) {
  const sc = BP.bimPlanScript(cases.ret, { name: 'ret' }), f = fs.mkdtempSync('/tmp/bp-') + '/m.txt'; fs.writeFileSync(f, sc.text);
  const out = execFileSync(cli, ['run', '--script', f], { maxBuffer: 1 << 28 }).toString().trim().split('\n').map(l => JSON.parse(l));
  assert.ok(out.every(r => !r.error), 'BIMCraft builds the whole model'); console.log('bimplan: built by BIMCraft,', out.length, 'commands');
  const { runModel } = await import('../lib/bimrun.mjs'), r = await runModel(cases.ret, { name: 'ret', png: false });
  for (const q of r.quantities) { assert.ok(Math.abs(q.modelSf - q.gsf) <= Math.max(5, q.gsf * 0.02), q.name + ': model ' + q.modelSf + ' sf vs plan ' + q.gsf); assert.ok(q.glassSf > 0 && q.openings && Object.keys(q.walls).some(t => /partition/i.test(t)), q.name + ': glass, openings, interior walls in the takeoff'); }
} else console.log('bimplan: no BIMCRAFT_CLI, the build skipped');
console.log('bimplan ok');
