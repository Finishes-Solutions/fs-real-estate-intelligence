// Tests for the BIM model of a site plan option (lib/bim.mjs), on options laid out on a real lot (the 7.7-acre lot of
// test/sitelayout.mjs) and a 20-acre mixed-use tract: the script's levels, walls drawn to face out, a slab a storey, a
// roof on each building, openings kept apart, homes of one plan modelled once. Offline. With BIMCRAFT_CLI naming a
// built bimcraft-cli (see worker/bim/Dockerfile), each option is also built by BIMCraft and its floor areas checked
// against the plan's, and the BIM worker answers over HTTP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const S = await import('../lib/siteplan.mjs'), L = await import('../lib/sitelayout.mjs'), B = await import('../lib/bim.mjs');

const mk = (o, pts) => { const k = 364567 * Math.cos(o[1] * Math.PI / 180); return { type: 'Polygon', coordinates: [pts.concat([pts[0]]).map(([x, y]) => [o[0] + x / k, o[1] + y / 364567])] }; };
const siteOf = g => { const b = S.unionParcels([g]); return { ...b, front: b.ring.findIndex((p, i) => S.outwardOf(b.ring, i)[0] < -0.9), setbacks: { ...S.SETBACKS } }; };
const lot = siteOf(mk([-95.98, 30.06], [[0, 0], [920, 0], [920, 259], [822, 259], [822, 378], [0, 378]]));
const tract = siteOf(mk([-95.6954, 29.6657], [[0, 0], [716, 25], [759, 1244], [-47, 1219]]));
const optionOf = (plan, prog) => { const o = L.layoutOptions(plan, prog)[0]; return { ...plan, elements: o.elements }; };
const parse = l => { const i = l.indexOf(' '); return [l.slice(0, i), JSON.parse(l.slice(i + 1))]; };

const plans = {
  retail: optionOf(lot, { use: 'retail', gfa: 40000 }), office: optionOf(lot, { use: 'office' }), industrial: optionOf(lot, { use: 'industrial' }),
  townhomes: optionOf(lot, { use: 'townhomes' }), sfr: optionOf(lot, { use: 'sfr' }),
  mixed: optionOf(tract, S.guessProgram('37,700 sf retail with 2 pads, 120 apartments, 18 townhomes and 12 duplex units'))
};

