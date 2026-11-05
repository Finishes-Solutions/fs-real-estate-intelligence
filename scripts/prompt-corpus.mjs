// Scores how the site layout understands requests: every request in test/fixtures/prompt-corpus.mjs read (the words
// path: lib/layoutbrief.mjs briefFromRequest) and laid out (lib/layoutrun.mjs runBrief), the reading checked against
// what was meant and the best layout against what was asked (where things went, counts, sizes). The geometry checks here
// are the scorer's own (not lib/layoutintent.mjs), so a layout isn't judged by the code that placed it.
//   node scripts/prompt-corpus.mjs [--fresh] [--only S0] [--cat spatial] [--out docs/bench/prompt-eval.md] [--json file] [--png dir]
// Writes the score table per category (reading, outcome, unmet asks said in the notes) and a line per failed check.
// --fresh: the requests written after the parser was tuned (FRESH), to see how the reading carries to new wording.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as B from '../lib/layoutbrief.mjs';
import * as RUN from '../lib/layoutrun.mjs';
import * as S from '../lib/siteplan.mjs';
import { SITES, CASES as ALL, FRESH } from '../test/fixtures/prompt-corpus.mjs';
const CASES = process.argv.includes('--fresh') ? FRESH : ALL;

export const CATS = ['vague', 'detailed', 'messy', 'spatial'];
export const planOf = id => { const s = SITES[id]; return { origin: [-96.42, 30.38], ring: s.ring, front: s.front, streets: s.streets || [], setbacks: { front: 25, side: 10, rear: 20, paving: 10 }, elements: [] }; };

// ---------- the reading ----------
const near = (got, want, tol) => got != null && Math.abs(got - want) <= Math.max(tol.abs || 0, Math.abs(want) * (tol.rel || 0));
const qOk = (q, w) => { if (!q) return false; if (w === 'fill') return q.mode === 'maximize';
  const [m, a, b] = w, tol = { abs: q.unit === 'units' ? 3 : 0, rel: q.unit === 'units' ? 0.02 : 0.03 };
  if (m === 'range') return q.mode === 'range' && near(q.min, a, tol) && near(q.max, b, tol); return q.mode === m && near(q.value, a, tol); };
const RELS_EQ = { front: ['front', 'along', 'before'], back: ['back', 'behind'], middle: ['middle'], corner: ['corner'], behind: ['behind', 'back'] };
export function readingChecks(c, brief) {
  const w = c.want || {}, out = [], add = (name, ok, got) => out.push({ name, ok: !!ok, got });
  const uses = (brief?.program?.uses || []).map(u => u.use).filter(u => u !== 'amenity'), set = [...new Set(uses)].sort().join(',');
  const E = brief?.program?.engine || {}, zoneOf = u => (Array.isArray(E.zones) ? E.zones : [E]).find(z => z.use === u) || {};
  if (w.uses) add('uses', set === [...new Set(w.uses)].sort().join(','), set);
  if (w.usesAny) add('uses', w.usesAny.some(l => [...new Set(l)].sort().join(',') === set), set);
  const useQ = k => (brief?.program?.uses || []).find(u => k === '*' ? u.use !== 'amenity' : u.use === k);
  for (const [k, v] of Object.entries(w.q || {})) { const u = useQ(k); add('quantity ' + k, qOk(u?.quantity, v), u ? JSON.stringify(u.quantity) : 'none'); }
  for (const [k, v] of Object.entries(w.floors || {})) { const u = useQ(k), f = u?.floors ?? zoneOf(k).floors ?? E.floors; add('floors ' + k, +f === v, f); }
  const pr = brief?.rules?.values || {};
  if (w.perUnit != null) { const v = E.perUnit ?? pr.parkingPerUnit?.v ?? zoneOf('multifamily').perUnit; add('parking per unit', near(+v, w.perUnit, { abs: 0.01 }), v); }
  if (w.ratio != null) { const v = E.ratio ?? pr.parkingPer1000?.v; add('parking per 1,000', near(+v, w.ratio, { abs: 0.01 }), v); }
  if (w.parking) add('parking mode', brief?.program?.parking?.mode === w.parking, brief?.program?.parking?.mode);
  if (w.angle != null) add('parking angle', (brief?.program?.parking?.angle ?? E.parkAngle) === w.angle, brief?.program?.parking?.angle);
  if (w.storm) add('stormwater', brief?.site?.stormwater === w.storm || (w.storm === 'onsite-pond' && ['detention', 'retention'].includes(E.storm)), brief?.site?.stormwater || E.storm);
  if (w.setbacks) { const v = pr.setbacks?.v || {}; add('setbacks', Object.entries(w.setbacks).every(([k, x]) => +v[k] === x), JSON.stringify(v)); }
  if (w.overlays) add('overlays', w.overlays.every(o => (brief?.program?.overlays || []).includes(o)), (brief?.program?.overlays || []).join(','));
  for (const [k, v] of Object.entries(w.form || {})) { const u = useQ(k); add('form ' + k, u?.form === v, u?.form); }
  if (w.anchor) { const u = useQ('retail'); add('anchor', near(u?.anchor?.value ?? E.anchor, w.anchor, { rel: 0.02 }), u?.anchor?.value ?? E.anchor); }
  if (w.pondAc) { const ac = S.ringArea(brief?.site?.ring || [[0, 0]]) / 43560, pct = E.detentionPct; add('pond acres', pct != null && near(pct * ac / 100, w.pondAc, { rel: 0.1 }), pct); }
  if (w.assumed) add('says what it assumed', (brief?.request?.assumed || []).length > 0, (brief?.request?.assumed || []).length);
  for (const [s, rel, arg] of w.place || []) {
    const pl = brief?.program?.placements || [], eq = RELS_EQ[rel] || [rel];
    const hit = pl.some(p => p.subject === s && eq.includes(p.rel) && (arg == null || p.edge === arg || p.target === arg || (rel === 'keep' || rel === 'away') && p.edge && p.edge === arg))
      || (rel !== 'edge' && rel !== 'keep' && rel !== 'away' && (Array.isArray(E.zones) ? E.zones : []).some(z => z.use === s && eq.includes(z.place?.where === 'along' ? 'front' : z.place?.where)));
    add('place ' + [s, rel, arg].filter(Boolean).join(' '), hit, pl.map(p => [p.subject, p.rel, p.edge || p.target || ''].join(' ')).join('; '));
  }
  return out;
}

