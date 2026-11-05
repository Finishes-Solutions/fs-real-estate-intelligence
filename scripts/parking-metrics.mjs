// Parking layout quality, measured on drawn plans (planning-level measures, not code checks):
//   node scripts/parking-metrics.mjs [--in build/bench-v2/plans.json] [--md out.md] [--json out.json] [--only <id>]
// plans.json is what scripts/layout-bench-v2.mjs writes: each case's site and its top option. parkingMetrics(plan) is
// exported for other scripts. Per plan:
//   stalls          surface stalls drawn (stall marks: lib/siteplan.mjs stallCentres), garages and driveways not counted
//   sfStall         lot paving per stall: stall rows (planted end caps and islands left out) + drive paving within 26 ft
//                   of a row + field paving, ÷ stalls
//                   (a surface lot is usually 300-350 sf a stall on 9 x 18 ft stalls and 24 ft aisles)
//   surplus         paving under no stall row and no drive (field paving left over at row and aisle ends), sf and share
//   maxRun / long   the longest run of stalls side by side with no planted island (rows meeting end to end are one run),
//                   and how many runs pass 15 (common landscape codes: an island every 10-15 stalls)
//   bareEnds        runs of 4 or more 90° stalls whose end has no planted island (common code: rows end in islands)
//   deadEnd         aisles that stop with stalls past the last drive joining them (lib/siteplan.mjs deadEnds):
//                   how many; and (lib/layoutrun.mjs longDeadAisles, as the validator's parking.dead-end-aisle) how
//                   many have stalls more than 150 ft past the last join, an end clear of stalls not taken as a way out
//   walk            stall centre to the nearest wall of the nearest building (the clubhouse left out), ft: median, 90th percentile, max (a
//                   building's door is somewhere on its walls, so this is the least walk; real walks are longer)
//   walkBld90       walk per building: each building's share of the stalls (by floor area: footprint x floors), the
//                   nearest that many; the worst building's 90th percentile, and how many buildings pass 200 ft (walkBld200)
//   throat          the shortest entrance throat: ft in from the street before a stall backs into the entry drive
//                   (throatX: before a drive crosses it; lib/layoutrun.mjs entryThroats), against throatNeed (50 / 75 / 100 ft for a lot
//                   of under 200 / under 500 / 500 or more stalls), and entryStalls: stalls inside that length
//   ada             accessible stalls placed (lib/siteplan.mjs accessible) against 2010 ADA 208.2 for the stalls drawn,
//                   and how much farther from a building they are, on average, than the same number of nearest stalls
//   tiny            stall rows of 1-4 stalls (parallel guest stalls and RV stalls left out)
//   skew            stall rows not square or parallel to the plan's main row direction (more than 3° off, mod 90°)
//   orphan          stall rows with no drive or field paving along either long side
//   landPct/perTree landscape inside the lot: the planted end caps and islands as drawn, a share of them and the lot paving,
//                   and stalls per tree (one in each); landStd 1 where a lot of LAND_MIN stalls or more meets LAND_PCT % and a
//                   tree every LAND_PER_TREE stalls, 0 where not, empty under LAND_MIN
import fs from 'node:fs';
import * as S from '../lib/siteplan.mjs';
import { longDeadAisles, entryThroats, throatNeed } from '../lib/layoutrun.mjs';

const RAD = Math.PI / 180;
// a typical parking-lot landscape standard (planning yardstick; local codes vary): lots of LAND_MIN stalls or more plant
// LAND_PCT % of the lot's interior and a shade tree every LAND_PER_TREE stalls (e.g. Redmond, WA RZC 21.32: 5% for 20-150
// stalls, 7% past 150; Chardon, OH ch. 1159: a shade tree every 10 spaces; many codes start at 20 spaces)
export const LAND_MIN = 20, LAND_PCT = 5, LAND_PER_TREE = 10;
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const distTo = (p, r) => r.reduce((m, a, i) => Math.min(m, S.segDist(p, a, r[(i + 1) % r.length])), Infinity);
const bbox = r => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
// a parking piece's row direction in plan degrees (0-180) and its stall pitch along the row
function axisOf(e) {
  const st = S.stalls(e), deg = (e.rot || 0) + (st.swap ? 90 : 0);
  return { deg: ((deg % 180) + 180) % 180, pitch: S.stallPitch(e), depth: S.stallAng(e) ? S.ANGLED[S.stallAng(e)].d : e.sd || S.STALL.d };
}

