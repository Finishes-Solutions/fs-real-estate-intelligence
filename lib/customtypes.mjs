// AI-crafted building types: a daycare, a pickleball club, an RV park, an event venue… anything the app has no use of its
// own for. The AI (api/siteplan.js) writes a recipe for it, and the layout engine (lib/sitelayout.mjs) draws it with its
// own machinery, so drives, parking, entrances, detention, trash and the checks work exactly as for a built-in use.
//
// A recipe: { name, pattern, buildings, outdoor, sites, parking, figures, assumptions }
//  - pattern: which of the engine's ways of laying out a site it takes: a building row facing its parking (row),
//    freestanding buildings (pads), a building with its outdoor pieces beside it (commons) or rows of sites on drive
//    aisles, the way self storage lays out its RV stalls (yard).
//  - buildings: [{ label, type (a library id) or w × d ft, floors, count }]
//  - outdoor: [{ kind (court, play, pool, plaza, green, patio, pavilion), label, w, d, count }]
//  - sites: { label, w, d, count } (a yard: RV sites, boat or truck spaces)
//  - parking: { per ('1000sf', seat, court, child, space, pad), rate, basis (the count it's based on), label, plus1k }
//  - figures: short lines for Numbers ("120 children", "8 courts")
// Everything the AI sized is clamped to sane bounds here and marked aiSized on the plan, so nobody takes it for a
// product sheet. Recipes can be saved to the team library (api/buildingtypes.js) and handed back to the AI to reuse.
import * as S from './siteplan.mjs';
import { typeById } from './buildings.mjs';

export const PATTERNS = {
  row: { label: 'A building row facing its parking', use: 'other' },
  pads: { label: 'Freestanding buildings', use: 'other' },
  commons: { label: 'A building with its outdoor pieces beside it', use: 'other' },
  yard: { label: 'Rows of sites on drive aisles', use: 'storage' }
};
// the outdoor pieces a recipe can hold, as the plan's own kinds, with a typical size (ft) when the AI gives none
export const OUTDOOR = {
  court: { kind: 'court', label: 'Courts', w: 30, d: 60 }, // a pickleball court with its run-out; courts sit edge to edge, fenced as one
  play: { kind: 'play', label: 'Playground', w: 64, d: 48 },
  pool: { kind: 'pool', label: 'Pool', w: 75, d: 35 },
  plaza: { kind: 'plaza', label: 'Plaza', w: 60, d: 40 },
  green: { kind: 'green', label: 'Lawn', w: 120, d: 80 },
  patio: { kind: 'patio', label: 'Patio', w: 40, d: 30 },
  pavilion: { kind: 'building', label: 'Pavilion', w: 60, d: 40 }
};
const ALIAS = { courts: 'court', pickleball: 'court', tennis: 'court', basketball: 'court', volleyball: 'court', playground: 'play', 'play area': 'play', lawn: 'green', field: 'green', garden: 'green', 'dog run': 'green', 'beer garden': 'patio', seating: 'patio', deck: 'plaza', shade: 'pavilion' };
// parking rules: spaces per what, the most a rule may ask, and the word for its count
export const PER = { '1000sf': ['per 1,000 sf', 30, 'sf'], seat: ['a seat', 1, 'seats'], court: ['a court', 12, 'courts'], child: ['a child', 1, 'children'], space: ['a site', 3, 'sites'], pad: ['a pad', 60, 'pads'] };
// sane bounds for what the AI sizes (feet, counts)
export const BOUNDS = { w: [16, 600], d: [16, 400], floors: [1, 6], count: [1, 12], foot: [200, 250000], ow: [10, 400], od: [10, 400], ocount: [1, 24], siteW: [10, 40], siteD: [20, 80], sites: [1, 400], basis: [1, 5000], plus1k: [0, 30] };

const txt = (v, n) => v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, n);
const f0 = v => Math.round(v).toLocaleString('en-US');
const plural = (n, w) => f0(n) + ' ' + w + (Math.round(n) === 1 ? '' : 's');

