// Robustness sweep of the deterministic layout runs (lib/layoutrun.mjs runBrief, the words path the bench uses) across
// many lot shapes and building types: about 300 runs, lot shape × request, each judged by the independent validator
// (lib/layoutcheck.mjs) and sorted into what went wrong, if anything. docs/LAYOUT-ENGINE.md item 42.
//   node scripts/layout-sweep.mjs [--out build/sweep] [--md docs/bench/layout-sweep.md] [--jobs 10] [--only <run id part>]
//                                 [--family rect-sq] [--type mf-garden] [--png] [--sample 48] [--timeout 120]
// Writes <out>/sweep.json (a row a run), <out>/plans.json (each run's top option), <out>/sheet.html (+ sheet.png with
// --png: a contact sheet of a fixed sample, Chrome at CHROME_PATH or the macOS default), and the summary table (--md).
// Deterministic: the lots are generated (no randomness), the requests fixed, the solver seed the brief's default; runs go
// out to --jobs child processes (each run alone in its process for the time it takes; a run past --timeout seconds is
// killed and recorded as a timeout).
// The lots: synthetic families (rectangles of several proportions and sizes 0.5-40 ac, L, T, U, wedges, trapezoids, flag
// lots, curved frontages, an easement or a wetland kept out, corner lots with two streets, rotated and skewed lots) and the
// traced real parcels in test/fixtures/real. The reviewed holdout projects (P35, P36, E054, P18) are not used here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SB = { front: 25, side: 10, rear: 20, paving: 10 };
const AC = 43560;

// ---------- lot shapes (feet; the street on edge 0 unless said) ----------
const areaOf = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const scaleTo = (r, ac) => { const k = Math.sqrt(ac * AC / areaOf(r)); return r.map(([x, y]) => [+(x * k).toFixed(2), +(y * k).toFixed(2)]); };
const rectR = asp => [[0, 0], [asp, 0], [asp, 1], [0, 1]]; // asp: frontage over depth
const fixed = r => r.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
export const FAMILIES = {
  'rect-sq': ac => ({ ring: scaleTo(rectR(1), ac) }),
  'rect-wide': ac => ({ ring: scaleTo(rectR(2), ac) }),
  'rect-deep': ac => ({ ring: scaleTo(rectR(0.4), ac) }),
  'rect-strip': ac => ({ ring: scaleTo(rectR(4), ac) }),
  L: ac => ({ ring: scaleTo([[0, 0], [1, 0], [1, 0.5], [0.5, 0.5], [0.5, 1], [0, 1]], ac) }),
  T: ac => ({ ring: scaleTo([[0, 0], [1.2, 0], [1.2, 0.45], [0.8, 0.45], [0.8, 1.1], [0.4, 1.1], [0.4, 0.45], [0, 0.45]], ac) }),
  U: ac => ({ ring: scaleTo([[0, 0], [1.2, 0], [1.2, 1], [0.84, 1], [0.84, 0.5], [0.36, 0.5], [0.36, 1], [0, 1]], ac) }),
  wedge: ac => ({ ring: scaleTo([[0, 0], [1, 0], [0, 0.85]], ac) }),
  trap: ac => ({ ring: scaleTo([[0, 0], [1.2, 0], [0.9, 0.85], [0.3, 0.85]], ac) }),
  flag: ac => { // a pole to the street (40 ft wide under 2 ac, else 60) and the body behind it
    const pw = ac < 2 ? 40 : 60, pl = Math.min(260, 60 + ac * 12), body = ac * AC - pw * pl, w = Math.sqrt(body * 1.3), d = body / w, x0 = -(w - pw) / 2;
    return { ring: fixed([[0, 0], [pw, 0], [pw, pl], [x0 + w, pl], [x0 + w, pl + d], [x0, pl + d], [x0, pl], [0, pl]]) }; },
  curve: ac => { const arc = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 - k * Math.PI * 0.5 / 10; arc.push([900 * Math.cos(a), -780 + 900 * Math.sin(a)]); } arc.reverse(); const r = arc.concat([[arc[arc.length - 1][0], 700], [arc[0][0], 700]]); return { ring: scaleTo(r, ac) }; },
  ease: ac => { const ring = scaleTo(rectR(1.4), ac), W = ring[1][0], D = ring[2][1], b = Math.min(50, D * 0.08); return { ring, keep: [{ name: 'Pipeline easement', ring: fixed([[0, D * 0.45], [W, D * 0.55], [W, D * 0.55 + b], [0, D * 0.45 + b]]) }] }; },
  wet: ac => { const ring = scaleTo(rectR(1.3), ac), W = ring[1][0], D = ring[2][1]; return { ring, keep: [{ name: 'Wetland', ring: fixed([[W * 0.55, D * 0.42], [W * 0.78, D * 0.37], [W * 0.84, D * 0.6], [W * 0.66, D * 0.74], [W * 0.55, D * 0.64]]) }] }; },
  corner: ac => ({ ring: scaleTo(rectR(1.3), ac), streets: [1] }),
  rot: ac => { const a = 0.4, r = scaleTo(rectR(1.5), ac); return { ring: fixed(r.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])) }; },
  skew: ac => ({ ring: scaleTo([[0, 0], [1, 0], [1.25, 0.8], [0.15, 0.75]], ac) })
};
export const FAM = Object.keys(FAMILIES);

