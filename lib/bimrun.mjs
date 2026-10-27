// Runs bimcraft-cli on a site plan option (lib/bim.mjs writes the script): the model as IFC (and .bimcraft), a 3D
// picture, and the quantities. Needs the binary: BIMCRAFT_CLI names it (the BIM worker, worker/bim/, builds one).
// Never called from npm test's offline tests; test/bim-cli.mjs runs it when the binary is there.
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bimScript, takeoff, SCHEDULES } from './bim.mjs';
import { bimPlanScript } from './bimplan.mjs';

export const cliPath = () => process.env.BIMCRAFT_CLI || 'bimcraft-cli';

// { ifc, bimcraft, png (Buffers, the png when asked), quantities, script, ms }
export async function runModel(plan, { name, every = false, detail = true, designs = {}, png = true, azimuth = 235, elevation = 30, width = 1600, height = 900, timeout = 120000 } = {}) {
  const t0 = Date.now(), dir = await mkdtemp(join(tmpdir(), 'bim-')), sc = detail ? bimPlanScript(plan, { name, designs }) : bimScript(plan, { name, every }); // (detail: each building from its floor-plan design, lib/bimplan.mjs; else the shells)
  try {
    await writeFile(join(dir, 'model.txt'), sc.text);
    const args = ['run', '--script', join(dir, 'model.txt')];
    for (const [, p] of SCHEDULES) args.push('--cmd', 'schedule ' + JSON.stringify(p));
    if (png) args.push('--cmd', 'render ' + JSON.stringify({ view: '{3D}', width, height, azimuth, elevation, path: join(dir, 'model.png') }));
    args.push('--save', join(dir, 'model.ifc'), '--save', join(dir, 'model.bimcraft'));
    const out = await new Promise((ok, bad) => execFile(cliPath(), args, { maxBuffer: 256 << 20, timeout }, (err, so, se) => err ? bad(new Error((se || err.message).trim().split('\n')[0])) : ok(so)));
    const res = out.split('\n').filter(Boolean).map(l => JSON.parse(l)), lines = sc.text.split('\n').filter(l => l && !l.startsWith('#')).length;
    // one reply a command, in order: the script's, then the schedules (the render and the saves after them)
    if (res.length < lines + SCHEDULES.length) throw new Error(`bimcraft-cli replied ${res.length} times to ${lines + SCHEDULES.length} commands`);
    const sched = Object.fromEntries(SCHEDULES.map(([k], i) => [k, res[lines + i]]));
    return { ifc: await readFile(join(dir, 'model.ifc')), bimcraft: await readFile(join(dir, 'model.bimcraft')), png: png ? await readFile(join(dir, 'model.png')) : null,
      quantities: takeoff(sc, res.slice(0, lines), sched), script: sc.text, ms: Date.now() - t0 };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