// ---------- the outcome (the scorer's own geometry) ----------
const outward = (r, i) => { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, s = S.signedArea(r) > 0 ? 1 : -1; return [s * (b[1] - a[1]) / L, -s * (b[0] - a[0]) / L]; };
const DIR = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };
function edgeIdx(plan, e) {
  const r = plan.ring, n = r.length, nf = outward(r, plan.front);
  if (e === 'front') return [plan.front];
  if (e === 'side') return (plan.streets || []).filter(i => i !== plan.front);
  if (e === 'back') return [...Array(n).keys()].filter(i => { const o = outward(r, i); return o[0] * nf[0] + o[1] * nf[1] < -0.7; });
  const v = DIR[e]; return v ? [...Array(n).keys()].filter(i => { const o = outward(r, i); return o[0] * v[0] + o[1] * v[1] > 0.7; }) : [];
}
const dEdges = (plan, idx, p) => Math.min(...idx.map(i => S.segDist(p, plan.ring[i], plan.ring[(i + 1) % plan.ring.length])));
const shp = e => e.path && !e.poly && e.kind === 'drive' ? e.path : S.shapeOf(e);
const cen = list => { const c = list.map(e => S.centroid(shp(e))); return [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length]; };
const club = e => e.kind === 'building' && (e.use === 'amenity' || /club|leasing|community cent/i.test(e.name || ''));
function pieces(o, s) {
  const els = o.elements || [], use = e => e.use || o.program?.use;
  const by = { pool: e => e.kind === 'pool', clubhouse: club, playground: e => e.kind === 'play', 'dog park': e => /dog/i.test(e.name || ''), pond: e => e.kind === 'pond', parking: e => e.kind === 'parking', 'truck court': e => e.kind === 'truck', buildings: e => e.kind === 'building' && !club(e) && !e.future };
  return els.filter(by[s] || (e => e.kind === 'building' && !club(e) && !e.future && (use(e) === s || s === 'restaurant' && e.pad)));
}
function frameUV(plan) { const r = plan.ring, nf = outward(r, plan.front), into = [-nf[0], -nf[1]], rt = [into[1], -into[0]], D = r.map(p => p[0] * into[0] + p[1] * into[1]), A = r.map(p => p[0] * rt[0] + p[1] * rt[1]);
  const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  return { uv: p => [(p[0] * rt[0] + p[1] * rt[1] - Math.min(...A)) / (Math.max(...A) - Math.min(...A)), (p[0] * into[0] + p[1] * into[1] - Math.min(...D)) / (Math.max(...D) - Math.min(...D))], xy: p => [(p[0] - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs)), (p[1] - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys))] }; }