// traced real parcels (test/fixtures/real; never the holdouts): rings in feet with the front and street edges from the
// compass sides the fixtures give
let S = null;
async function realLots() {
  S = S || await import(pathToFileURL(path.join(ROOT, 'lib/siteplan.mjs')).href);
  const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/real', f), 'utf8'));
  const dirs = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] };
  const edgeTo = (ring, c, ux = [1, 0], uy = [0, 1]) => { const d0 = dirs[c]; if (!d0) return null; const d = [d0[0] * ux[0] + d0[1] * uy[0], d0[0] * ux[1] + d0[1] * uy[1]];
    return ring.map((p, i) => ({ i, k: S.outwardOf(ring, i)[0] * d[0] + S.outwardOf(ring, i)[1] * d[1], L: S.edgeLen(ring, i) })).filter(e => e.k > 0.6).sort((a, b) => b.k - a.k || b.L - a.L)[0]?.i ?? null; };
  const out = {};
  for (const f of ['courtyard-apartments.json', 'garden-apartments.json', 'retail-corner.json']) { // outlines in feet round an origin, turned by angle
    const R = read(f), [lon0, lat0] = R.origin, a = R.angle * Math.PI / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)], kx = 364567 * Math.cos(lat0 * Math.PI / 180);
    const geo = ([fx, fy]) => [lon0 + (fx * ux[0] + fy * uy[0]) / kx, lat0 + (fx * ux[1] + fy * uy[1]) / 364567];
    const B = S.unionParcels([{ type: 'Polygon', coordinates: [R.parcel.concat([R.parcel[0]]).map(geo)] }]);
    const st = (Array.isArray(R.streets) ? R.streets : [R.streets]).map(c => edgeTo(B.ring, c, ux, uy)).filter(i => i != null);
    out['real-' + f.replace('.json', '')] = { ring: B.ring, origin: B.origin, front: edgeTo(B.ring, R.front, ux, uy), streets: st };
  }
  for (const f of ['old-houston-fm362.json', 'ralston-rd.json']) { // county outlines (lon / lat)
    const R = read(f), B = S.boundaryFrom(R.site), fr = edgeTo(B.ring, R.front);
    const st = String(R.streets || '').split('').map(c => edgeTo(B.ring, c)).filter(i => i != null && i !== fr);
    out['real-' + f.replace('.json', '')] = { ring: B.ring, origin: B.origin, front: fr, streets: [...new Set(st)] };
  }
  return out;
}