// a recipe made safe: unknown values dropped, every size inside its bounds (what was brought in is listed in `fixed`),
// a typical size where none was given. null when there is nothing to lay out (no name, no buildings), so the caller
// falls back to a plain building.
export function recipeIn(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const name = txt(r.name, 60); if (!name) return null;
  const fixed = [], num = (v, [lo, hi], d, what) => { const n = +v; if (v == null || v === '' || !Number.isFinite(n)) return d; if (n < lo || n > hi) fixed.push(what); return Math.max(lo, Math.min(hi, n)); };
  const buildings = (Array.isArray(r.buildings) ? r.buildings : []).slice(0, 6).map((b, i) => {
    if (!b || typeof b !== 'object') return null;
    const t = b.type ? typeById(String(b.type)) : null, label = txt(b.label, 40) || (t ? t.name.split(' · ')[0] : i ? 'Building ' + (i + 1) : name), count = Math.round(num(b.count, BOUNDS.count, 1, label + ' count'));
    if (t) return { label, type: t.id, w: t.w, d: t.d, floors: t.floors, count, ai: false };
    const sf = +b.sf > 0 ? +b.sf : null; let w = num(b.w, BOUNDS.w, null, label + ' width'), d = num(b.d, BOUNDS.d, null, label + ' depth');
    if (w == null && d == null && sf) { d = Math.max(BOUNDS.d[0], Math.min(120, Math.sqrt(sf / 1.6))); w = sf / d; } else if (w == null && d != null) w = sf ? sf / d : d * 1.6; else if (d == null && w != null) d = sf ? sf / w : w / 1.6;
    if (w == null || d == null || !(w > 0 && d > 0)) return null;
    w = Math.max(BOUNDS.w[0], Math.min(BOUNDS.w[1], w)); d = Math.max(BOUNDS.d[0], Math.min(BOUNDS.d[1], d));
    const a = w * d; if (a > BOUNDS.foot[1] || a < BOUNDS.foot[0]) { const k = Math.sqrt(Math.max(BOUNDS.foot[0], Math.min(BOUNDS.foot[1], a)) / a); w *= k; d *= k; fixed.push(label + ' footprint'); }
    return { label, type: null, w: Math.round(w), d: Math.round(d), floors: Math.round(num(b.floors, BOUNDS.floors, 1, label + ' floors')), count, ai: true };
  }).filter(Boolean);
  const outdoor = (Array.isArray(r.outdoor) ? r.outdoor : []).slice(0, 8).map(o => {
    if (!o || typeof o !== 'object') return null;
    const k0 = String(o.key || o.kind || '').toLowerCase().trim(), key = OUTDOOR[k0] ? k0 : ALIAS[k0] || null; if (!key) return null;
    const D = OUTDOOR[key], label = txt(o.label, 40) || D.label;
    return { key, kind: D.kind, label, w: Math.round(num(o.w, BOUNDS.ow, D.w, label + ' width')), d: Math.round(num(o.d, BOUNDS.od, D.d, label + ' depth')), count: Math.round(num(o.count, BOUNDS.ocount, 1, label + ' count')), ai: true };
  }).filter(Boolean);
  const s0 = r.sites && typeof r.sites === 'object' && +r.sites.count > 0 ? r.sites : null;
  const sites = s0 ? { label: txt(s0.label, 30) || 'Site', w: Math.round(num(s0.w, BOUNDS.siteW, 24, 'site width')), d: Math.round(num(s0.d, BOUNDS.siteD, 50, 'site depth')), count: Math.round(num(s0.count, BOUNDS.sites, 20, 'sites')), ai: true } : null;
  let pattern = PATTERNS[r.pattern] ? r.pattern : sites ? 'yard' : outdoor.length ? 'commons' : buildings.reduce((n, b) => n + b.count, 0) > 1 ? 'pads' : 'row';
  if (pattern === 'yard' && !sites) pattern = outdoor.length ? 'commons' : 'row';
  if (!buildings.length && pattern !== 'yard') return null; // nothing to draw
  if (pattern === 'yard' && !buildings.length) buildings.push({ label: 'Office', type: null, w: 40, d: 30, floors: 1, count: 1, ai: true });
  const p0 = r.parking && typeof r.parking === 'object' ? r.parking : {}, per = PER[p0.per] ? p0.per : '1000sf';
  const parking = { per, rate: +num(p0.rate, [0, PER[per][1]], per === '1000sf' ? 3 : null, 'parking rate'), basis: p0.basis == null ? null : Math.round(num(p0.basis, BOUNDS.basis, null, 'parking basis')), label: txt(p0.label, 24) || PER[per][2], plus1k: +num(p0.plus1k, BOUNDS.plus1k, 0, 'parking per 1,000 sf') };
  if (parking.rate == null || per !== '1000sf' && parking.basis == null && !['court', 'pad', 'space'].includes(per)) { parking.per = '1000sf'; parking.rate = 3; parking.basis = null; parking.label = 'sf'; fixed.push('parking rule (3 per 1,000 sf used)'); } // a rule with nothing to count: the generic one
  const figures = (Array.isArray(r.figures) ? r.figures : []).map(t => txt(t, 40)).filter(Boolean).slice(0, 6);
  const assumptions = (Array.isArray(r.assumptions) ? r.assumptions : []).map(t => txt(t, 160)).filter(Boolean).slice(0, 4);
  const prior = (Array.isArray(r.fixed) ? r.fixed : []).map(t => txt(t, 60)).filter(Boolean);
  const out = { name, pattern, buildings, outdoor: pattern === 'yard' ? [] : outdoor, sites: pattern === 'yard' ? sites : null, parking, figures, assumptions, fixed: [...new Set([...prior, ...fixed])].slice(0, 8), ai: buildings.some(b => b.ai) || outdoor.length > 0 || !!sites };
  if (r.id && /^[\w-]{3,60}$/.test(String(r.id))) out.id = String(r.id);
  return out;
}