function inRegion(plan, p, region) {
  const F = frameUV(plan), [u, v] = F.uv(p), [x, y] = F.xy(p);
  if (region === 'middle') return u >= 0.25 && u <= 0.75 && v >= 0.25 && v <= 0.75;
  if (region === 'front') return v <= 0.4; if (region === 'back') return v >= 0.6;
  if (region === 'corner') return (u <= 0.3 || u >= 0.7) && (v <= 0.3 || v >= 0.7);
  return { north: y >= 0.6, south: y <= 0.4, east: x >= 0.6, west: x <= 0.4 }[region] ?? false;
}
export function outcomeChecks(c, plan, rec) {
  const o = rec?.options?.[0], out = [], add = (name, ok, got, spatial = false) => out.push({ name, ok: !!ok, got, spatial });
  for (const k of c.out || []) {
    const [t, a, b, d] = k, nm = k.join(' ');
    if (!o) { add(nm, false, 'no layout', ['in', 'nearer', 'away', 'entrance', 'facing', 'near', 'clear'].includes(t)); continue; }
    const q = o.quantities;
    if (t === 'built') add(nm, (o.elements || []).some(x => x.kind === 'building'));
    else if (t === 'units') { const v = q.totals.units; add(nm, a === 'exact' ? Math.abs(v - b) <= Math.max(2, b * 0.02) : a === 'min' ? v >= b : a === 'max' ? v <= b && v > 0 : v >= b && v <= d, v); }
    else if (t === 'gfa') { const v = q.byUse?.[a]?.gfa || 0; add(nm, b === 'exact' ? Math.abs(v - d) <= d * 0.03 : b === 'min' ? v >= d : v <= d, v); }
    else if (t === 'has') add(nm, pieces(o, a).length > 0, pieces(o, a).length);
    else if (t === 'in') { const P = pieces(o, a); add(nm, P.length && inRegion(plan, cen(P), b), P.length ? cen(P).map(Math.round).join(',') : 'none', true); }
    else if (t === 'nearer') { const A = pieces(o, a), Bp = pieces(o, b), idx = edgeIdx(plan, d); const da = A.length && dEdges(plan, idx, cen(A)), db = Bp.length && dEdges(plan, idx, cen(Bp)); add(nm, A.length && Bp.length && da < db, A.length && Bp.length ? Math.round(da) + ' vs ' + Math.round(db) : 'missing', true); }
    else if (t === 'away') { const P = pieces(o, a), idx = edgeIdx(plan, b), dm = P.length ? Math.min(...P.map(x => Math.min(...S.shapeOf(x).map(p => dEdges(plan, idx, p))))) : Infinity; add(nm, dm >= d, Math.round(dm), true); }
    else if (t === 'entrance') { const idx = edgeIdx(plan, a), ents = S.entrancesOf(o.elements); add(nm, idx.length && ents.some(x => shp(x).some(p => dEdges(plan, idx, p) < 30)), ents.length + ' ways in', true); }
    else if (t === 'facing') { const P = pieces(o, a), Bl = (o.elements || []).filter(x => x.kind === 'building' && !club(x)); if (!P.length || !Bl.length) { add(nm, false, 'missing', true); continue; }
      const p = cen(P), bc = cen(Bl), v = b === 'back' ? (n => [-n[0], -n[1]])(outward(plan.ring, plan.front)) : DIR[b], dx = p[0] - bc[0], dy = p[1] - bc[1], L = Math.hypot(dx, dy) || 1; add(nm, (dx * v[0] + dy * v[1]) / L > 0.5, Math.round(dx) + ',' + Math.round(dy), true); }
    else if (t === 'near') { const A = pieces(o, a), Bp = b === 'entrance' ? S.entrancesOf(o.elements) : pieces(o, b); const dm = A.length && Bp.length ? Math.min(...A.flatMap(x => Bp.map(y => S.gapBetween(S.shapeOf(x), y.kind === 'drive' && y.path && !y.poly ? y.path : S.shapeOf(y))))) : Infinity; add(nm, dm <= d, Math.round(dm), true); }
    else if (t === 'clear') { const v = DIR[a.slice(0, 5)], h = DIR[a.slice(5)], r = plan.ring, k0 = r.slice().sort((p1, p2) => (p2[0] * h[0] + p2[1] * v[1] + p2[1] * h[1] + p2[0] * v[0]) - (p1[0] * h[0] + p1[1] * v[1] + p1[1] * h[1] + p1[0] * v[0]))[0];
      const hit = (o.elements || []).filter(x => ['building', 'parking', 'drive', 'pond'].includes(x.kind) && !(x.kind === 'drive' && x.entry)).some(x => shp(x).some(p => Math.hypot(p[0] - k0[0], p[1] - k0[1]) < b)); add(nm, !hit, k0.join(','), true); }
    else add(nm, false, 'unknown check');
  }
  return out;
}
const SAID = /\bAsked\b[^.]*(?:not met|: (?:the site has no|no |nothing))/i;
export function scoreCase(c, brief, rec) {
  const plan = planOf(c.site), rd = readingChecks(c, brief), oc = outcomeChecks(c, plan, rec), notes = [...(rec?.options?.[0]?.notes || []), ...(rec?.engineMapping || [])];
  const unmet = oc.filter(x => x.spatial && !x.ok), said = unmet.filter(() => notes.some(n => SAID.test(n)));
  return { id: c.id, cat: c.cat, ask: c.ask, reading: rd, outcome: oc, unmet: unmet.length, said: said.length, ok: rd.every(x => x.ok) && oc.every(x => x.ok), notes };
}
export function table(rows, title = 'Words path') {
  const line = cat => { const R = rows.filter(r => cat === 'all' || r.cat === cat), rd = R.flatMap(r => r.reading), oc = R.flatMap(r => r.outcome), un = R.reduce((s, r) => s + r.unmet, 0), sd = R.reduce((s, r) => s + r.said, 0), pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
    return '| ' + [cat, R.length, pct(rd.filter(x => x.ok).length, rd.length), pct(oc.filter(x => x.ok).length, oc.length), R.filter(r => r.ok).length + ' / ' + R.length, un ? sd + ' / ' + un : '—'].join(' | ') + ' |'; };
  return ['**' + title + '**', '', '| Category | Requests | Reading checks met | Outcome checks met | Requests fully right | Unmet place asks said in the notes |', '|---|---|---|---|---|---|', ...CATS.map(line), line('all')].join('\n');
}
export function failures(rows) {
  return rows.filter(r => !r.ok).map(r => '- ' + r.id + ' “' + r.ask + '”: ' + [...r.reading.filter(x => !x.ok).map(x => x.name + ' (got ' + x.got + ')'), ...r.outcome.filter(x => !x.ok).map(x => x.name + ' (got ' + x.got + ')')].join('; '));
}

