// Scores how EDIT requests on an existing site plan are understood and carried out: every request in
// test/fixtures/edit-corpus.mjs said through the MCP's plan_edit (lib/mcp/plans.mjs, the same reading the app's Change
// With AI uses: lib/editread.mjs) against its base plan, and the edited plan measured here on its own geometry (not on
// what the edit says it did): where things went, counts, sizes, parking, setbacks, what was kept and locked. A reply
// whose plan misses a check should say so ("Not done" / "not met"): that is counted as honest.
//   node scripts/edit-corpus.mjs [--fresh] [--only E01,E1] [--cat move] [--out file.md] [--json file] [--png dir] [--tag x]
// The words path (no AI: plan_edit use_ai false). test/edit-eval-live.mjs runs the same cases through the AI.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as SP from '../lib/siteplan.mjs';
import * as ED from '../lib/siteedit.mjs';
import { BASES, CASES as ALL, FRESH } from '../test/fixtures/edit-corpus.mjs';

export const CATS = ['move', 'resize', 'swap', 'parking', 'settings', 'vague', 'messy', 'multi', 'lock'];
export const pickSet = argv => argv.includes('--fresh') ? FRESH : ALL;

// ---------- the base plans (laid out once, as site_plan's Low path does: the words read, the engine's first layout) ----------
export async function baseRecords(ids = Object.keys(BASES)) {
  const MS = await import('../lib/mcp/siteplan.mjs'), ST = await import('../lib/mcp/store.mjs'), out = {};
  const need = new Set(ids.flatMap(id => [id, BASES[id].base].filter(Boolean)));
  for (const id of Object.keys(BASES).filter(k => need.has(k) && !BASES[k].base)) {
    const b = BASES[id], plan = { origin: [-96.42, 30.38], ring: b.ring, front: b.front, streets: b.streets || [], setbacks: { ...SP.SETBACKS }, elements: [] };
    const prog = SP.guessProgram(b.ask), o = MS.laid(plan, prog, { count: 3, deeper: true }, b.ask).find(x => x.elements?.length);
    const pl = { ...plan, program: o.program || prog, params: o.params, zones: o.zones || [], elements: o.elements, ...(o.recipe ? { recipe: o.recipe } : {}), setbacks: o.setbacks || plan.setbacks, name: 'A', variant: { key: o.key, name: o.name } };
    out[id] = { v: 1, id: 'base' + id + ST.newId().slice(0, 6), at: '2026-11-05T00:00:00Z', plan: pl, request: b.ask, label: b.label, layout: o.name || 'Layout', verdict: 'pass' };
  }
  for (const id of Object.keys(BASES).filter(k => need.has(k) && BASES[k].base)) {
    const b = BASES[id], from = out[b.base], r = ED.applyEdits(from.plan, b.then, {});
    out[id] = { ...from, id: 'base' + id + ST.newId().slice(0, 6), plan: { ...from.plan, elements: r.elements }, label: b.label };
  }
  return out;
}

