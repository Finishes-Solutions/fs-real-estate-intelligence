// node build/site-layout.mjs <parcel.geojson> "<ask>" <outdir>: a real parcel laid out as the MCP would (a study tool: not part of the app)
if (process.env.SP_DEBUG) globalThis.SP_DEBUG = true;
import * as SP from '../lib/siteplan.mjs'; import { layoutOptions } from '../lib/sitelayout.mjs'; import { planFor } from '../lib/mcp/siteplan.mjs'; import * as G from '../lib/sitesheet.mjs'; import { snapshots } from '../lib/pdf.mjs'; import fs from 'node:fs';
const geom = JSON.parse(fs.readFileSync(process.argv[2])), out = process.argv[4]; fs.mkdirSync(out, { recursive: true });
const { plan: p0 } = await planFor([{ label: 'parcel', geometry: geom }], [], ''); const site = { ...p0 }; const prog = SP.guessProgram(process.argv[3]);
// optional: the front and side streets by compass direction of the lot line's outward normal (E N S W), e.g. "E" "N,S"
// (a letter, or letter@angle for a site whose grid is turned: E@48 is 48° counter-clockwise from east; the edge whose outward normal matches best)
const dirOf = c => { const [l, a] = c.split('@'), d = ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] })[l], t = (+a || 0) * Math.PI / 180; return [d[0] * Math.cos(t) - d[1] * Math.sin(t), d[0] * Math.sin(t) + d[1] * Math.cos(t)]; }, edgeTo = c => { const d = dirOf(c); return site.ring.map((p, i) => ({ i, k: SP.outwardOf(site.ring, i)[0] * d[0] + SP.outwardOf(site.ring, i)[1] * d[1], L: SP.edgeLen(site.ring, i) })).filter(e => e.k > 0.6).sort((a, b) => b.k - a.k || b.L - a.L)[0]?.i; };
if (process.argv[6]) site.front = edgeTo(process.argv[6]); if (process.argv[7]) site.streets = process.argv[7].split(',').map(edgeTo).filter(i => i != null && i !== site.front);
if (process.argv[8] === 'hold') site.params = { ...(site.params || {}), fill: false }; // (Leftover land: hold it, build only what was asked)
console.log('program', JSON.stringify(prog).slice(0, 200));
console.log('acres', (SP.ringArea(site.ring) / 43560).toFixed(1), 'front', site.front, 'streets', JSON.stringify(site.streets));
const os = layoutOptions(site, prog, { count: +(process.argv[5] || 3) }).slice(0, +(process.argv[5] || 2)), svgs = os.map(o => G.planSVG({ ...site, program: o.program, elements: o.elements, zones: o.zones }, { px: 1400, turn: 0 }).svg), shots = await snapshots(svgs, { px: 1400, quality: 85 });
os.forEach((o, i) => { const p = { ...site, program: o.program, elements: o.elements }, m = SP.metrics(p), sh = shots[i]; fs.writeFileSync(out + '/' + (i + 1) + '.jpg', typeof sh === 'string' ? Buffer.from(sh.replace(/^data:[^,]*,/, ''), 'base64') : sh); console.log(i + 1, o.name, '|', m.units || '', 'du', Math.round(m.gfa || 0), 'sf |', SP.check(p).filter(x => x.level !== 'ok').map(x => x.text).join('; ').slice(0, 200), '|', (o.notes || []).join(' / ').slice(0, 200)); });
process.exit(0);