// the recipe's floor area (all floors), its footprint and the courts and pads it holds
export const recipeGfa = r => r.buildings.reduce((s, b) => s + b.w * b.d * b.floors * b.count, 0);
const recipeFoot = r => r.buildings.reduce((s, b) => s + b.w * b.d * b.count, 0);
const courtsOf = (outdoor = []) => outdoor.filter(o => o.key === 'court').reduce((s, o) => s + o.count, 0);
// the spaces the rule asks for, and the rule in words ("0.25 a child × 120 children = 30 spaces"). drawn: what the plan
// actually holds ({ courts, sites, pads }) when it differs from the recipe (fewer courts fitted).
export function parkingNeed(r, drawn = {}) {
  const p = r.parking, gfa = recipeGfa(r), per = PER[p.per] ? p.per : '1000sf';
  const basis = per === '1000sf' ? gfa / 1000 : per === 'court' ? drawn.courts ?? (courtsOf(r.outdoor) || p.basis || 0) : per === 'pad' ? drawn.pads ?? r.buildings.reduce((s, b) => s + b.count, 0) : per === 'space' ? drawn.sites ?? r.sites?.count ?? p.basis ?? 0 : p.basis || 0;
  const plus = per !== '1000sf' && p.plus1k > 0 ? gfa / 1000 * p.plus1k : 0, spaces = Math.ceil(p.rate * basis + plus - 0.01);
  const rate = +p.rate.toFixed(2), what = per === '1000sf' ? rate + ' per 1,000 sf × ' + f0(gfa) + ' sf' : rate + ' ' + PER[per][0] + ' × ' + f0(basis) + ' ' + (basis === 1 ? (p.label || PER[per][2]).replace(/(?:ren|s)$/, '') : p.label || PER[per][2]);
  return { spaces, basis, text: what + (plus ? ' + ' + (+p.plus1k.toFixed(2)) + ' per 1,000 sf of building' : '') + ' = ' + plural(spaces, 'space') };
}
// a rule per court with courts on the ground, or per site in a yard: each court or row of sites carries its own spaces
// (they don't shrink with the building, and fewer sites fitted need fewer); the building's ratio is then only what's on
// top (plus1k). Any other rule is the building's: its children, seats, pads.
export const onCourts = r => r.parking.per === 'court' && courtsOf(r.outdoor) > 0;
const onSites = r => r.parking.per === 'space' && r.pattern === 'yard' && !!r.sites;
const buildingNeed = r => onCourts(r) || onSites(r) ? recipeGfa(r) / 1000 * (r.parking.plus1k || 0) : parkingNeed(r).spaces;
const down4 = v => Math.floor(v * 1e4) / 1e4; // a ratio to 4 places, never more spaces than the rule asks
// a site-level choice the AI made for the whole program (stormwater, entrances, trash) carried onto the custom one
const KEEP = ['storm', 'detentionPct', 'entrances', 'trash', 'through'];
// the program the engine lays out for a recipe: a plain building use with the rule turned into its ratio (spaces per
// 1,000 sf of the building), or self storage's RV rows for a yard; the recipe rides along as program.custom
export function programOf(r, base = {}) {
  const gfa = recipeGfa(r), foot = recipeFoot(r), need = buildingNeed(r), n = r.buildings.reduce((s, b) => s + b.count, 0), main = r.buildings.slice().sort((a, b) => b.w * b.d - a.w * a.d)[0];
  const keep = Object.fromEntries(KEEP.filter(k => base?.[k] != null).map(k => [k, base[k]]));
  if (r.pattern === 'yard') { const off = Math.round(foot) || 1200; return { ...keep, use: 'storage', floors: 1, gfa: null, ratio: down4(need / off * 1000), storage: { climateSf: 0, driveSf: 0, officeSf: off, rv: r.sites.count, rvW: r.sites.w, rvD: r.sites.d, rvRows: true, aisle: 30, fence: true }, custom: r }; }
  const floors = Math.max(1, Math.round(gfa / Math.max(1, foot)));
  return { ...keep, use: 'other', gfa: Math.round(gfa), floors, buildings: n, depth: Math.max(30, Math.min(600, main.d)), ratio: gfa ? down4(need / gfa * 1000) : 0, extras: [], custom: r };
}
// is this program a custom type the engine should lay out as one (the use still the one its recipe set)?
export const customOf = prog => { const r = prog?.custom; return r && typeof r === 'object' && r.name && (r.pattern === 'yard' ? prog.use === 'storage' : prog.use === 'other') ? r : null; };

