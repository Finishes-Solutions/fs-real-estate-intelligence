// node build/site-parcels.mjs <spec.json>: a site of several parcels laid out parcel by parcel, each with its own words and
// street side, drawn as one plan with the parcel lines, beside the aerial at the same scale (a study tool: not part of the app)
// spec: { site: parcel.geojson (the whole), parts: [{ parcel, name, ask, front, sides, pick }], aerial, bounds, out, title }
import * as SP from '../lib/siteplan.mjs'; import { layoutOptions, layoutGallery } from '../lib/sitelayout.mjs'; import * as GEN from '../lib/sitegen.mjs'; import { planFor } from '../lib/mcp/siteplan.mjs'; import * as G from '../lib/sitesheet.mjs'; import { snapshots } from '../lib/pdf.mjs'; import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const spec = JSON.parse(fs.readFileSync(process.argv[2])), out = spec.out; fs.mkdirSync(out, { recursive: true });
const dirOf = c => { const [l, a] = c.split('@'), d = ({ E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] })[l], t = (+a || 0) * Math.PI / 180; return [d[0] * Math.cos(t) - d[1] * Math.sin(t), d[0] * Math.sin(t) + d[1] * Math.cos(t)]; };
const edgeTo = (ring, c) => { const d = dirOf(c); return ring.map((p, i) => ({ i, k: SP.outwardOf(ring, i)[0] * d[0] + SP.outwardOf(ring, i)[1] * d[1], L: SP.edgeLen(ring, i) })).filter(e => e.k > 0.6).sort((a, b) => b.k - a.k || b.L - a.L)[0]?.i; };
const { plan: site } = await planFor([{ label: 'site', geometry: JSON.parse(fs.readFileSync(spec.site)) }], [], ''); const FO = SP.frame(site.origin);
const zones = [], elements = [], progs = [], lines = [];
for (const [i, part] of spec.parts.entries()) {
  const geom = JSON.parse(fs.readFileSync(part.parcel)), { plan: p0 } = await planFor([{ label: part.name, geometry: geom }], [], ''), sub = { ...p0 }; const prog = SP.guessProgram(part.ask);
  if (part.front) sub.front = edgeTo(sub.ring, part.front); if (part.sides) sub.streets = part.sides.split(',').map(c => edgeTo(sub.ring, c)).filter(k => k != null && k !== sub.front);
  const np = SP.normalizeProgram(prog), t0 = Date.now(), list = GEN.covers(np) ? layoutGallery(sub, prog, { budgetMs: 30000 }) : layoutOptions(sub, prog, { count: 4 }), o = list[part.pick || 0] || list[0];
  if (!o) { console.log(part.name, 'no layout'); continue; }
  const FI = SP.frame(sub.origin), to = p => FO.toFt(FI.toLL(p)).map(v => +v.toFixed(2)); // the part's frame to the site's
  for (const e0 of o.elements) { const e = { ...e0, zone: i }; [e.x, e.y] = to([e.x, e.y]); for (const k of ['path', 'poly', 'cl']) if (e[k]) e[k] = e[k].map(to); if (e.mouth) e.mouth = to(e.mouth); elements.push(e); }
  const ring = (geom.geometry || geom).coordinates[0].slice(0, -1).map(ll => FO.toFt(ll).map(v => +v.toFixed(2)));
  zones.push({ name: part.name, use: np.use, zone: i, ring, acres: +(SP.ringArea(ring) / 43560).toFixed(2) }); progs.push({ ...prog, name: part.name });
  const m = SP.metrics({ ...sub, program: o.program, elements: o.elements });
  lines.push((i + 1) + '. ' + part.name + ' (' + zones[i].acres + ' ac): ' + (o.label || o.name) + ' · ' + Math.round(m.gfa).toLocaleString('en-US') + ' sf · ' + m.spaces + ' of ' + m.required + ' stalls · ' + list.length + ' layouts in ' + (Date.now() - t0) + ' ms' + (o.bad?.length ? ' · BAD: ' + o.bad.join('; ') : ''));
}
const plan = { ...site, program: { use: progs[0]?.use || 'retail', zones: progs.map(p => ({ ...p, partName: p.name })) }, zones, elements, name: spec.title || 'Site' };
console.log(lines.join('\n'));
const svg = G.planSVG(plan, { px: 1600, turn: 0 }).svg, [shot] = await snapshots([svg], { px: 1600, quality: 88 }); const pf = out + '/plan.jpg'; fs.writeFileSync(pf, typeof shot === 'string' ? Buffer.from(shot.replace(/^data:[^,]*,/, ''), 'base64') : shot);
fs.writeFileSync(out + '/plan.json', JSON.stringify(plan));
if (spec.aerial) { execFileSync('node', ['build/site-compare.mjs', spec.site, spec.aerial, JSON.stringify(spec.bounds), pf, out + '/compare.jpg', 'Aerial', spec.title || 'Ours'], { stdio: 'inherit', env: process.env }); }
process.exit(0);
