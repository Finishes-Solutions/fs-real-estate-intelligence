// node build/site-before-after.mjs <parcel.geojson> "<ask>" <front> <sides|-> <outdir> <old repo path> [title]: the same parcel and
// words laid out by the engine as it was (a checkout of an earlier commit) and as it is, drawn beside the aerial at one
// scale: aerial | before | now (a study tool: not part of the app)
import * as SP from '../lib/siteplan.mjs'; import { layoutOptions } from '../lib/sitelayout.mjs'; import * as G from '../lib/sitesheet.mjs'; import { snapshots } from '../lib/pdf.mjs'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const [pf, ask, frontC, sidesC, out, oldRepo, title] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const OLD = await import(path.resolve(oldRepo, 'lib/sitelayout.mjs')), OLDS = await import(path.resolve(oldRepo, 'lib/siteplan.mjs'));
const geom0 = JSON.parse(fs.readFileSync(pf)), geom = geom0.geometry || (geom0.features ? geom0.features[0].geometry : geom0);
const dirOf = c => { const [l, a] = c.split('@'), d = ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] })[l], t = (+a || 0) * Math.PI / 180; return [d[0] * Math.cos(t) - d[1] * Math.sin(t), d[0] * Math.sin(t) + d[1] * Math.cos(t)]; };
const edgeTo = (ring, c) => { const d = dirOf(c); return ring.map((p, i) => ({ i, k: SP.outwardOf(ring, i)[0] * d[0] + SP.outwardOf(ring, i)[1] * d[1], L: SP.edgeLen(ring, i) })).filter(e => e.k > 0.6).sort((a, b) => b.k - a.k || b.L - a.L)[0]?.i; };
const b = SP.boundaryFrom(geom), plan = { id: 'ba', name: 'A', origin: b.origin, ring: b.ring, frontGuess: false, setbacks: { ...SP.SETBACKS }, program: { use: 'retail' }, elements: [], zones: [] };
plan.front = edgeTo(plan.ring, frontC); plan.streets = sidesC && sidesC !== '-' ? sidesC.split(',').map(c => edgeTo(plan.ring, c)).filter(i => i != null && i !== plan.front) : [];
const run = (L, S, label) => { const prog = S.guessProgram(ask), t0 = Date.now(); let os = []; try { os = L.layoutOptions(plan, prog, { count: 3 }); } catch (e) { console.log(label, 'failed:', e.message); } const o = os[0]; if (!o) return null;
  const p = { ...plan, program: o.program, elements: o.elements, zones: o.zones || [] }, m = S.metrics(p), bad = S.check(p).filter(i => i.level === 'bad').map(i => i.text);
  console.log(label + ': ' + (o.label || o.name) + ' · ' + (m.units ? m.units + ' du · ' : '') + Math.round(m.gfa || 0).toLocaleString('en-US') + ' sf · ' + m.spaces + ' of ' + m.required + ' stalls · ' + (m.pond ? m.pond.toFixed(2) + ' ac pond · ' : '') + (Date.now() - t0) + ' ms' + (bad.length ? ' · BAD: ' + bad.slice(0, 2).join('; ') : '')); return p; };
const before = run(OLD, OLDS, 'before'), now = run({ layoutOptions }, SP, 'now');
const draw = async (p, f) => { if (!p) return null; const svg = G.planSVG(p, { px: 1400, turn: 0 }).svg, [shot] = await snapshots([svg], { px: 1400, quality: 85 }); fs.writeFileSync(f, typeof shot === 'string' ? Buffer.from(shot.replace(/^data:[^,]*,/, ''), 'base64') : shot); return f; };
const fB = await draw(before, out + '/before.jpg'), fN = await draw(now, out + '/now.jpg');
// the aerial round the parcel's middle (public satellite tiles), its bounds from the tool's output
const c = SP.frame(plan.origin).toLL(SP.centroid(plan.ring)), acres = SP.ringArea(plan.ring) / 43560, z = acres > 60 ? 16 : acres > 12 ? 17 : 18, n = acres > 60 ? 5 : 7;
const log = execFileSync('node', ['build/site-aerial.mjs', String(c[1]), String(c[0]), String(z), out + '/aerial.jpg', String(n)], { env: process.env }).toString(), bounds = /BOUNDS (\{.*\})/.exec(log)?.[1];
fs.writeFileSync(out + '/parcel.geojson', JSON.stringify(geom));
if (bounds && fN) execFileSync('node', ['build/site-compare.mjs', out + '/parcel.geojson', out + '/aerial.jpg', bounds, fN, out + '/compare.jpg', 'Aerial', 'Engine now', ...(fB ? [fB, 'Engine before'] : [])], { stdio: 'inherit', env: process.env });
process.exit(0);