// ---------- the outdoor pieces, packed into one piece of ground ----------
const GAP = 12, M = 8; // ft between blocks; margin round the ground, inside its edge
// blocks of pieces: courts edge to edge in a grid, a pool on its deck with a pool house, the rest one by one
function blocksOf(outdoor, tall) {
  const out = [];
  for (const o of outdoor) {
    if (o.key === 'court') {
      const n = o.count, across = tall ? Math.min(n, n <= 2 ? 1 : 2) : Math.ceil(n / (n <= 2 ? 1 : n <= 8 ? 2 : Math.ceil(n / 4))), rows = Math.ceil(n / across), items = [];
      for (let k = 0; k < n; k++) items.push({ o, x: (k % across) * o.w, y: Math.floor(k / across) * o.d, w: o.w, d: o.d, first: k === 0 });
      out.push({ w: across * o.w, d: rows * o.d, items });
    } else if (o.key === 'pool') for (let k = 0; k < o.count; k++) {
      const dw = o.w + 24, dd = o.d + 24, hw = 24, hd = Math.min(dd, 36);
      out.push({ w: dw + 4 + hw, d: dd, items: [{ o, part: 'deck', x: 0, y: 0, w: dw, d: dd }, { o, x: 12, y: 12, w: o.w, d: o.d, first: k === 0 }, { o, part: 'house', x: dw + 4, y: (dd - hd) / 2, w: hw, d: hd }] });
    } else for (let k = 0; k < o.count; k++) out.push({ w: o.w, d: o.d, items: [{ o, x: 0, y: 0, w: o.w, d: o.d, first: k === 0, k }] });
  }
  return out;
}
// shelf-pack the blocks into one rectangle, wider than deep (or deeper than wide when tall): { w, h, items }
export function packOutdoor(outdoor, tall = false) {
  const blocks = blocksOf(outdoor, tall).sort((a, b) => b.d - a.d || b.w - a.w); if (!blocks.length) return null;
  const area = blocks.reduce((s, b) => s + (b.w + GAP) * (b.d + GAP), 0), widest = Math.max(...blocks.map(b => b.w));
  const TW = Math.max(widest, Math.sqrt(area * (tall ? 0.5 : 2)));
  let x = 0, y = 0, rowH = 0, W = 0; const items = [];
  for (const b of blocks) {
    if (x > 0 && x + b.w > TW + 0.5) { y += rowH + GAP; x = 0; rowH = 0; }
    for (const it of b.items) items.push({ ...it, x: it.x + x, y: it.y + y });
    x += b.w + GAP; rowH = Math.max(rowH, b.d); W = Math.max(W, x - GAP);
  }
  return { w: W, h: y + rowH, items };
}
// fewer of the biggest repeated piece (courts first), for a site that can't hold them all; null when nothing can go
function shrink(outdoor, f) {
  const out = outdoor.map(o => ({ ...o })), big = out.filter(o => o.count > 1).sort((a, b) => (b.key === 'court') - (a.key === 'court') || b.w * b.d * b.count - a.w * a.d * a.count)[0];
  if (!big) return null; big.count = Math.max(1, Math.floor(big.count * f)); return out;
}