// ---------- requests ----------
// sized: one per building-type preset (lib/btypes.mjs PRESETS) and the shape presets, at a lot size suited to it (ac);
// want: what was asked, for the yield ratio (units or sf; keys as the preset's gross sf; null where the count isn't either)
export const SIZED = [
  ['mf-garden', '240 garden apartments, 3 stories', 14, { units: 240 }],
  ['mf-garden-studio', '180 studio apartments in 3-story garden buildings', 8, { units: 180 }],
  ['mf-walkup', '96 walk-up apartments', 6, { units: 96 }],
  ['mf-midrise', '200 mid-rise apartments, 4 stories', 7, { units: 200 }],
  ['mf-courtyard', 'courtyard apartments, 150 units', 8, { units: 150 }],
  ['mf-wrap', 'a wrap building with 300 apartments', 6, { units: 300 }],
  ['mf-tuck-under', 'tuck-under apartments, 100 units', 6, { units: 100 }],
  ['mf-podium-courtyard', 'a 5 over 2 courtyard on a podium, 250 units', 4, { units: 250 }],
  ['mf-podium', 'podium apartments, 200 units', 4, { units: 200 }],
  ['mf-tower-podium', 'tower on a podium, 10 stories, 300 apartments', 4, { units: 300 }],
  ['mf-townhome', '60 townhomes', 7, { units: 60 }],
  ['mf-stacked-townhome', 'stacked townhomes, 100 units', 7, { units: 100 }],
  ['mf-plex', 'duplexes, 60 units', 9, { units: 60 }],
  ['mf-cottage-btr', '80 build-to-rent cottages', 12, { units: 80 }],
  ['sfr-subdivision', '60 single-family homes', 15, { units: 60 }],
  ['ret-inline', '25,000 sf strip retail', 4, { gfa: 25000 }],
  ['ret-anchored', 'anchored shopping center with a 45,000 sf anchor, 90,000 sf total', 14, { gfa: 90000 }],
  ['ret-restaurant', 'a 6,000 sf sit-down restaurant', 1.5, { gfa: 6000 }],
  ['ret-drive-through', '2,800 sf fast food restaurant with a drive-thru', 1, { gfa: 2800 }],
  ['office', 'a 2-story office building, 40,000 sf', 5, { gfa: 40000 }],
  ['medical', 'medical office 15,000 sf', 2.5, { gfa: 15000 }],
  ['hotel', 'hotel 60,000 sf', 4, { gfa: 60000 }],
  ['church', 'a church with 500 seats', 6, null],
  ['venue', 'event venue 12,000 sf', 4, { gfa: 12000 }],
  ['ind-warehouse', 'warehouse with truck court, 150,000 sf', 14, { gfa: 150000 }],
  ['ind-cross-dock', 'cross-dock warehouse, 250,000 sf', 28, { gfa: 250000 }],
  ['flex-multi-tenant', 'multi-tenant flex buildings, 50,000 sf', 7, { gfa: 50000 }],
  ['storage', 'self storage, 80,000 sf', 5, { gfa: 80000 }],
  ['fuel', 'gas station with 8 pumps and a 4,500 sf store', 2, null],
  ['foodtrucks', 'a food truck park with 12 trucks', 1.5, null],
  ['mx-vertical', 'a 5-story mixed-use building with 15,000 sf ground-floor retail and 150 apartments above', 4, { units: 150 }],
  ['hotel-limited', 'a 4-story hotel with 110 rooms', 3, { gfa: 110 * 550 }],
  ['hotel-extended', 'extended-stay hotel, 100 suites', 3, { gfa: 100 * 650 }],
  ['storage-multi', '3-story climate controlled self storage, 90,000 sf', 3, { gfa: 90000 }],
  ['storage-single', 'single-story drive-up storage, 60,000 sf', 5, { gfa: 60000 }],
  ['mob', 'medical office building 40,000 sf', 4.5, { gfa: 40000 }],
  ['clinic', 'urgent care clinic', 1.2, null],
  ['senior-al', 'assisted living, 100 beds', 5, null],
  ['senior-il', 'independent senior living, 120 units', 6, { units: 120 }],
  ['student', 'student housing, 480 beds', 8, null],
  ['live-work', 'live-work townhomes, 24 units', 3.5, { units: 24 }],
  ['plex', 'fourplexes, 48 units', 8, { units: 48 }],
  ['flex-mezz', 'flex buildings with 25% mezzanine, 60,000 sf', 9, null],
  ['cold-storage', 'cold storage warehouse 150,000 sf', 16, { gfa: 150000 }],
  ['data-center', 'data center 80,000 sf', 8, { gfa: 80000 }],
  ['fitness', 'fitness center 40,000 sf', 6, { gfa: 40000 }],
  ['big-box', 'big box retail 100,000 sf', 13, { gfa: 100000 }],
  ['bank', 'bank with drive-thru', 1.2, null],
  ['daycare', 'a daycare for 120 children', 2.5, null],
  ['school', 'elementary school for 500 students', 12, null],
  ['car-wash', 'express car wash', 2.3, null],
  ['garage-standalone', 'parking garage, 400 spaces', 3, null],
  ['hotel-full', 'a full-service hotel with 200 keys', 6, { gfa: 200 * 1000 }],
  ['hotel-over-retail', 'a 100-key hotel over retail', 4, null],
  ['point-tower', 'a 14-story point tower with 180 apartments', 4, { units: 180 }],
  ['pad-village', 'a pad-site village with 5 pads', 4, null],
  ['mf-l', 'L-shaped 4-story apartments, 120 units', 7, { units: 120 }],
  ['mf-u', 'U building around a pool, 100 units', 7, { units: 100 }],
  ['mf-t', 'T-shaped 4-story apartments, 120 units', 7, { units: 120 }]
];
// as many as fit: the main housing types over a ladder of lot sizes, against a simple density expectation (homes a gross
// acre a plain layout of the type reaches with its parking: a yardstick, not a target)
export const FILL = [
  ['mf-garden', 'garden apartments, as many as fit', 18],
  ['mf-midrise', 'mid-rise apartments, 4 stories, as many as fit', 30],
  ['mf-townhome', 'townhomes, as many as fit', 9],
  ['mf-plex', 'duplexes, as many as fit', 7],
  ['mf-cottage-btr', 'build-to-rent cottages, as many as fit', 7],
  ['sfr-subdivision', 'single-family homes, as many as fit', 4]
];
const LADDER = [0.5, 1, 2, 3.5, 6, 10, 18, 30, 40];
export const MIXED = [
  ['mixed-retail-apts', '20,000 sf retail along the main road, 200 apartments behind', 16, null],
  ['mixed-hotel-retail', 'a hotel with 120 keys and 20,000 sf of retail', 7, null],
  ['mixed-pads-th', 'townhomes with a daycare and a bank on pads out front', 14, null],
  ['mixed-shops-th', '30,000 sf of shops in front, 60 townhomes behind', 12, null],
  ['mixed-office-pad', 'a 5,000 sf restaurant pad and a 40,000 sf office building', 7, null]
];
const REAL_ASKS = {
  'real-courtyard-apartments': [['mf-garden', 'garden apartments, as many as fit'], ['mf-midrise', 'mid-rise apartments, 4 stories, as many as fit'], ['ret-inline', '30,000 sf retail']],
  'real-garden-apartments': [['mf-garden', '400 garden apartments, 3 stories'], ['mf-townhome', 'townhomes, as many as fit'], ['ind-warehouse', 'warehouse with truck court, 200,000 sf']],
  'real-retail-corner': [['ret-anchored', 'grocery-anchored shopping center with a 50,000 sf anchor, 100,000 sf total'], ['mf-garden', 'garden apartments, as many as fit'], ['hotel-limited', 'a 5-story hotel with 140 keys']],
  'real-old-houston-fm362': [['mf-garden', 'garden apartments, as many as fit'], ['mixed-hotel-retail', 'a 120-key hotel and 20,000 sf of retail, parking behind the buildings'], ['storage', 'self storage, 100,000 sf']],
  'real-ralston-rd': [['mf-townhome', 'townhomes, as many as fit'], ['ind-warehouse', 'warehouse with truck court, 300,000 sf'], ['sfr-subdivision', 'single-family homes, as many as fit']]
};