// ---------- measuring (the scorer's own geometry) ----------
const isClub = e => e.kind === 'building' && (e.use === 'amenity' || /club|leasing|community cent/i.test(e.name || ''));
const BUILDING_USES = { apartments: ['multifamily'], townhomes: ['townhomes'], duplex: ['duplex'], hotel: ['hotel'], retail: ['retail', 'restaurant'], restaurant: ['restaurant'], warehouse: ['industrial'], office: ['office'] };
const AMEN = e => ['pool', 'play', 'court'].includes(e.kind) || isClub(e) || (e.kind === 'green' && /dog|park|lawn|garden|green|open space/i.test(e.name || '') && !/median|future|pad site|buffer/i.test(e.name || ''));
// the pieces a subject means on a plan (base: the base plan, for names)
export function piecesOf(plan, s, base) {
  const els = plan.elements || [];
  if (s.startsWith('name:')) { const nm = s.slice(5).toLowerCase(), b0 = (base || plan).elements.filter(e => (e.name || '').toLowerCase() === nm).map(e => e.id); const byId = els.filter(e => b0.includes(e.id)); return byId.length ? byId : els.filter(e => (e.name || '').toLowerCase() === nm); }
  const by = { pool: e => e.kind === 'pool', clubhouse: isClub, pond: e => e.kind === 'pond', parking: e => e.kind === 'parking' || e.kind === 'field', playground: e => e.kind === 'play', 'dog park': e => /dog/i.test(e.name || '') && e.kind !== 'building', courts: e => e.kind === 'court' || /court/i.test(e.name || '') && e.kind === 'green',
    buildings: e => e.kind === 'building' && !isClub(e) && !e.future, amenities: AMEN };
  if (by[s]) return els.filter(by[s]);
  const U = BUILDING_USES[s]; if (U) return els.filter(e => e.kind === 'building' && !isClub(e) && (U.includes(e.use) || s === 'restaurant' && e.pad && e.use !== 'hotel'));
  return [];
}
const shp = e => e.path && !e.poly && e.kind === 'drive' ? e.path : SP.shapeOf(e);
const cen = list => { const c = list.map(e => SP.centroid(shp(e))); return [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length]; };
const outward = (r, i) => { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, s = SP.signedArea(r) > 0 ? 1 : -1; return [s * (b[1] - a[1]) / L, -s * (b[0] - a[0]) / L]; };
const DIR = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };
function edgeIdx(plan, e) {
  const r = plan.ring, n = r.length, nf = outward(r, plan.front);
  if (e === 'front') return [plan.front];
  if (e === 'side') return (plan.streets || []).filter(i => i !== plan.front);
  if (e === 'back') return [...Array(n).keys()].filter(i => { const o = outward(r, i); return o[0] * nf[0] + o[1] * nf[1] < -0.7; });
  const v = DIR[e]; return v ? [...Array(n).keys()].filter(i => { const o = outward(r, i); return o[0] * v[0] + o[1] * v[1] > 0.7; }) : [];
}
const dEdges = (plan, idx, p) => Math.min(...idx.map(i => SP.segDist(p, plan.ring[i], plan.ring[(i + 1) % plan.ring.length])));
// u across the frontage (0..1, left to right seen from the street), v back from the street (0..1); x, y the compass box
function frame(plan) { const r = plan.ring, nf = outward(r, plan.front), into = [-nf[0], -nf[1]], rt = [into[1], -into[0]], D = r.map(p => p[0] * into[0] + p[1] * into[1]), A = r.map(p => p[0] * rt[0] + p[1] * rt[1]), xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  return { depth: p => p[0] * into[0] + p[1] * into[1] - Math.min(...D), uv: p => [(p[0] * rt[0] + p[1] * rt[1] - Math.min(...A)) / (Math.max(...A) - Math.min(...A)), (p[0] * into[0] + p[1] * into[1] - Math.min(...D)) / (Math.max(...D) - Math.min(...D))], xy: p => [(p[0] - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs)), (p[1] - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys))] }; }
function inRegion(plan, p, region) {
  const F = frame(plan), [u, v] = F.uv(p), [x, y] = F.xy(p), lo = 0.3, hi = 0.7;
  const one = r => r === 'middle' ? u >= 0.3 && u <= 0.7 && v >= 0.3 && v <= 0.7 : r === 'front' ? v <= 0.4 : r === 'back' ? v >= 0.6 : r === 'left' ? u <= 0.4 : r === 'right' ? u >= 0.6
    : r === 'corner' ? (u <= lo || u >= hi) && (v <= lo || v >= hi) : { north: y >= 0.6, south: y <= 0.4, east: x >= 0.6, west: x <= 0.4 }[r] ?? false;
  const m = /^(\w+?)(?:\s*-?\s*)(east|west)?\s*corner$/.exec(region);
  if (m && m[1] !== 'corner') { const tight = r => ({ north: y >= hi, south: y <= lo, east: x >= hi, west: x <= lo, back: v >= hi, front: v <= lo }[r]); return m[2] ? tight(m[1]) && tight(m[2]) : tight(m[1]) && (u <= lo || u >= hi); }
  return one(region);
}
const sameSpot = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y) <= 2 && Math.abs((a.w || 0) - (b.w || 0)) <= 2 && Math.abs((a.d || 0) - (b.d || 0)) <= 2 && (a.floors || 1) === (b.floors || 1);
const exact = (a, b) => a && b && ['x', 'y', 'w', 'd', 'rot', 'floors', 'units', 'use'].every(k => (a[k] ?? null) === (b[k] ?? null)) && JSON.stringify(a.poly || null) === JSON.stringify(b.poly || null);
const gfaUse = (plan, uses) => (plan.elements || []).filter(e => e.kind === 'building' && uses.includes(e.use)).reduce((s, e) => s + SP.gfaOf(e), 0);
const keysOf = plan => (plan.elements || []).filter(e => e.kind === 'building' && e.use === 'hotel').reduce((s, e) => s + (+e.keys || Math.round(SP.gfaOf(e) / 550)), 0);
const stallDepth = plan => { const F = frame(plan); let n = 0, d = 0; for (const e of (plan.elements || []).filter(x => x.kind === 'parking')) { let c = []; try { c = SP.stallCentres(e); } catch (x) { c = []; } for (const p of c) { n++; d += F.depth(p); } } return n ? d / n : null; };
const bldDepth = plan => { const F = frame(plan), B = piecesOf(plan, 'buildings'); return B.length ? B.reduce((s, e) => s + F.depth(SP.centroid(SP.shapeOf(e))), 0) / B.length : null; };
const areaOf = list => list.reduce((s, e) => s + Math.abs(SP.ringArea(SP.shapeOf(e))), 0);