// where the ground for the outdoor pieces can go, in the layout's frame (the street along the bottom): just behind where
// the building and its parking should end on a deep lot (stack: about how deep they run from the street), at the back of
// the lot (the middle, the left and the right of the highest band it fits), then a side halfway back. Frame feet.
function spotsFor(F, T, pk, keep, key, stack = 0) {
  const W = pk.w + 2 * M, H = pk.h + 2 * M, P = T.profile(F), out = [], mid = (F.X0 + F.X1) / 2;
  const fit = (y0, at, xs) => { const sp = T.spans(F, y0, y0 + H, key, keep).filter(([a, b]) => b - a >= W); if (!sp.length) return false;
    for (const [a, b] of sp) for (const [k, x] of xs(a, b)) { const x0 = Math.max(a, Math.min(b - W, x)); if (!out.some(c => Math.abs(c.x0 - x0) < 20 && Math.abs(c.y0 - y0) < 20)) out.push({ at: at + k, x0, y0, W, H }); } return true; };
  if (stack && P.p[0] + stack + H + 150 < P.p[1]) for (let y0 = P.p[0] + stack; y0 + H <= P.p[1] - 150; y0 += 8) if (fit(y0, 'behind', (a, b) => [['', mid - W / 2], ['-left', a], ['-right', b - W]])) break; // (a deep lot: right behind the building, not out at the far end)
  for (let y1 = P.p[1]; y1 - H >= P.p[0] - 1; y1 -= 8) if (fit(y1 - H, 'back', (a, b) => [['', mid - W / 2], ['-left', a], ['-right', b - W]])) break;
  const ym = (P.p[0] + P.p[1]) / 2 - H / 2; fit(ym, 'side', (a, b) => [['-left', a], ['-right', b - W]]);
  return out;
}
const norm = d => +((((d % 360) + 360) % 360).toFixed(3));
const uid = () => 'cu' + Math.random().toString(36).slice(2, 9);
// the pieces of a packed ground at spot c, as plan elements (pinned: a re-fit keeps them where they are)
function piecesAt(F, c, pk, r) {
  const at = (x, y) => S.rotPt([x, y], F.psi), els = [], rot = norm(F.psi), x0 = c.x0 + M, y0 = c.y0 + M;
  const ctr = at(c.x0 + c.W / 2, c.y0 + c.H / 2); // the ground itself: a lawn under it all (no trees on the courts)
  els.push({ id: uid(), kind: 'green', x: +ctr[0].toFixed(2), y: +ctr[1].toFixed(2), w: +c.W.toFixed(2), d: +c.H.toFixed(2), rot, name: '', note: 'Lawn', trees: false, custom: r.name, pinned: true });
  for (const it of pk.items) {
    const p = at(x0 + it.x + it.w / 2, y0 + it.y + it.d / 2), o = it.o, base = { id: uid(), x: +p[0].toFixed(2), y: +p[1].toFixed(2), w: it.w, d: it.d, rot, custom: r.name, aiSized: true, pinned: true };
    const many = o.count > 1, size = it.w + ' × ' + it.d + ' ft'; base.part = it.part || o.key; if (o.key === 'court' && onCourts(r)) base.park = r.parking.rate; // its players' cars
    if (it.part === 'deck') els.push({ ...base, kind: 'plaza', name: '', note: 'Pool deck' });
    else if (it.part === 'house') els.push({ ...base, kind: 'building', use: 'amenity', floors: 1, name: 'Pool house', note: 'Restrooms · pump room · AI-sized' });
    else if (o.key === 'pavilion') els.push({ ...base, kind: 'building', use: 'amenity', floors: 1, name: it.first ? o.label : '', note: (it.first && many ? o.count + ' × ' : '') + size + ' · AI-sized' });
    else if (o.key === 'green') els.push({ ...base, kind: 'green', name: it.first ? o.label : '', note: (it.first && many ? o.count + ' × ' : '') + size + ' · AI-sized', trees: false });
    else els.push({ ...base, kind: o.kind, name: it.first ? o.label : '', note: it.first ? (many ? o.count + (o.key === 'court' ? ' courts · ' : ' × ') : '') + size + ' · AI-sized' : '' });
  }
  return els;
}