// the runs, in a fixed order: each sized request on four lot families (the fourth at three quarters the size), each fill
// request up the size ladder on a family each step, each mixed request on three families, the real parcels
export function buildRuns(real) {
  const runs = [];
  SIZED.forEach(([type, ask, ac, want], i) => { for (let k = 0; k < 4; k++) { const fam = FAM[(i * 3 + k * 4) % FAM.length], a = +(ac * (k === 3 ? 0.75 : 1)).toFixed(2); runs.push({ id: type + '@' + fam + '-' + a, kind: 'sized', type, ask, family: fam, ac: a, want }); } });
  FILL.forEach(([type, ask, dpa], i) => LADDER.forEach((ac, j) => { const fam = FAM[(j * 5 + i * 3) % FAM.length]; runs.push({ id: type + '-fill@' + fam + '-' + ac, kind: 'fill', type, ask, family: fam, ac, dpa }); }));
  MIXED.forEach(([type, ask, ac], i) => { for (let k = 0; k < 3; k++) { const fam = FAM[(i * 7 + k * 5 + 2) % FAM.length]; runs.push({ id: type + '@' + fam + '-' + ac, kind: 'mixed', type, ask, family: fam, ac }); } });
  for (const [lot, list] of Object.entries(REAL_ASKS)) if (real[lot]) for (const [type, ask] of list) runs.push({ id: type + '@' + lot, kind: /as many/.test(ask) ? 'fill' : 'real', type, ask, family: 'real', lot, ac: +(areaOf(real[lot].ring) / AC).toFixed(2), dpa: FILL.find(f => f[0] === type)?.[2] || null });
  return runs;
}
export function planOf(run, real) {
  const L = run.lot ? real[run.lot] : FAMILIES[run.family](run.ac);
  return { origin: L.origin || [-96.42, 30.38], ring: L.ring, front: L.front ?? 0, streets: L.streets || [], setbacks: { ...SB },
    elements: (L.keep || []).map((k, i) => ({ id: 'ko' + (i + 1), kind: 'keepout', poly: k.ring, name: k.name, note: 'keep out', pinned: true })) };
}