// ---------- run ----------
export function runWords(c) { const plan = planOf(c.site), brief = B.briefFromRequest(c.ask, plan), rec = RUN.runBrief(brief); return { brief, rec, row: scoreCase(c, brief, rec) }; }
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const only = arg('--only'), cat = arg('--cat'), OUT = arg('--out'), JS = arg('--json'), PNG = arg('--png');
  const rows = [], t0 = Date.now(), drawn = [];
  for (const c of CASES.filter(c => (!only || only.split(',').some(x => c.id.startsWith(x))) && (!cat || c.cat === cat))) {
    const t = Date.now(); let r; try { r = runWords(c); } catch (e) { r = { row: { ...scoreCase(c, null, null), error: e.message } }; }
    rows.push(r.row); console.log((r.row.ok ? 'ok   ' : 'MISS ') + c.id.padEnd(4), (Date.now() - t + 'ms').padStart(7), c.ask.slice(0, 70), r.row.ok ? '' : '\n       ' + [...r.row.reading, ...r.row.outcome].filter(x => !x.ok).map(x => x.name + ' → ' + x.got).join(' | '));
    if (PNG && r.rec?.options?.[0]) drawn.push({ c, plan: planOf(c.site), o: r.rec.options[0], row: r.row });
  }
  const md = table(rows) + '\n';
  console.log('\n' + md + '\n' + rows.length + ' requests in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  if (JS) fs.writeFileSync(JS, JSON.stringify(rows, null, 1));
  if (OUT) fs.writeFileSync(OUT, md + '\n' + failures(rows).join('\n') + '\n');
  if (PNG) await drawPNGs(drawn, PNG);
}
// each drawn plan with its request as the caption (Chrome at CHROME_PATH or the macOS default)
export async function drawPNGs(list, dir) {
  const { planSVG } = await import('../lib/sitesheet.mjs'); fs.mkdirSync(dir, { recursive: true });
  const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  const puppeteer = (await import('puppeteer-core')).default, b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  for (const { c, plan, o, row, tag } of list) {
    const svg = planSVG({ ...plan, elements: o.elements, program: o.program }, { px: 760, pad: 20 }).svg, asked = (o.notes || []).filter(n => /^Asked|^Assumed|kept|moved|added/.test(n)).slice(0, 6);
    const html = '<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px Arial;width:800px;padding:10px;background:#fff;color:#111"><div style="font-weight:bold;font-size:16px">' + esc(c.id + ' · “' + c.ask + '”') + '</div><div style="color:#555">' + esc(SITES[c.site].label + ' · ' + o.name + ' · ' + (row.ok ? 'all checks met' : 'missed: ' + [...row.reading, ...row.outcome].filter(x => !x.ok).map(x => x.name).join(', '))) + '</div>' + svg + '<ul style="margin:4px 0;padding-left:18px;color:#333">' + asked.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></body>';
    const pg = await b.newPage(); await pg.setViewport({ width: 820, height: 900 }); await pg.setContent(html); await pg.screenshot({ path: path.join(dir, c.id + (tag ? '-' + tag : '') + '.png'), fullPage: true }); await pg.close();
  }
  await b.close();
}