export function outcomeChecks(c, base, after) {
  const out = [], add = (name, ok, got) => out.push({ name, ok: !!ok, got });
  const m0 = SP.metrics(base), m1 = after ? SP.metrics(after) : null;
  for (const k of c.out || []) {
    const [t, a, b, d, e] = k, nm = k.map(x => Array.isArray(x) ? '[' + x.join(',') + ']' : x).join(' ');
    if (!after) { add(nm, false, 'no plan'); continue; }
    const P = s => piecesOf(after, s, base), P0 = s => piecesOf(base, s, base);
    try {
      if (t === 'in') { const L = P(a); add(nm, L.length && inRegion(after, cen(L), b), L.length ? cen(L).map(Math.round).join(',') : 'none'); }
      else if (t === 'near') { const A = P(a), B2 = b === 'entrance' ? SP.entrancesOf(after.elements) : b.startsWith('name:') && !P(b).length ? P0(b) : P(b); const g = A.length && B2.length ? Math.min(...A.flatMap(x => B2.map(y => SP.gapBetween(SP.shapeOf(x), shp(y))))) : Infinity; add(nm, g <= d, Number.isFinite(g) ? Math.round(g) : 'missing'); }
      else if (t === 'within') { const A = P(a), B2 = P(b); if (!A.length || !B2.length) { add(nm, false, 'missing'); continue; } const pts = B2.flatMap(x => SP.shapeOf(x)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), q = cen(A), mx = 0.15;
        add(nm, q[0] >= x0 + (x1 - x0) * mx && q[0] <= x1 - (x1 - x0) * mx && q[1] >= y0 + (y1 - y0) * mx && q[1] <= y1 - (y1 - y0) * mx, q.map(Math.round).join(',')); }
      else if (t === 'behindOf') { const A = P(a), B2 = P(b), F = frame(after); add(nm, A.length && B2.length && F.depth(cen(A)) > F.depth(cen(B2)), A.length && B2.length ? Math.round(F.depth(cen(A))) + ' vs ' + Math.round(F.depth(cen(B2))) : 'missing'); }
      else if (t === 'moved') { const A0 = P0(a), A = P(a); if (!A.length || !A0.length) { add(nm, false, 'missing'); continue; } const c0 = cen(A0), c1 = cen(A), v = DIR[b], dx = c1[0] - c0[0], dy = c1[1] - c0[1], along = dx * v[0] + dy * v[1], side = Math.abs(dx * v[1] - dy * v[0]);
        add(nm, Math.abs(along - d) <= 15 && side < 20, Math.round(along) + ' along, ' + Math.round(side) + ' aside'); }
      else if (t === 'floors') { const L = P(a).filter(x => x.kind === 'building'); add(nm, L.length && L.every(x => (x.floors || 1) === b), [...new Set(L.map(x => x.floors || 1))].join(',') || 'none'); }
      else if (t === 'units') { const u0 = m0.units || 0, u1 = m1.units || 0, dl = u1 - u0;
        const ok = a === 'delta' ? Math.abs(dl - b) <= (d ?? 5) : a === 'delta>=' ? dl >= b : a === 'more%' ? u1 >= u0 * (1 + b) : a === 'less%' ? u1 <= u0 * (1 - b) && u1 > 0 : a === 'about' ? Math.abs(u1 - b) <= (d ?? 5) : a === 'min' ? u1 >= b : a === 'max' ? u1 <= b : false; add(nm, ok, u0 + ' → ' + u1); }
      else if (t === 'gfa') { const U = a === 'retail' ? ['retail', 'restaurant'] : [a], g0 = gfaUse(base, U), g1 = gfaUse(after, U);
        add(nm, b === 'about' ? Math.abs(g1 - d) <= d * (e ?? 0.05) : b === 'more%' ? g1 >= g0 * (1 + d) : b === 'min' ? g1 >= d : false, Math.round(g0) + ' → ' + Math.round(g1)); }
      else if (t === 'keys') { const k1 = keysOf(after); add(nm, a === 'about' ? Math.abs(k1 - b) <= b * 0.1 : k1 >= b, keysOf(base) + ' → ' + k1); }
      else if (t === 'area') { const A0 = areaOf(P0(a)), A1 = areaOf(P(a)); add(nm, A1 >= A0 * (1 + d), Math.round(A0) + ' → ' + Math.round(A1)); }
      else if (t === 'count') { const n = P(a).length; add(nm, b === 'min' ? n >= d : b === 'max' ? n <= d : n === d, n); }
      else if (t === 'has') add(nm, P(a).length > 0, P(a).length);
      else if (t === 'none') add(nm, P(a).length === 0, P(a).length);
      else if (t === 'gone') { const ids = P0(a).map(x => x.id), left = (after.elements || []).filter(x => ids.includes(x.id)); add(nm, ids.length && !left.length, left.length + ' of ' + ids.length + ' left'); }
      else if (t === 'swapped') { const A0 = P0(a), B0 = P0(b), A = P(a); if (!A.length || !A0.length || !B0.length) { add(nm, false, 'missing'); continue; } const q = cen(A), dA = Math.hypot(q[0] - cen(A0)[0], q[1] - cen(A0)[1]), dB = Math.hypot(q[0] - cen(B0)[0], q[1] - cen(B0)[1]); add(nm, dB < dA, Math.round(dB) + ' from its place vs ' + Math.round(dA)); }
      else if (t === 'angled') { const R = (after.elements || []).filter(x => x.kind === 'parking'), A = R.filter(x => SP.stallAng(x) && (!a || SP.stallAng(x) === a)); add(nm, A.length > 0 && A.length >= R.length * 0.3, A.length + ' of ' + R.length + ' rows'); }
      else if (t === 'behind' || t === 'infront') { const s1 = stallDepth(after), b1 = bldDepth(after); add(nm, s1 != null && b1 != null && (t === 'behind' ? s1 > b1 : s1 < b1), s1 == null ? 'no stalls' : Math.round(s1) + ' vs buildings ' + Math.round(b1)); }
      else if (t === 'spaces') add(nm, m1.spaces - m0.spaces >= b, m0.spaces + ' → ' + m1.spaces);
      else if (t === 'perUnit') { const r = m1.units ? m1.required / m1.units : 0; add(nm, Math.abs(r - a) <= 0.06 && m1.spaces >= m1.required * 0.98, r.toFixed(2) + ' required a unit, ' + m1.spaces + ' / ' + Math.round(m1.required)); }
      else if (t === 'per1000') { const r = m1.gfa ? m1.required / m1.gfa * 1000 : 0; add(nm, Math.abs(r - a) <= 0.1 && m1.spaces >= m1.required * 0.98, r.toFixed(2) + ' a 1,000 sf, ' + m1.spaces + ' / ' + Math.round(m1.required)); }
      else if (t === 'parkingOk') add(nm, m1.spaces >= m1.required, m1.spaces + ' / ' + Math.round(m1.required));
      else if (t === 'setback' || t === 'away') { const L = t === 'setback' ? piecesOf(after, 'buildings').concat(piecesOf(after, 'clubhouse')) : P(a), idx = edgeIdx(after, t === 'setback' ? a : b), ft = t === 'setback' ? b : d;
        const dm = L.length ? Math.min(...L.map(x => Math.min(...SP.shapeOf(x).map(p => dEdges(after, idx, p))))) : Infinity; add(nm, idx.length && dm >= ft - 0.5, Math.round(dm)); }
      else if (t === 'entrance') { const idx = edgeIdx(after, a), ents = SP.entrancesOf(after.elements); add(nm, idx.length && ents.some(x => shp(x).some(p => dEdges(after, idx, p) < 30)), ents.length + ' ways in'); }
      else if (t === 'open') add(nm, (m1.green - m0.green) * 100 >= b, Math.round(m0.green * 100) + '% → ' + Math.round(m1.green * 100) + '%');
      else if (t === 'crowd') add(nm, ((m1.units || 0) < (m0.units || 0) || m1.coverage < m0.coverage - 0.01) && m1.green >= m0.green - 0.005, (m0.units || 0) + ' → ' + (m1.units || 0) + ' units, open ' + Math.round(m0.green * 100) + '% → ' + Math.round(m1.green * 100) + '%');
      else if (t === 'amenities') add(nm, P('amenities').length > P0('amenities').length, P0('amenities').length + ' → ' + P('amenities').length);
      else if (t === 'keepOthers') { const skip = new Set(a.flatMap(s => P0(s).map(x => x.id))), L0 = (base.elements || []).filter(x => (x.kind === 'building' || AMEN(x) || x.kind === 'pond') && !skip.has(x.id)), kept = L0.filter(x => sameSpot(x, after.elements.find(y => y.id === x.id)));
        add(nm, kept.length >= L0.length * b, kept.length + ' of ' + L0.length + ' kept'); }
      else if (t === 'lock') { const L0 = P0(a), ok = L0.length && L0.every(x => exact(x, after.elements.find(y => y.id === x.id))); add(nm, ok, L0.length ? (ok ? 'held' : 'changed') : 'missing'); }
      else add(nm, false, 'unknown check');
    } catch (err) { add(nm, false, 'error ' + err.message); }
  }
  return out;
}
const SAID = /##\s*Not done|not met|couldn’t|couldn't|wasn’t|wasn't|can’t|can't|no room|isn’t|not applied|didn’t|Nothing on the plan was changed/i;
export function scoreEdit(c, base, after, reply = '') {
  const oc = outcomeChecks(c, base, after), ok = oc.every(x => x.ok), honest = ok || SAID.test(reply);
  return { id: c.id, cat: c.cat, ask: c.ask, outcome: oc, ok, honest, reply };
}
export function table(rows, title = 'Words path') {
  const line = cat => { const R = rows.filter(r => cat === 'all' || r.cat === cat), oc = R.flatMap(r => r.outcome), miss = R.filter(r => !r.ok), pct = (a, b2) => b2 ? Math.round(100 * a / b2) + '%' : '—';
    return '| ' + [cat, R.length, pct(oc.filter(x => x.ok).length, oc.length), R.filter(r => r.ok).length + ' / ' + R.length, miss.length ? miss.filter(r => r.honest).length + ' / ' + miss.length : '—'].join(' | ') + ' |'; };
  return ['**' + title + '**', '', '| Category | Edits | Outcome checks met | Edits fully right | Misses said in the reply |', '|---|---|---|---|---|', ...CATS.filter(c => rows.some(r => r.cat === c)).map(line), line('all')].join('\n');
}
export function failures(rows) {
  return rows.filter(r => !r.ok).map(r => '- ' + r.id + ' “' + r.ask + '”: ' + r.outcome.filter(x => !x.ok).map(x => x.name + ' (got ' + x.got + ')').join('; ') + (r.honest ? '' : ' — NOT SAID'));
}