for (const [k, plan] of Object.entries(plans)) {
  const sc = B.bimScript(plan, { name: k }), cmds = sc.text.trim().split('\n').map(parse), body = cmds.slice(sc.head);
  const blds = plan.elements.filter(e => e.kind === 'building' && e.use !== 'garage');
  // every building is in the model, or counted in a home plan that is; every one has walls, a slab a storey and a roof
  assert.equal(sc.buildings.reduce((s, b) => s + b.count, 0), blds.length, k + ': buildings counted');
  for (const b of sc.buildings) {
    const mine = body.slice(b.first, b.first + b.n), walls = mine.filter(([c, p]) => c === 'wall' && p.closed);
    assert.equal(walls.length, b.floors, k + ': ' + b.name + ' a wall loop a storey');
    assert.equal(mine.filter(([c]) => c === 'floor').length, b.floors, k + ': ' + b.name + ' a slab a storey');
    assert.ok(mine.some(([c]) => c === 'roof'), k + ': ' + b.name + ' roofed');
    for (const [, p] of walls) assert.ok(S.signedArea(p.points) < 0, k + ': ' + b.name + ' walls clockwise, so they face out');
    // openings of a storey at least a foot apart along their wall (BIMCraft refuses overlaps)
    const ops = mine.filter(([c]) => c === 'window' || c === 'door').map(([c, p]) => ({ ...p, w: B.OPENINGS[Object.keys(B.OPENINGS).find(o => B.OPENINGS[o].name === p.type)].size[0] * B.MM }));
    for (let i = 0; i < ops.length; i++) for (let j = i + 1; j < ops.length; j++) if (ops[i].level === ops[j].level)
      assert.ok(Math.hypot(ops[i].at[0] - ops[j].at[0], ops[i].at[1] - ops[j].at[1]) >= (ops[i].w + ops[j].w) / 2 + 200 || Math.abs(ops[i].at[0] - ops[j].at[0]) > 1 && Math.abs(ops[i].at[1] - ops[j].at[1]) > 1, k + ': ' + b.name + ' openings overlap at ' + ops[i].at);
  }
  // levels: one an elevation, every one a wall stands on exists
  const levels = new Set(['Ground', ...cmds.filter(([c]) => c === 'level').map(([, p]) => p.name), cmds.find(([c, p]) => c === 'modify' && p.id === 100001)[1].name]);
  for (const [c, p] of body) if (p.level) assert.ok(levels.has(p.level), k + ': ' + c + ' on a level that exists: ' + p.level);
}
// uses get their own shell: a warehouse docks on its truck court, homes get hipped roofs, townhomes party walls
{
  const w = B.bimScript(plans.industrial), wb = w.text.split('\n').filter(l => /Dock door/.test(l) && l.startsWith('door'));
  assert.ok(wb.length >= 6, 'warehouse dock doors: ' + wb.length);
  const truck = plans.industrial.elements.find(e => e.kind === 'truck'), c = S.centroid(S.shapeOf(truck)), b = w.buildings[0], i = b.dock, m = [(b.ring[i][0] + b.ring[(i + 1) % b.ring.length][0]) / 2, (b.ring[i][1] + b.ring[(i + 1) % b.ring.length][1]) / 2];
  assert.ok(Math.hypot(m[0] - c[0], m[1] - c[1]) < Math.max(...b.ring.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]))), 'docks on the side toward the truck court');
  assert.ok(B.bimScript(plans.sfr).text.split('\n').some(l => l.startsWith('roof') && JSON.parse(l.slice(5)).slope === B.HIP), 'homes have hipped roofs');
  // shops' storefronts face their parking: the front wall's outside points at the nearest parking row
  for (const b of B.bimScript(plans.retail).buildings) {
    const a = b.ring[b.front], e = b.ring[(b.front + 1) % b.ring.length], m = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2], n = [-(e[1] - a[1]), e[0] - a[0]];
    const p = plans.retail.elements.filter(x => x.kind === 'parking').map(x => S.centroid(S.shapeOf(x))).sort((u, v) => Math.hypot(u[0] - m[0], u[1] - m[1]) - Math.hypot(v[0] - m[0], v[1] - m[1]))[0];
    assert.ok((p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] > 0, 'retail: ' + b.name + ' storefront faces its parking');
  }
  // tiny homes' doors on their street, not a long side: a row and a corner of the King Rd Project (134 tiny homes, 16 × 34
  // ft on 25 ft lots, 28 ft private streets), as saved in the team's projects
  {
    const streets = [[[123.1, 477.1], [9.6, 487.3]], [[241.6, 777], [173.8, 536.6], [123.1, 477.1], [55, -280.9], [55, -603]], [[85.5, 58.8], [-85, 74.1], [-85, -603], [55, -603]]].map((path, i) => ({ kind: 'drive', id: 'd' + i, path, width: 28 }));
    const homes = [[99.2, -608.8, 90], [99.2, -583.8, 90], [99.2, -558.8, 90], [-129.2, -608.8, 90], [-129.2, -583.8, 90], [-40.8, -570.8, 90], [10.8, -570.8, 90], [-94.2, -647.2, 0], [5.8, -647.2, 0], [102.6, -245.7, 84.9], [80, 525.3, 174.9], [55.1, 527.6, 174.9]]
      .map(([x, y, rot], i) => ({ kind: 'building', id: 'h' + i, name: 'Lot ' + i, use: 'sfr', x, y, w: 16, d: 34.375, rot, floors: 1, units: 1, sf: 550, note: 'Tiny home · 1-story · 550 sf' }));
    const near = p => Math.min(...streets.flatMap(e => e.path.slice(1).map((b, i) => { const a = e.path[i], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]); })));
    const bl = B.bimBuildings({ elements: [...homes, ...streets], program: { garage: false } }, { every: true }), mid = (r, i) => [(r[i][0] + r[(i + 1) % 4][0]) / 2, (r[i][1] + r[(i + 1) % 4][1]) / 2];
    assert.equal(bl.length, homes.length, 'every home its own model');
    for (const b of bl) assert.ok(near(mid(b.ring, b.front)) <= Math.min(...[0, 1, 2, 3].map(i => near(mid(b.ring, i)))) + 0.01, b.name + ' door faces its street');
    assert.ok(bl.every(b => b.garageSf === 0), 'no garage on a tiny home');
  }
  const t = B.bimScript(plans.townhomes); assert.ok(t.text.includes(B.WALLS.party.name + '"') && t.text.split('\n').filter(l => l.includes('"type":"' + B.WALLS.party.name)).length > 0, 'townhome party walls');
  assert.ok(t.buildings.length < plans.townhomes.elements.filter(e => e.use === 'townhomes').length, 'townhome rows of one size modelled once');
}
// takeoff: element ids from the replies, mapped to their building; walls net of their openings
{
  const sc = { head: 1, buildings: [{ name: 'A', use: 'retail', floors: 1, gsf: 1000, count: 1, garageSf: 0, first: 0, n: 3 }] }, F = B.MM;
  const res = [{}, { ids: [11, 12] }, { id: 13 }, { id: 14 }];
  const sched = {
    walls: { columns: ['Type', 'Length', 'Height'], rows: [['W', 10 * F, 20 * F], ['W', 10 * F, 20 * F]], elements: [[11], [12]] },
    windows: { columns: ['Type', 'Width', 'Height', 'Wall'], rows: [['G', 5 * F, 4 * F, 11]], elements: [[13]] },
    doors: { columns: ['Type', 'Width', 'Height', 'Wall'], rows: [], elements: [] },
    floors: { columns: ['Type', 'Area (m²)'], rows: [['S', 1000 / B.SF_M2]], elements: [[14]] }, roofs: { columns: ['Type', 'Plan Area'], rows: [], elements: [] }
  };
  const [q] = B.takeoff(sc, res, sched);
  assert.equal(q.walls.W, 380); assert.equal(q.glassSf, 20); assert.equal(q.modelSf, 1000); assert.equal(q.wallToFloor, 0.4); assert.equal(q.glazing, 0.05);
}
console.log('bim script ok');