// ---------- laying a custom type out ----------
const GROUND = 'custom-ground'; // the keep-out that holds the outdoor pieces' ground while the rest is laid out
// options for a program with a custom recipe. T: the engine's helpers (lib/sitelayout.mjs): layoutOptions, frameOf,
// spans, profile. The engine lays out the buildings, parking and the rest; the outdoor pieces get their ground first
// (a keep-out the engine stays off, as it does an easement), at the back or a side, and are drawn on it after.
export function customOptions(plan, programIn, opts = {}, T) {
  const P0 = S.normalizeProgram(programIn), r = customOf(P0) && recipeIn(P0.custom), inner = (prog, o = {}) => T.layoutOptions(plan, prog, { ...opts, noCustom: true, noFill: true, ...o });
  if (!r) return inner(programIn);
  if (opts.pinned?.length) return inner(programIn).map(o => dressed(o, r, [])); // a re-fit: the outdoor pieces are pinned, the rest lays out round them
  if (r.pattern !== 'commons' || !r.outdoor.length) return parkedFirst(plan, inner(programIn, onSites(r) ? { xNeed: Math.ceil(r.parking.rate * r.sites.count - 0.01) } : {}).map(o => dressed(o, r, [])));
  return commonsOptions(plan, programIn, r, opts, T, inner);
}
function commonsOptions(plan, programIn, r, opts, T, inner) {
  const F = T.frameOf(plan, false), toF = p => S.rotPt(p, -F.psi), user = opts.keepout || [], keep = user.map(e => ({ p: S.grow(S.shapeOf(e), 6).map(toF), g: 0 })), N = opts.count || 3, found = [];
  const budget = Math.min(opts.budgetMs ?? 3000, 1000), P0 = S.normalizeProgram(programIn), gfa0 = P0.gfa || recipeGfa(r);
  // about how deep the building and its parking run from the street: rows of stalls across the lot, then the building
  const across = Math.max(60, (F.X1 - F.X0) * 0.8), spaces = Math.ceil(gfa0 / 1000 * P0.ratio + (onCourts(r) ? r.parking.rate * courtsOf(r.outdoor) : 0)), mods = Math.max(1, Math.ceil(spaces / (2 * Math.floor(across / 9))));
  const stack = 40 + mods * 60 + 15 + Math.min(P0.depth || 70, gfa0 / P0.floors / 60) + 30;
  let used = r.outdoor, shortNote = '', runs = 0;
  for (const f of [1, 0.75, 0.5, 0.25]) {
    const outdoor = f === 1 ? r.outdoor : shrink(used, f / (f + 0.25)); if (!outdoor) break; used = outdoor;
    const r2 = { ...r, outdoor }, xNeed = onCourts(r2) ? r.parking.rate * courtsOf(outdoor) : 0; // the courts' spaces, laid out with the rest
    const key = outdoor.some(o => o.key === 'pavilion' || o.key === 'pool') ? 'build' : 'pave';
    const cands = [false, true].flatMap(tall => { const pk = packOutdoor(outdoor, tall); return pk ? spotsFor(F, T, pk, keep, key, stack).map(c => ({ ...c, pk, tall })) : []; })
      .sort((a, b) => (a.at.startsWith('side') - b.at.startsWith('side')) || a.tall - b.tall || (a.at.startsWith('back') - b.at.startsWith('back')) || (!/-/.test(b.at) - !/-/.test(a.at)));
    for (const [ci, c] of cands.slice(0, f === 1 ? 5 : 2).entries()) {
      if (++runs > 9) break; // (each run is a full layout search: a few seconds at most in all)
      const ctr = S.rotPt([c.x0 + c.W / 2, c.y0 + c.H / 2], F.psi), ground = { id: GROUND, kind: 'keepout', x: ctr[0], y: ctr[1], w: c.W, d: c.H, rot: norm(F.psi), name: '', note: '' };
      let list = []; try { list = inner(programIn, { keepout: [...user, ground], count: Math.max(2, Math.min(N, 3)), budgetMs: budget, ...(xNeed ? { xNeed } : {}) }); } catch (e) { list = []; }
      const pieces = piecesAt(F, c, c.pk, r2);
      for (const o of list) {
        if (!o.elements?.length || !o.elements.some(e => e.kind === 'building' && e.use !== 'amenity')) continue;
        const els = o.elements.filter(e => e.id !== GROUND).concat(pieces.map(e => ({ ...e }))), pl = { ...plan, program: o.program, elements: els };
        const issues = S.check(pl); if (issues.some(i => i.level === 'bad')) continue;
        const m = S.metrics(pl), B = els.filter(e => e.kind === 'building' && e.use !== 'amenity' && !e.custom).sort((a, b) => S.gfaOf(b) - S.gfaOf(a))[0], gfa = els.filter(e => e.kind === 'building' && e.use !== 'amenity').reduce((t, e) => t + S.gfaOf(e), 0);
        const near = B ? S.gapBetween(S.shapeOf(ground), S.shapeOf(B)) : 300, short = Math.max(0, m.required - m.spaces);
        found.push({ o: { ...o, elements: els, notes: (short ? ['Parking is ' + S.spacesWord(short) + ' short of ' + m.required + '.'] : []).concat((o.notes || []).filter(t => !/^Parking is .* short/.test(t))), program: { ...o.program, ...(f < 1 ? { custom: r2 } : {}) } },
          parked: !short, rank: (o.score ?? 0) - issues.length * 150 - near * 2 - Math.max(0, near - 100) * 20 - Math.max(0, gfa0 - gfa) / gfa0 * 3000 - (f < 1 ? 5000 * (1 - f) : 0), key: c.at + (c.tall ? '|tall' : ''), f });
      }
      if (ci >= 2 && found.filter(x => x.parked).length >= N && new Set(found.map(x => x.key)).size >= 2) break;
    }
    if (found.some(x => x.parked)) { if (f < 1) shortNote = roomFor(r.outdoor, outdoor); break; }
  }
  if (!found.length) { // no ground for them anywhere: the buildings alone, saying so
    const what = r.outdoor.map(o => (o.count > 1 ? o.count + ' ' : '') + lower(o.label)).join(', ');
    return inner(programIn).map(o => dressed(o, { ...r, outdoor: [] }, ['No room on this site for the ' + what + ' beside the building; add them by hand where they fit.']));
  }
  found.sort((a, b) => b.parked - a.parked || b.rank - a.rank);
  const pick = [];
  const same = (x, p) => p.key === x.key && p.o.name === x.o.name;
  for (const ok of [x => x.parked && !pick.some(p => p.key === x.key), x => x.parked, () => true]) // parked, the ground in different spots first; then other parked versions; then the rest
    for (const x of found) if (pick.length < N && ok(x) && !pick.includes(x) && !pick.some(p => same(x, p))) pick.push(x);
  return pick.map(x => dressed(x.o, x.o.program.custom || r, shortNote ? [shortNote] : [], x.key));
}
// enough parking first (the engine's own order can put a layout with a second entrance ahead), otherwise as it ranked them;
// the engine's stand-in simple layouts (a box and a lot) only when nothing else came, and a yard's layouts with its sites
const parkedFirst = (plan, list0) => { const real = list0.filter(o => !/^Simple layout/.test(o.name || '')), sited = real.filter(o => !o.custom || !o.elements?.some(e => e.kind === 'building' && e.use === 'storage') || o.elements.some(e => e.rv)), list = sited.length ? sited : real.length ? real : list0; return list.map((o, i) => ({ o, i, ok: !o.elements?.length || (m => m.spaces >= m.required)(S.metrics({ ...plan, program: o.program, elements: o.elements })) })).sort((a, b) => b.ok - a.ok || a.i - b.i).map(x => x.o); };
const roomFor = (asked, got) => { const a = asked.find(o => got.some(g => g.key === o.key && g.count < o.count)), g = a && got.find(x => x.key === a.key); return a ? 'Room for ' + g.count + ' of the ' + a.count + ' ' + lower(a.label) + ' asked for.' : ''; };
// an option dressed as its type: the buildings named and noted from the recipe (biggest onto biggest), AI-sized marked,
// the rule and the AI's assumptions in the notes
function dressed(o, r, extra = [], spot = '') {
  if (!o?.elements?.length) return o;
  const yard = r.pattern === 'yard', els = o.elements.map(e => ({ ...e })), mine = e => e.kind === 'building' && !e.custom && (yard ? e.use === 'storage' : e.use === 'other');
  const B = els.filter(mine).sort((a, b) => S.gfaOf(b) - S.gfaOf(a)), want = r.buildings.flatMap(b => Array(b.count).fill(b)).sort((a, b) => b.w * b.d * b.floors - a.w * a.d * a.floors);
  const labels = B.map((e, i) => (want[Math.min(i, want.length - 1)] || { label: r.name, ai: true })), seen = {}, many = l => labels.filter(x => x.label === l.label).length > 1;
  B.forEach((e, i) => { const b = labels[i], one = B.length === 1; seen[b.label] = (seen[b.label] || 0) + 1;
    e.name = one && !yard ? r.name : many(b) ? b.label + ' ' + String.fromCharCode(64 + seen[b.label]) : b.label; e.note = (one && b.label !== r.name ? b.label + ' · ' : '') + (b.ai ? 'AI-sized' : 'Library type'); e.custom = r.name; if (b.ai) e.aiSized = true; else if (b.type) e.type = b.type; });
  if (yard) for (const e of els) if (e.kind === 'parking' && e.rv) { e.note = r.sites.label + ' · ' + r.sites.w + ' × ' + r.sites.d + ' ft · AI-sized'; e.site = r.sites.label; e.aiSized = true; e.custom = r.name; if (onSites(r)) e.park = +(r.parking.rate * S.stalls(e).count).toFixed(2); } // its visitors' cars
  const sites = yard ? els.filter(e => e.rv).reduce((s, e) => s + S.stalls(e).count, 0) : null, pads = r.parking.per === 'pad' ? B.length : null, courts = els.filter(e => e.kind === 'court' && e.custom).length;
  const rule = parkingNeed(r, { courts, ...(sites != null ? { sites } : {}), ...(pads != null ? { pads } : {}) }).text;
  const notes = [...extra, ...(o.notes || []).filter(n => !/RV \/ boat spaces asked for/.test(n))];
  if (yard && sites < r.sites.count) notes.unshift('Room for ' + sites + ' of the ' + r.sites.count + ' ' + lower(r.sites.label) + 's asked for.');
  notes.push(r.name + ' is an AI-crafted type (' + PATTERNS[r.pattern].label.toLowerCase() + '): its sizes are the AI’s, not a product sheet.', 'Spaces needed by the AI’s rule: ' + rule + '.');
  for (const a of r.assumptions || []) notes.push('Assumed: ' + a.replace(/\.$/, '') + '.');
  if (r.fixed?.length) notes.push('Brought into range: ' + r.fixed.join(', ') + '.');
  return { ...o, elements: els, notes, custom: r.name, ...(spot ? { name: o.name + ' · ' + spotWord(spot) } : {}) };
}
const lower = t => t.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase()); // "Pickleball courts" → "pickleball courts", "RV site" stays
const spotWord = k => ({ behind: 'grounds behind', back: 'grounds behind', 'back-left': 'grounds behind, one end', 'back-right': 'grounds behind, other end', 'behind-left': 'grounds behind, one end', 'behind-right': 'grounds behind, other end', 'side-left': 'grounds at one side', 'side-right': 'grounds at the other side' })[k.split('|')[0]] || 'grounds beside';