export function parkingMetrics(plan) {
  const els = plan.elements || [], ring = plan.ring || [];
  const rows = els.filter(e => e.kind === 'parking' && !e.rv && !e.vac && !e.future);
  const cen = new Map(rows.map(e => [e, S.stallCentres(e)])), all = [...cen.values()].flat(), n = all.length;
  const B0 = els.filter(e => e.kind === 'building' && !e.future && !e.ghost && e.use !== 'garage'), served = B0.filter(e => e.use !== 'amenity'); // (the clubhouse is not what the stalls serve where there are homes or shops)
  const blds = (served.length ? served : B0).map(e => S.outline(e));
  const out = { stalls: n };
  if (!n) return out;
  // paving on a 2 ft grid: stall rows, drives (car drives: truck courts left out), field paving
  const C = 2, [X0, Y0, X1, Y1] = bbox(ring.length ? ring : all), nx = Math.ceil((X1 - X0) / C) + 1, ny = Math.ceil((Y1 - Y0) / C) + 1, grid = new Uint8Array(nx * ny);
  const paint = (poly, bit) => { const [a, b, c, d] = bbox(poly); for (let j = Math.max(0, Math.floor((b - Y0) / C)); j <= Math.min(ny - 1, Math.ceil((d - Y0) / C)); j++) for (let i = Math.max(0, Math.floor((a - X0) / C)); i <= Math.min(nx - 1, Math.ceil((c - X0) / C)); i++) { const p = [X0 + (i + 0.5) * C, Y0 + (j + 0.5) * C]; if (S.inRing(p, poly)) grid[j * nx + i] |= bit; } };
  const drives = els.filter(e => e.kind === 'drive' && !e.future), fields = els.filter(e => e.kind === 'field');
  for (const e of rows) paint(S.outline(e), 1);
  // planted end caps and islands are landscape, not paving (cleared from the rows' cells)
  const unpaint = poly => { const [a, b, c, d] = bbox(poly); for (let j = Math.max(0, Math.floor((b - Y0) / C)); j <= Math.min(ny - 1, Math.ceil((d - Y0) / C)); j++) for (let i = Math.max(0, Math.floor((a - X0) / C)); i <= Math.min(nx - 1, Math.ceil((c - X0) / C)); i++) { const p = [X0 + (i + 0.5) * C, Y0 + (j + 0.5) * C]; if (S.inRing(p, poly)) grid[j * nx + i] &= ~1; } };
  for (const e of rows) { if (e.parallel) continue; for (const c of S.capsOf(e)) if (c.poly?.length >= 3) unpaint(c.poly);
    const ax = axisOf(e), u = [Math.cos(ax.deg * RAD), Math.sin(ax.deg * RAD)], v = [-u[1], u[0]], hw = ax.pitch / 2, hd = ax.depth / 2;
    for (const q of S.islandsOf(e)) unpaint([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [q[0] + u[0] * a + v[0] * b, q[1] + u[1] * a + v[1] * b])); }
  // landscape inside the lot: the planted end caps and islands (each with its tree), their area as drawn
  let landSf = 0, trees = 0;
  for (const e of rows) { if (e.parallel) continue; for (const c of S.capsOf(e)) if (c.poly?.length >= 3) { landSf += Math.abs(S.ringArea(c.poly)); trees++; }
    const ax = axisOf(e); for (const q of S.islandsOf(e)) { landSf += ax.pitch * ax.depth; trees++; } }
  for (const e of drives) paint(S.outline(e), 2);
  for (const e of fields) paint(S.outline(e), 4);
  // drive cells within 26 ft of a row: the lot's aisles
  const near = new Uint8Array(nx * ny), R = Math.ceil(26 / C), rowCells = [];
  for (let k = 0; k < grid.length; k++) if (grid[k] & 1) rowCells.push(k);
  { const dist = new Int32Array(nx * ny).fill(1e9), q = []; for (const k of rowCells) { dist[k] = 0; q.push(k); } // (grid steps, 4-neighbour: a plain bound)
    for (let h = 0; h < q.length; h++) { const k = q[h], d = dist[k]; if (d >= R) continue; const i = k % nx, j = (k - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const m = b * nx + a; if (dist[m] > d + 1) { dist[m] = d + 1; q.push(m); } } }
    for (let k = 0; k < grid.length; k++) near[k] = dist[k] <= R ? 1 : 0; }
  let pave = 0, lot = 0, surplus = 0;
  for (let k = 0; k < grid.length; k++) { const g = grid[k]; if (!g) continue; pave++; if (g & 1 || g & 4 || (g & 2 && near[k])) lot++; if (!(g & 1) && !(g & 2)) surplus++; }
  const A = C * C;
  Object.assign(out, { paveSf: pave * A, lotSf: lot * A, sfStall: Math.round(lot * A / n), surplusSf: surplus * A, surplusPct: +(100 * surplus / Math.max(1, pave)).toFixed(1) });
  Object.assign(out, { landSf: Math.round(landSf), landPct: +(100 * landSf / Math.max(1, lot * A + landSf)).toFixed(1), trees, perTree: trees ? +(n / trees).toFixed(1) : null });
  out.landStd = n < LAND_MIN ? null : out.landPct >= LAND_PCT && out.perTree != null && out.perTree <= LAND_PER_TREE ? 1 : 0;
  // runs of stalls with no island between: stalls on one line (same direction, same offset across) a pitch apart
  const ninety = rows.filter(e => !e.parallel), islands = [];
  for (const e of ninety) { for (const c of S.capsOf(e)) islands.push(c.tree); for (const c of S.islandsOf(e)) islands.push(c); }
  const lines = new Map();
  for (const e of ninety) { const ax = axisOf(e), u = [Math.cos(ax.deg * RAD), Math.sin(ax.deg * RAD)], v = [-u[1], u[0]];
    for (const p of cen.get(e)) { const s = p[0] * v[0] + p[1] * v[1], key = Math.round(ax.deg) % 180 + ':' + Math.round(s / 3); let L = lines.get(key); if (!L) lines.set(key, L = { u, v, pitch: ax.pitch, depth: ax.depth, ang: S.stallAng(e), pts: [] }); L.pts.push({ t: p[0] * u[0] + p[1] * u[1], s, p }); } }
  const runs = [];
  for (const L of lines.values()) { L.pts.sort((a, b) => a.t - b.t); let cur = [L.pts[0]];
    for (let i = 1; i < L.pts.length; i++) { if (L.pts[i].t - L.pts[i - 1].t <= L.pitch * 1.3) cur.push(L.pts[i]); else { runs.push({ L, pts: cur }); cur = [L.pts[i]]; } }
    runs.push({ L, pts: cur }); }
  const planted = (L, t, s) => islands.some(q => { const tq = q[0] * L.u[0] + q[1] * L.u[1], sq = q[0] * L.v[0] + q[1] * L.v[1]; return Math.abs(tq - t) < L.pitch * 0.9 && Math.abs(sq - s) < L.depth / 2 + 1; });
  let bare = 0, ends = 0;
  for (const r of runs) { if (r.pts.length < 4 || r.L.ang) continue; const a = r.pts[0], b = r.pts[r.pts.length - 1]; ends += 2; if (!planted(r.L, a.t - r.L.pitch, a.s)) bare++; if (!planted(r.L, b.t + r.L.pitch, b.s)) bare++; }
  const lens = runs.map(r => r.pts.length);
  Object.assign(out, { maxRun: Math.max(0, ...lens), long: lens.filter(k => k > 15).length, runs: runs.length, bareEnds: bare, ends });
  // dead-end aisles
  let de = []; try { de = S.deadEnds(els, 1); } catch { de = []; }
  let lg = []; try { lg = longDeadAisles(els); } catch { lg = []; }
  const deLen = de.concat(lg).map(d => Math.abs(d.rowEnd - d.tc));
  Object.assign(out, { deadEnds: de.length, deadEnds10: de.filter(d => d.stalls >= 10).length, deadEnd150: lg.length, deadEndMax: Math.round(Math.max(0, ...deLen)) });
  // walking: stall to the nearest building wall
  if (blds.length) { const bb = blds.map(bbox), d = all.map(p => { let m = Infinity; blds.forEach((o, i) => { const b = bb[i], lb = Math.max(b[0] - p[0], 0, p[0] - b[2]) ** 2 + Math.max(b[1] - p[1], 0, p[1] - b[3]) ** 2; if (lb < m * m) m = Math.min(m, distTo(p, o)); }); return m; });
    Object.assign(out, { walkMed: Math.round(pct(d, 0.5)), walk90: Math.round(pct(d, 0.9)), walkMax: Math.round(Math.max(...d)), walk300: d.filter(x => x > 300).length });
    // accessible stalls: placed against required, and how far beyond the nearest stalls
    const ac = S.accessible({ ...plan, elements: els }), need = S.adaCount(n), ad = ac.stalls.map(s => { const c = S.centroid(s.poly); return Math.min(...blds.map(o => distTo(c, o))); });
    const best = d.slice().sort((x, y) => x - y).slice(0, ad.length), mean = a => a.reduce((t, x) => t + x, 0) / Math.max(1, a.length);
    Object.assign(out, { adaPlaced: ac.stalls.length, adaNeed: need, adaExtra: ad.length ? Math.round(mean(ad) - mean(best)) : null });
  }
  // walk per building: each building's share of the stalls (by its floor area: footprint x floors), its nearest that many
  // (stalls may be counted for two neighbours: a bound, not an assignment); the worst building's 90th percentile walk
  // and how many buildings have one past 200 ft
  if (blds.length) { const Bs = (served.length ? served : B0), wt = Bs.map(e => S.ringArea(S.outline(e)) * (+e.floors || 1)), tw = wt.reduce((t, x) => t + x, 0) || 1;
    const p90s = blds.map((o, j) => { const k = Math.max(1, Math.round(n * wt[j] / tw)), ds = all.map(p => distTo(p, o)).sort((a, b) => a - b); return ds[Math.min(ds.length - 1, Math.ceil(0.9 * k) - 1)]; });
    Object.assign(out, { walkBld90: Math.round(Math.max(...p90s)), walkBld200: p90s.filter(x => x > 200).length }); }
  // entrances: the throat (ft in from the street before a stall backs into the entry drive or a drive crosses it), against
  // the length asked for the lot's size (lib/layoutrun.mjs throatNeed), and the stalls inside that length
  { const need = throatNeed(n); let th = []; try { th = entryThroats(plan, els, need); } catch { th = []; }
    Object.assign(out, { throatNeed: need, throat: th.length ? Math.min(...th.map(t => t.first)) : null, throatX: th.length ? Math.min(...th.map(t => t.cross)) : null, entryStalls: th.reduce((t, x) => t + x.stalls.length, 0) }); }
  // stray rows: tiny, skewed, orphaned
  const tiny = rows.filter(e => !e.parallel && cen.get(e).length > 0 && cen.get(e).length <= 4).length;
  const wt = new Map(); for (const e of ninety) { const k = Math.round(axisOf(e).deg % 90); wt.set(k, (wt.get(k) || 0) + cen.get(e).length); }
  const main = [...wt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0, off = deg => { const x = Math.abs(((deg - main) % 90 + 90) % 90); return Math.min(x, 90 - x); };
  const skew = ninety.filter(e => off(axisOf(e).deg) > 3).length;
  const net = drives.concat(fields, els.filter(e => e.kind === 'truck')).map(e => S.outline(e)), netB = net.map(bbox);
  const orphan = rows.filter(e => { const ax = axisOf(e), st = S.stalls(e), W = (st.swap ? e.d : e.w), D = (st.swap ? e.w : e.d), u = [Math.cos(ax.deg * RAD), Math.sin(ax.deg * RAD)], v = [-u[1], u[0]];
    return ![-1, 1].some(sd => [-0.3, 0, 0.3].some(f => { const p = [e.x + u[0] * W * f + v[0] * sd * (D / 2 + 3), e.y + u[1] * W * f + v[1] * sd * (D / 2 + 3)]; return net.some((o, i) => { const b = netB[i]; return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && S.inRing(p, o); }); })); }).length;
  Object.assign(out, { rows: rows.length, tiny, skew, orphan });
  return out;
}

const COLS = [['stalls', 'Stalls'], ['sfStall', 'sf/stall'], ['surplusPct', 'Surplus %'], ['landPct', 'Land %'], ['perTree', 'Stalls/tree'],['maxRun', 'Max run'], ['long', 'Runs >15'], ['bareEnds', 'Bare ends'], ['deadEnds', 'Dead ends'], ['deadEnd150', 'DE >150'], ['deadEndMax', 'DE max ft'], ['walkMed', 'Walk med'], ['walk90', 'Walk p90'], ['walkMax', 'Walk max'], ['walkBld90', 'Bldg p90'], ['walkBld200', 'Bldgs p90>200'], ['throat', 'Throat ft'], ['throatX', 'Throat x-drive'], ['throatNeed', 'Throat req'], ['entryStalls', 'Entry stalls'], ['adaPlaced', 'ADA'], ['adaNeed', 'ADA req'], ['adaExtra', 'ADA +ft'], ['tiny', 'Tiny rows'], ['skew', 'Skew rows'], ['orphan', 'Orphan rows']];
export function metricsTable(res) {
  const head = '| Case | ' + COLS.map(c => c[1]).join(' | ') + ' |', sep = '|---|' + COLS.map(() => '---:').join('|') + '|';
  return [head, sep, ...res.map(r => '| ' + r.id + ' | ' + COLS.map(([k]) => r.m[k] ?? '—').join(' | ') + ' |')].join('\n');
}

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1]?.endsWith('parking-metrics.mjs')) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const IN = arg('--in') || 'build/bench-v2/plans.json', ONLY = arg('--only');
  const plans = JSON.parse(fs.readFileSync(IN, 'utf8')).filter(p => !ONLY || p.id.includes(ONLY));
  const res = plans.map(p => ({ id: p.id, m: parkingMetrics({ ...p.plan, elements: p.elements, program: p.program }) }));
  const md = metricsTable(res);
  console.log(md);
  if (arg('--md')) fs.writeFileSync(arg('--md'), md + '\n');
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(res, null, 1));
}