// ---- with the binary: BIMCraft builds each option, floor areas match the plan's, the worker answers ----
const cli = process.env.BIMCRAFT_CLI;
if (!cli || !fs.existsSync(cli)) console.log('bim: BIMCRAFT_CLI not set, skipped building the models');
else {
  const { runModel } = await import('../lib/bimrun.mjs');
  for (const [k, plan] of Object.entries(plans)) {
    const r = await runModel(plan, { name: k, png: k === 'retail', detail: false }); // (the shells: their areas follow the plan's; the detailed models, test/bimplan.mjs)
    assert.ok(r.ifc.toString().startsWith('ISO-10303-21'), k + ': an IFC file');
    for (const q of r.quantities) {
      // commercial and apartments to the sf; homes: the model counts the garage and porch the plan's living area leaves out
      if (['sfr', 'duplex'].includes(q.use)) assert.ok(q.modelSf >= q.gsf && q.modelSf <= (q.gsf + q.garageSf) * 1.3, k + ': ' + q.name + ' ' + q.modelSf + ' vs ' + q.gsf);
      else assert.ok(Math.abs(q.modelSf - q.gsf) <= Math.max(2, q.gsf * 0.01), k + ': ' + q.name + ' model ' + q.modelSf + ' sf vs plan ' + q.gsf);
      assert.ok(q.wallToFloor > 0.1 && q.wallToFloor < 3, k + ': ' + q.name + ' wall-to-floor ' + q.wallToFloor);
      assert.ok(Object.values(q.roofs).reduce((s, v) => s + v, 0) > 0, k + ': ' + q.name + ' roof area');
    }
    console.log('bim', k, r.quantities.length, 'models', r.ms + ' ms');
  }
  process.env.BIM_WORKER_TOKEN = 't0ken';
  const { server } = await import('../worker/bim/server.mjs');
  await new Promise(ok => server.listen(0, ok)); const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/model', { method: 'POST', body: '{}' })).status, 401);
  const r = await fetch(url + '/model', { method: 'POST', headers: { authorization: 'Bearer t0ken' }, body: JSON.stringify({ plan: plans.retail, png: false }) }), j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j).slice(0, 200)); assert.ok(Buffer.from(j.ifc, 'base64').toString().startsWith('ISO-10303-21')); assert.equal(j.quantities.length, 2);
  assert.equal((await fetch(url + '/health')).status, 200);
  server.close();
  console.log('bim worker ok');
}
