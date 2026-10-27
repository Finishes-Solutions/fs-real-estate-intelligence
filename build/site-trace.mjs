// node build/site-trace.mjs <reference.json> <outdir>: a traced real site (frame feet) as a plan in the engine's format, drawn on our sheet
import * as SP from '../lib/siteplan.mjs'; import { planFor } from '../lib/mcp/siteplan.mjs'; import * as G from '../lib/sitesheet.mjs'; import { snapshots } from '../lib/pdf.mjs'; import fs from 'node:fs';
const R = JSON.parse(fs.readFileSync(process.argv[2])), out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const [lon0, lat0] = R.origin, a = R.angle * Math.PI / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)], kx = 364567 * Math.cos(lat0 * Math.PI / 180), ky = 364567;
const geo = ([fx, fy]) => { const e = fx * ux[0] + fy * uy[0], n = fx * ux[1] + fy * uy[1]; return [lon0 + e / kx, lat0 + n / ky]; };
const parcelLL = R.parcel.map(geo); const geom = { type: 'Polygon', coordinates: [parcelLL.concat([parcelLL[0]])] }; fs.writeFileSync(out + '/parcel.geojson', JSON.stringify(geom));
const { plan: p0 } = await planFor([{ label: 'parcel', geometry: geom }], [], ''); const site = { ...p0 };
const toPlan = ll => [(ll[0] - site.origin[0]) * 364567 * Math.cos(site.origin[1] * Math.PI / 180), (ll[1] - site.origin[1]) * 364567]; // (as the site's ring is in feet from its origin)
const chk = toPlan(parcelLL[0]), r0 = site.ring; console.log('origin check: parcel corner', chk.map(v => v.toFixed(1)), 'ring has', r0.map(p => p.map(v => v.toFixed(1)).join(',')).join(' | '));
const dirOf = c => ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] })[c], fr = c => { const d = dirOf(c); return site.ring.map((p, i) => ({ i, k: SP.outwardOf(site.ring, i)[0] * d[0] + SP.outwardOf(site.ring, i)[1] * d[1], L: SP.edgeLen(site.ring, i) })).filter(e => e.k > 0.6).sort((a, b) => b.L - a.L)[0]?.i; };
// (the compass directions are in the frame: E = +x of the frame. The front is the frame's +x lot line, the side streets by frame direction)
const frameDir = c => { const d = dirOf(c), e = d[0] * ux[0] + d[1] * uy[0], n = d[0] * ux[1] + d[1] * uy[1]; return site.ring.map((p, i) => ({ i, k: SP.outwardOf(site.ring, i)[0] * e + SP.outwardOf(site.ring, i)[1] * n, L: SP.edgeLen(site.ring, i) })).filter(x => x.k > 0.6).sort((a, b) => b.L - a.L)[0]?.i; };
site.front = frameDir(R.front); site.streets = (R.streets || []).map(frameDir).filter(i => i != null && i !== site.front);
let n = 0; const els = R.elements.map(e => { if (e.path || e.poly) { const pts = (e.path || e.poly).map(q => toPlan(geo(q)).map(v => +v.toFixed(2))), { path, poly, ...rest } = e, xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); return { id: 'r' + (++n), ...rest, ...(e.path ? { path: pts, width: e.width || 26, r: 0 } : { poly: pts }), x: +((Math.min(...xs) + Math.max(...xs)) / 2).toFixed(2), y: +((Math.min(...ys) + Math.max(...ys)) / 2).toFixed(2), w: +(Math.max(...xs) - Math.min(...xs)).toFixed(2), d: +(Math.max(...ys) - Math.min(...ys)).toFixed(2), rot: 0 }; }
  const [x0, x1, y0, y1] = e.box, c = toPlan(geo([(x0 + x1) / 2, (y0 + y1) / 2])), { box, ...rest } = e; const o = { id: 'r' + (++n), ...rest, x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: x1 - x0, d: y1 - y0, rot: R.angle + (e.rot || 0) };
  if (e.kind === 'building') { o.sf = o.w * o.d * (o.floors || 1); o.note = (o.note ? o.note + ' · ' : '') + Math.round(o.w) + ' × ' + Math.round(o.d) + ' ft · ' + o.sf.toLocaleString('en-US') + ' sf'; }
  if (e.kind === 'parking') { if (o.w < o.d) { o.rotL = 90; } o.row = 1; } return o; });
const prog = SP.guessProgram(R.ask), plan = { ...site, program: prog, elements: els, name: R.name };
const m = SP.metrics(plan); console.log('reference:', (SP.ringArea(site.ring) / 43560).toFixed(1), 'ac; buildings', Math.round(m.gfa), 'sf; stalls', m.spaces, '; FAR', (m.gfa / SP.ringArea(site.ring)).toFixed(2), '; front', site.front, 'streets', site.streets);
console.log('issues:', SP.check(plan).filter(i => i.level !== 'ok').map(i => i.level + ': ' + i.text).join(' | ').slice(0, 600));
fs.writeFileSync(out + '/plan.json', JSON.stringify({ ...plan, metrics: m }, null, 1));
const { svg } = G.planSVG(plan, { px: 1400, turn: 0 }), [shot] = await snapshots([svg], { px: 1400, quality: 85 }); fs.writeFileSync(out + '/plan.jpg', typeof shot === 'string' ? Buffer.from(shot.replace(/^data:[^,]*,/, ''), 'base64') : shot); console.log('wrote', out); process.exit(0);