// ---------- what a plan's custom type holds, for Numbers and the readouts ----------
// { name, recipe, figures, rule, courts, sites, outdoor: [{ label, count }], ai } or null
export function customStats(plan) {
  const P = S.normalizeProgram(plan.program), r = customOf(P) && recipeIn(P.custom); if (!r) return null;
  const els = plan.elements || [], courts = els.filter(e => e.kind === 'court' && e.custom).length, sites = els.filter(e => e.kind === 'parking' && e.rv).reduce((s, e) => s + S.stalls(e).count, 0);
  const pads = els.filter(e => e.kind === 'building' && e.custom && e.use !== 'amenity').length, drawn = { courts, ...(r.pattern === 'yard' ? { sites } : {}), ...(r.parking.per === 'pad' ? { pads } : {}) };
  const outdoor = r.outdoor.map(o => ({ label: o.label, key: o.key, asked: o.count, count: els.filter(e => e.custom && e.part === o.key).length })); // (each piece carries its part)
  return { name: r.name, recipe: r, figures: r.figures, rule: parkingNeed(r, drawn), courts, sites, outdoor, ai: r.ai, pattern: PATTERNS[r.pattern].label };
}

// ---------- the team library ----------
// a saved building type: { id, name, w, d, floors, use, note, units?, type?, recipe?, source, by, at, updated }. source:
// ai (an AI-crafted type, with its recipe), hand (a building sized by hand) or library (a library type kept under a
// team name). Cleaned the same way by the browser and api/buildingtypes.js.
const ID = /^[\w-]{3,60}$/;
const iso = v => { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
export function teamTypeIn(t) {
  if (!t || typeof t !== 'object' || !ID.test(String(t.id || ''))) return null;
  const name = txt(t.name, 60), recipe = t.recipe ? recipeIn(t.recipe) : null; if (!name) return null;
  const n = (v, [lo, hi], d) => Number.isFinite(+v) && v != null && v !== '' ? Math.max(lo, Math.min(hi, +v)) : d;
  const main = recipe ? recipe.buildings.slice().sort((a, b) => b.w * b.d - a.w * a.d)[0] : null;
  const w = Math.round(n(t.w, BOUNDS.w, main?.w ?? 100)), d = Math.round(n(t.d, BOUNDS.d, main?.d ?? 60));
  const use = S.USES[t.use] ? t.use : 'other', updated = iso(t.updated) || new Date().toISOString();
  return { id: String(t.id), name, w, d, floors: Math.round(n(t.floors, [1, 40], main?.floors ?? 1)), use, note: txt(t.note, 80), ...(+t.units > 0 ? { units: Math.round(n(t.units, [1, 2000], 1)) } : {}),
    ...(t.type && typeById(String(t.type)) ? { type: String(t.type) } : {}), recipe: recipe ? { ...recipe, name } : null, source: ['ai', 'hand', 'library'].includes(t.source) ? t.source : recipe ? 'ai' : 'hand',
    by: txt(t.by, 80), at: iso(t.at) || updated, updated };
}
// a team type as a library type the Draw / Add sections and the Selected box can use
export function libraryTypeOf(t) {
  return { id: 'team:' + t.id, family: 'team', group: 'Team', use: t.recipe?.pattern === 'yard' ? 'other' : t.use, name: t.name + ' · ' + t.w + ' × ' + t.d + ' ft' + (t.floors > 1 ? ' · ' + t.floors + '-story' : ''), w: t.w, d: t.d, floors: t.floors,
    note: (t.note || t.name) + (t.recipe?.ai || t.source === 'ai' ? ' · AI-sized' : ''), ...(t.units ? { units: t.units } : {}), team: t.id, ...(t.recipe ? { custom: t.recipe.name } : {}), ...(t.recipe?.ai ? { aiSized: true } : {}) };
}
// what the AI is told about the team's saved types: names, sizes and recipes, kept short
export function teamTypesForAI(list) {
  const out = []; let size = 0;
  for (const t0 of Array.isArray(list) ? list : []) { const t = teamTypeIn(t0); if (!t) continue;
    const r = t.recipe, x = { name: t.name, use: t.use, w: t.w, d: t.d, floors: t.floors, ...(r ? { recipe: { pattern: r.pattern, buildings: r.buildings.map(({ label, type, w, d, floors, count }) => ({ label, type, w, d, floors, count })), outdoor: r.outdoor.map(({ key, label, w, d, count }) => ({ kind: key, label, w, d, count })), sites: r.sites ? { label: r.sites.label, w: r.sites.w, d: r.sites.d, count: r.sites.count } : null, parking: r.parking, figures: r.figures } } : {}) };
    size += JSON.stringify(x).length; if (size > 12000 || out.length >= 30) break; out.push(x); }
  return out;
}
// a building on the plan as a team type to save: its size, use and type, and the recipe when it is part of a custom type
export function teamTypeFrom(e, prog, { id, by } = {}) {
  const r = customOf(S.normalizeProgram(prog)) && e.custom ? recipeIn(S.normalizeProgram(prog).custom) : null, now = new Date().toISOString();
  return teamTypeIn({ id, name: r ? r.name : e.name || S.USES[e.use]?.label || 'Building', w: e.w, d: e.d, floors: e.floors || 1, use: e.use || S.normalizeProgram(prog).use, note: r ? r.name : e.note || '', units: e.units, type: e.type, recipe: r, source: r ? 'ai' : e.type ? 'library' : 'hand', by, at: now, updated: now });
}