// ---------- one run (in a worker) ----------
let M = null;
async function mods() {
  if (M) return M;
  const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
  M = { B: await imp('lib/layoutbrief.mjs'), RUN: await imp('lib/layoutrun.mjs'), SH: await imp('lib/sitesheet.mjs') };
  return M;
}
export async function runOne(run, real, { svg = false } = {}) {
  const { B, RUN, SH } = await mods(), p = planOf(run, real), t0 = Date.now();
  const row = { id: run.id, kind: run.kind, type: run.type, family: run.family, lot: run.lot || null, ac: run.ac, ask: run.ask };
  let brief, rec;
  try { brief = B.briefFromRequest(run.ask, p); } catch (e) { return { ...row, ms: Date.now() - t0, outcome: 'throw', where: 'brief', error: String(e?.stack || e).split('\n').slice(0, 4).join(' | ') }; }
  const E = brief.program?.engine || {}; row.read = E.btype || (brief.program?.uses || []).map(u => u.form || u.use).join('+');
  try { rec = RUN.runBrief(brief); } catch (e) { return { ...row, ms: Date.now() - t0, outcome: 'throw', where: 'run', error: String(e?.stack || e).split('\n').slice(0, 4).join(' | ') }; }
  row.ms = Date.now() - t0; row.outcome = rec.outcome; row.problems = (rec.problems || []).map(x => x.msg); row.engineError = rec.engineError || null;
  const top = rec.options?.[0];
  if (top) {
    const v = top.validation, q = top.quantities;
    Object.assign(row, { status: v.status, failed: v.failed, unknown: v.counts.unknown, warnings: v.checks.filter(c => !c.hard && c.status === 'fail').map(c => c.id), units: q.totals.units || 0, gfa: Math.round(q.totals.gfa || 0), parking: [q.parking.provided, q.parking.required], notes: top.notes || [], name: top.name, options: rec.options.length });
    if (run.want?.units) row.ratio = +(row.units / run.want.units).toFixed(3);
    else if (run.want?.gfa) row.ratio = +(row.gfa / run.want.gfa).toFixed(3);
    else if (run.dpa) row.ratio = +(row.units / (run.dpa * run.ac)).toFixed(3);
    if (svg) try { row.svg = SH.planSVG({ ...p, elements: top.elements, program: top.program }, { px: 360, pad: 12 }).svg; } catch (e) { row.svg = '<p>drawing failed: ' + String(e.message).slice(0, 80) + '</p>'; }
    row.top = { elements: top.elements, program: top.program };
  }
  return row;
}
// what went wrong, one kind a run: a throw or a timeout first, then an empty answer (said or not), then failed checks,
// then warnings, then a silly result (well under what was asked with nothing said, or a fill well under the yardstick)
export const SHORT_SAID = /\b(?:Fits about|Room for|short of|short:|won.t (?:fit|park)|land limit|doesn.t fit|don.t fit|couldn.t|no room|Only)\b/i;
export function classify(r) {
  if (r.outcome === 'throw') return 'throw';
  if (r.outcome === 'timeout') return 'timeout';
  if (!r.status) return r.problems?.length ? 'empty-said:' + r.outcome : 'empty-silent:' + r.outcome;
  const said = (r.notes || []).some(n => SHORT_SAID.test(n));
  if (r.failed?.length && r.failed.every(c => /^program\./.test(c))) return said ? 'program-short-said' : 'program-short-silent'; // (only the count or floor area asked missed: a land limit when it is said)
  if (r.failed?.length) return 'check-fail';
  if (r.warnings?.length) return 'warning';
  if (r.ratio != null && r.ratio < (r.kind === 'fill' ? 0.4 : 0.6)) return said ? 'short-said' : 'short-silent';
  return 'ok';
}