// ---------- running one edit through plan_edit ----------
export async function setup() {
  const ST = await import('../lib/mcp/store.mjs'), mem = ST.memoryStore(); ST.hooks.store = mem;
  const PL = await import('../lib/mcp/plans.mjs'), r = async () => Buffer.from('%PDF-1.4'); PL.hooks.render = r; PL.hooks.snapshots = async s => s.map(() => 'data:image/jpeg;base64,/9j/AAAA');
  return { ST, mem, PL };
}
export async function runEdit(env, c, bases, { ai = null } = {}) {
  const { ST, mem, PL } = env, rec = bases[c.base]; await ST.putJSON(mem, 'plans/' + rec.id + '.json', rec);
  PL.hooks.ai = ai; let res, err = null;
  try { res = await PL.planEditTool({ plan_id: rec.id, words: c.ask, use_ai: !!ai, include_record: true }); } catch (e) { err = e.message; }
  const text = res?.content?.find(x => x.type === 'text')?.text || err || '', js = res?.content?.find(x => x.type === 'resource')?.resource?.text, after = js ? JSON.parse(js).plan : null;
  return { text, after: after || (res?.isError ? rec.plan : null), base: rec.plan };
}

// ---------- run ----------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const only = arg('--only'), cat = arg('--cat'), OUT = arg('--out'), JS = arg('--json'), PNG = arg('--png');
  const LIST = pickSet(process.argv).filter(c => (!only || only.split(',').some(x => c.id.startsWith(x))) && (!cat || c.cat === cat));
  const t0 = Date.now(), bases = await baseRecords([...new Set(LIST.map(c => c.base))]), env = await setup(), rows = [], drawn = [];
  console.log('bases laid out in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  for (const c of LIST) {
    const t = Date.now(), r = await runEdit(env, c, bases), row = scoreEdit(c, r.base, r.after, r.text); rows.push(row);
    console.log((row.ok ? 'ok   ' : 'MISS ') + c.id.padEnd(4), (Date.now() - t + 'ms').padStart(7), c.ask.slice(0, 70), row.ok ? '' : '\n       ' + row.outcome.filter(x => !x.ok).map(x => x.name + ' → ' + x.got).join(' | ') + (row.honest ? '' : '  [not said]'));
    if (PNG && r.after) drawn.push({ c, base: r.base, after: r.after, row });
  }
  const md = table(rows) + '\n';
  console.log('\n' + md + '\n' + rows.length + ' edits in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  if (JS) fs.writeFileSync(JS, JSON.stringify(rows, null, 1));
  if (OUT) fs.writeFileSync(OUT, md + '\n' + failures(rows).join('\n') + '\n');
  if (PNG) await drawPairs(drawn, PNG, arg('--tag'));
}
// the base plan and the edited plan side by side, the edit's words as the caption (Chrome at CHROME_PATH or the macOS default)
export async function drawPairs(list, dir, tag) {
  const { planSVG } = await import('../lib/sitesheet.mjs'); fs.mkdirSync(dir, { recursive: true });
  const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  const puppeteer = (await import('puppeteer-core')).default, br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  for (const { c, base, after, row } of list) {
    const sv = p => planSVG(p, { px: 560, pad: 16 }).svg, m0 = SP.metrics(base), m1 = SP.metrics(after), num = m => [(m.units ? m.units + ' units · ' : '') + Math.round(m.gfa).toLocaleString() + ' sf', m.spaces + ' / ' + Math.round(m.required) + ' parking', 'open ' + Math.round(m.green * 100) + '%'].join(' · ');
    const said = (row.reply || '').split('\n').filter(l => /^- /.test(l)).slice(0, 6).map(esc).join('<br>');
    const html = '<!doctype html><meta charset="utf-8"><body style="margin:0;font:13px Arial;width:1180px;padding:10px;background:#fff;color:#111"><div style="font-weight:bold;font-size:16px">' + esc(c.id + ' · “' + c.ask + '”') + '</div><div style="color:' + (row.ok ? '#1a7f37' : '#b42318') + '">' + esc(row.outcome.map(x => (x.ok ? '✓ ' : '✗ ') + x.name + ' (' + x.got + ')').join(' · ')) + '</div>'
      + '<div style="display:flex;gap:12px;margin-top:6px"><div><div style="font-weight:bold">Before · ' + esc(num(m0)) + '</div>' + sv(base) + '</div><div><div style="font-weight:bold">After · ' + esc(num(m1)) + '</div>' + sv(after) + '</div></div><div style="color:#444;margin-top:4px">' + said + '</div></body>';
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 800 }); await pg.setContent(html); await pg.screenshot({ path: path.join(dir, (tag ? tag + '-' : '') + c.id + '.png'), fullPage: true }); await pg.close();
  }
  await br.close();
}