// ---------- the parent: deal the runs out to workers ----------
async function main() {
  const OUT = arg('--out') || 'build/sweep', MD = arg('--md'), JOBS = +(arg('--jobs') || Math.max(2, Math.min(12, os.cpus().length - 4))), TO = +(arg('--timeout') || 120) * 1000;
  const ONLY = arg('--only'), FAMQ = arg('--family'), TYPEQ = arg('--type'), PNG = process.argv.includes('--png'), SAMPLE = +(arg('--sample') || 48);
  const real = await realLots();
  let runs = buildRuns(real);
  if (ONLY) runs = runs.filter(r => r.id.includes(ONLY)); if (FAMQ) runs = runs.filter(r => r.family === FAMQ); if (TYPEQ) runs = runs.filter(r => r.type === TYPEQ);
  const sampleIds = new Set(runs.filter((r, i) => i % Math.max(1, Math.floor(runs.length / SAMPLE)) === 0).slice(0, SAMPLE).map(r => r.id));
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now(), rows = new Array(runs.length); let next = 0, done = 0;
  await new Promise(resolve => {
    const spawn = () => {
      if (next >= runs.length) { if (done >= runs.length) resolve(); return; }
      const w = fork(fileURLToPath(import.meta.url), ['--worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      let cur = -1, timer = null;
      const give = () => { if (next >= runs.length) { w.kill(); return; } cur = next++; timer = setTimeout(() => { rows[cur] = { id: runs[cur].id, kind: runs[cur].kind, type: runs[cur].type, family: runs[cur].family, lot: runs[cur].lot || null, ac: runs[cur].ac, ask: runs[cur].ask, outcome: 'timeout', ms: TO }; finish(); w.kill('SIGKILL'); spawn(); }, TO); w.send({ i: cur, run: runs[cur], svg: PNG && sampleIds.has(runs[cur].id) }); };
      const finish = () => { clearTimeout(timer); done++; const r = rows[cur]; process.stdout.write(String(done).padStart(4) + '/' + runs.length + ' ' + r.id.padEnd(46) + ' ' + classify(r).padEnd(24) + ' ' + (r.ms + 'ms').padStart(8) + (r.failed?.length ? ' ' + r.failed.join(',') : '') + (r.error ? ' ' + r.error.slice(0, 120) : '') + '\n'); if (done >= runs.length) resolve(); };
      w.on('message', m => { if (m.i !== cur) return; rows[cur] = m.row; finish(); give(); });
      w.on('exit', () => { if (cur >= 0 && !rows[cur]) { rows[cur] = { id: runs[cur].id, kind: runs[cur].kind, type: runs[cur].type, family: runs[cur].family, lot: runs[cur].lot || null, ac: runs[cur].ac, ask: runs[cur].ask, outcome: 'throw', where: 'process', error: 'worker exited', ms: 0 }; finish(); spawn(); } });
      give();
    };
    for (let k = 0; k < JOBS; k++) spawn();
  });
  for (const r of rows) r.class = classify(r);
  const plans = rows.map(r => ({ id: r.id, top: r.top || null })); for (const r of rows) delete r.top;
  fs.writeFileSync(path.join(OUT, 'sweep.json'), JSON.stringify(rows.map(({ svg, ...r }) => r), null, 1));
  fs.writeFileSync(path.join(OUT, 'plans.json'), JSON.stringify(plans));
  const wall = ((Date.now() - t0) / 1000).toFixed(0);
  const md = summary(rows, { wall, jobs: JOBS });
  if (MD) fs.writeFileSync(MD, md); fs.writeFileSync(path.join(OUT, 'sweep.md'), md);
  if (PNG) await sheet(rows.filter(r => sampleIds.has(r.id)), OUT);
  const c = count(rows, r => r.class.split(':')[0]);
  console.log('\n' + rows.length + ' runs in ' + wall + ' s on ' + JOBS + ' processes: ' + Object.entries(c).map(([k, v]) => k + ' ' + v).join(', ') + (MD ? '; ' + MD : ''));
}
const count = (rows, f) => rows.reduce((o, r) => { const k = f(r); o[k] = (o[k] || 0) + 1; return o; }, {});
const BAD = ['throw', 'timeout', 'empty-silent', 'check-fail', 'short-silent', 'program-short-silent'];
function summary(rows, { wall, jobs }) {
  const kinds = ['ok', 'warning', 'short-said', 'short-silent', 'program-short-said', 'program-short-silent', 'empty-said', 'empty-silent', 'check-fail', 'timeout', 'throw'], k0 = r => r.class.split(':')[0];
  const tbl = (key, label) => { const groups = [...new Set(rows.map(key))].sort(); return ['| ' + label + ' | runs | ' + kinds.join(' | ') + ' |', '|---|---|' + kinds.map(() => '---|').join('')].concat(groups.map(g => { const rs = rows.filter(r => key(r) === g), c = count(rs, k0); return '| ' + g + ' | ' + rs.length + ' | ' + kinds.map(k => c[k] || '').join(' | ') + ' |'; })).join('\n'); };
  const fails = count(rows.filter(r => r.failed?.length), r => r.failed.join(', ')), warns = count(rows.filter(r => r.warnings?.length), r => r.warnings.join(', '));
  const outc = count(rows, r => r.outcome + (r.status ? ' / top ' + r.status : ''));
  const ms = rows.map(r => r.ms || 0).sort((a, b) => a - b);
  const lines = ['# Layout robustness sweep', '', 'Generated by `node scripts/layout-sweep.mjs --md docs/bench/layout-sweep.md` (docs/LAYOUT-ENGINE.md item 42). ' + rows.length + ' runs (lot shape × request, the words path: lib/layoutbrief.mjs briefFromRequest then lib/layoutrun.mjs runBrief, each top option judged by lib/layoutcheck.mjs), ' + wall + ' s on ' + jobs + ' processes; run time median ' + ms[Math.floor(ms.length / 2)] + ' ms, slowest ' + ms[ms.length - 1] + ' ms. Synthetic lot families and the traced real parcels in test/fixtures/real; the holdout projects are not used.', '',
    'Kinds: **ok** (top option passes, no warning, the yield near what was asked), **warning** (a non-hard check fails), **program-short-said** / **program-short-silent** (the best option fails only on the count or floor area asked: a land limit, said in the notes or not), **short-said** / **short-silent** (top passes but under 60% of the count or floor area asked, or under 40% of the fill yardstick in homes a gross acre; said in the notes or not), **empty-said** / **empty-silent** (no option, with or without a problem said: unsupported, proven infeasible, nothing found), **check-fail** (the best option fails a hard check), **timeout**, **throw** (an exception out of the brief or the run). An engine error inside a generator that other generators covered is counted apart (engine errors below).', '',
    '## By kind', '', ...Object.entries(count(rows, r => r.class)).sort((a, b) => b[1] - a[1]).map(([k, v]) => '- ' + k + ': ' + v), '',
    '## Outcomes', '', ...Object.entries(outc).sort((a, b) => b[1] - a[1]).map(([k, v]) => '- ' + k + ': ' + v), '',
    '## By lot family', '', tbl(r => r.family, 'Family'), '', '## By request type', '', tbl(r => r.type, 'Type'), '', '## By run kind', '', tbl(r => r.kind, 'Kind'), '',
    '## Failed hard checks (top option)', '', ...(Object.keys(fails).length ? Object.entries(fails).sort((a, b) => b[1] - a[1]).map(([k, v]) => '- ' + k + ': ' + v) : ['- none']), '',
    '## Warnings (top option)', '', ...(Object.keys(warns).length ? Object.entries(warns).sort((a, b) => b[1] - a[1]).map(([k, v]) => '- ' + k + ': ' + v) : ['- none']), '',
    '## Engine errors caught inside a run', '', ...(rows.some(r => r.engineError) ? rows.filter(r => r.engineError).map(r => '- ' + r.id + ': ' + String(r.engineError).slice(0, 160)) : ['- none']), '',
    '## Runs needing a look', '', '| Run | Ask | Kind | Outcome | Top | Ratio | Detail |', '|---|---|---|---|---|---|---|',
    ...rows.filter(r => BAD.includes(k0(r)) || k0(r) === 'warning' || k0(r) === 'short-said' || k0(r) === 'empty-said').map(r => '| ' + [r.id, r.ask, r.class, r.outcome, r.status ? r.status + ' · ' + (r.units ? r.units + ' u' : (r.gfa || 0).toLocaleString('en-US') + ' sf') : '—', r.ratio ?? '—', (r.error || (r.failed || []).concat(r.warnings || []).join(', ') || (r.problems || [])[0] || (r.notes || []).find(n => /Fits about|Room for|short/i.test(n)) || '').replace(/\|/g, '/').slice(0, 160)].join(' | ') + ' |'), ''];
  return lines.join('\n');
}
async function sheet(rows, OUT) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:10px Arial;background:#fff;width:2320px}.g{display:grid;grid-template-columns:repeat(6,380px);gap:6px;padding:8px}.c{border:1px solid #ccc;padding:3px}.c svg{width:370px;height:auto;max-height:300px}.h{font-weight:bold}.f{color:#b00}.ok{color:#060}</style></head><body><div class="g">' +
    rows.map(r => '<div class="c"><div class="h">' + esc(r.id) + '</div><div>' + esc(r.ask) + '</div><div class="' + (r.class === 'ok' ? 'ok' : 'f') + '">' + esc(r.class + ' · ' + r.outcome + (r.status ? ' · ' + (r.units ? r.units + ' u' : (r.gfa || 0) + ' sf') + ' · pk ' + r.parking.join('/') + (r.ratio != null ? ' · ×' + r.ratio : '') + (r.failed?.length ? ' · ' + r.failed.join(',') : '') : ' · ' + (r.error || (r.problems || []).join('; ')).slice(0, 140))) + '</div>' + (r.svg || '') + '</div>').join('') + '</div></body></html>';
  fs.writeFileSync(path.join(OUT, 'sheet.html'), html);
  const puppeteer = (await import('puppeteer-core')).default, exe = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const b = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] }), pg = await b.newPage(); await pg.setViewport({ width: 2320, height: 1200 });
  await pg.goto(pathToFileURL(path.resolve(OUT, 'sheet.html')).href); await pg.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true }); await b.close();
}

if (process.argv.includes('--worker')) {
  const real = await realLots();
  process.on('message', async ({ i, run, svg }) => { let row; try { row = await runOne(run, real, { svg }); } catch (e) { row = { id: run.id, kind: run.kind, type: run.type, family: run.family, ac: run.ac, ask: run.ask, outcome: 'throw', where: 'sweep', error: String(e?.stack || e).slice(0, 400), ms: 0 }; } process.send({ i, row }); });
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
