// The site plan editor's tools, as plain maths: sets of pieces (several selected at once, a box drawn round them, moved,
// copied), measuring, the grid and its snapping, the layers you can hide or lock, drawn areas and lines (and whether
// they're valid), dimension labels and the save status's "3 min ago". No DOM and no map: plan feet in, plan feet out,
// so it can be tested (test/sitetools.mjs). Used by src/siteplan.js.
import * as S from './siteplan.mjs';

// ---------- sets of pieces ----------
const byId = (plan, id) => (plan.elements || []).find(e => e.id === id);
// the box round some pieces' outlines [x0, y0, x1, y1] (feet); null for none
export function bboxOf(pieces) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of pieces || []) for (const [x, y] of S.outline(e)) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return isFinite(x0) ? [x0, y0, x1, y1] : null;
}
// the ground some pieces cover (a building its footprint), sq ft
export const footprintOf = pieces => (pieces || []).reduce((s, e) => s + (e.kind === 'building' ? S.footArea(e) : S.elArea(e)), 0);
// the pieces a set takes along when it moves or is copied: each one and what's attached to it (a clubhouse's pool, a
// restaurant's patio and lane), once each, in plan order
export function withAttached(plan, ids) {
  const want = new Set(ids);
  for (const id of ids) { const e = byId(plan, id); if (e) for (const a of S.attachedTo(plan, e)) if (a.id != null) want.add(a.id); }
  return (plan.elements || []).filter(e => want.has(e.id));
}
// a set moved by dx, dy (feet), with what's attached (carry false: the ids already hold it): new elements (the moved
// pieces are copies, pinned), the ids moved
export function moveSet(plan, ids, dx, dy, carry = true) {
  const go = new Set(carry ? withAttached(plan, ids).map(e => e.id) : ids);
  const elements = (plan.elements || []).map(e => go.has(e.id) ? Object.assign(S.moveBy(structuredClone(e), dx, dy), { pinned: true }) : e);
  return { elements, moved: [...go] };
}
// copies of a set beside it: new ids, what's attached comes along, offset by the set's width along the first piece's
// axis plus a gap, then settled in the nearest clear spot (as a dropped building is). One main entry stays one: a copy
// of it is a plain drive. Returns { elements (the plan's, plus the copies), ids (the copies of the pieces asked for, in
// that order), all (every copy, what came along too), blocked (no clear spot near) }.
export function dupPieces(plan, ids, { newId = () => 'e' + Math.random().toString(36).slice(2, 9), gap = 20 } = {}) {
  const src = withAttached(plan, ids); if (!src.length) return { elements: plan.elements || [], ids: [], blocked: false };
  const first = byId(plan, ids.find(id => byId(plan, id))) || src[0], a = (first.rot ?? S.mainAngle(plan.ring || [[0, 0], [1, 0], [1, 1]])) * Math.PI / 180;
  const u = [Math.cos(a), Math.sin(a)], along = src.flatMap(e => S.outline(e).map(p => p[0] * u[0] + p[1] * u[1])), W = Math.max(...along) - Math.min(...along), off = W + gap;
  const map = new Map(), copies = src.map(e => { const c = structuredClone(e); c.id = newId(); map.set(e.id, c.id);
    for (const k of ['ext', 'entry', 'through']) delete c[k];
    if (c.name === 'Main entry' || /^Entrance\b/.test(c.name || '')) c.name = ''; else if (c.name) c.name = (c.name + ' copy').slice(0, 40);
    c.pinned = true; return S.moveBy(c, off * u[0], off * u[1]); });
  const lead = copies.find(c => ['building', 'garage'].includes(c.kind)) || copies[0], rest = copies.filter(c => c !== lead);
  let blocked = false;
  if (['building', 'garage', 'pool', 'court', 'play', 'pond', 'patio', 'trash'].includes(lead.kind) && (plan.ring || []).length >= 3) {
    const c = S.clearSpot(plan, lead, { carry: rest, reach: Math.max(200, off) });
    if (c) { if (c[0] || c[1]) for (const t of copies) S.moveBy(t, c[0], c[1]); } else blocked = true;
  }
  return { elements: (plan.elements || []).concat(copies), ids: ids.map(id => map.get(id)).filter(Boolean), all: copies.map(c => c.id), blocked };
}
// the pieces a box drawn on the map holds (wholly inside it): quad is its four corners in plan feet (the map may be
// turned, so it needn't be square to the plan). Hidden and locked layers are skipped, and so are house lots and the
// unnamed lawn under everything (it isn't drawn on its own).
export function boxSelect(plan, quad, view = null) {
  const q = Array.isArray(quad) ? quad : [[quad.x0, quad.y0], [quad.x1, quad.y0], [quad.x1, quad.y1], [quad.x0, quad.y1]];
  return (plan.elements || []).filter(e => e.kind !== 'lot' && !(e.kind === 'green' && !e.name) && e.id != null && editable(view, e) && S.outline(e).every(p => S.inRing(p, q))).map(e => e.id);
}

// ---------- layers: hide or lock a kind of thing (the view only: the numbers, the checks and the exports count all) ----------
export const LAYERS = [
  { id: 'buildings', label: 'Buildings', kinds: ['building', 'garage'], also: ['b3', 'walk', 'yard', 'fence'] },
  { id: 'paving', label: 'Parking & drives', kinds: ['parking', 'drive', 'truck'], also: ['paved', 'stall', 'island', 'ada', 'mark'] },
  { id: 'storm', label: 'Stormwater', kinds: ['pond'] },
  { id: 'land', label: 'Landscape & amenities', kinds: ['green', 'plaza', 'court', 'pool', 'play', 'trail', 'patio'] },
  { id: 'trash', label: 'Trash', kinds: ['trash'] },
  { id: 'trees', label: 'Trees', also: ['tree'] },
  { id: 'labels', label: 'Labels', also: ['label', 'dim'] },
  { id: 'setback', label: 'Setback line', also: ['setback'] },
  { id: 'parcels', label: 'Parcel lines', also: ['pline'] },
  { id: 'easements', label: 'Easements', kinds: ['keepout'] }
];
export const lockable = L => !!L.kinds;
export const layerOf = kind => LAYERS.find(L => L.kinds?.includes(kind))?.id || null;
export const viewOf = pl => { const v = pl?.view || {}; return { grid: [5, 10].includes(+v.grid) ? +v.grid : 0, snap: v.snap !== false, hidden: Array.isArray(v.hidden) ? v.hidden : [], locked: Array.isArray(v.locked) ? v.locked : [], ...([5, 10].includes(+v.lastGrid) ? { lastGrid: +v.lastGrid } : {}) }; }; // lastGrid: the size G turns back on
export const hiddenKind = (view, kind) => !!view && view.hidden.includes(layerOf(kind));
export const lockedKind = (view, kind) => !!view && view.locked.includes(layerOf(kind));
// can it be picked, boxed or nudged? not when its layer is hidden or locked
export const editable = (view, e) => !view || !hiddenKind(view, e.kind) && !lockedKind(view, e.kind);
// the map's features less the hidden layers (a piece's label goes with it)
export function visibleFeatures(fc, view) {
  if (!view?.hidden.length) return fc;
  const off = new Set(LAYERS.filter(L => view.hidden.includes(L.id)).flatMap(L => [...(L.kinds || []), ...(L.also || [])])), labels = off.has('label');
  const out = fc.features.filter(f => { const p = f.properties || {}; if (off.has(p.k)) return false; if ((p.k === 'label' || p.k === 'dim') && (labels || off.has(p.kind))) return false; return true; });
  const r = { ...fc, features: out }; if (fc.keep) Object.defineProperty(r, 'keep', { value: fc.keep }); return r;
}

// ---------- measuring ----------
export const pathLen = pts => (pts || []).reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
export const polyArea = pts => (pts || []).length >= 3 ? S.ringArea(pts) : 0;
export const fmtFt = v => Math.round(v).toLocaleString('en-US') + ' ft';
export const fmtArea = sf => Math.round(sf).toLocaleString('en-US') + ' sq ft · ' + (sf / 43560).toFixed(sf >= 43560 * 10 ? 1 : 2) + ' ac';
// labels for a measured line: each segment's length at its middle, and the running total
export function measureLabels(pts, closed = false) {
  const n = pts.length, segs = [];
  for (let i = 1; i < n + (closed && n >= 3 ? 1 : 0); i++) { const a = pts[i - 1], b = pts[i % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > 0.5) segs.push({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], text: fmtFt(L) }); }
  return segs;
}

// ---------- the grid: square to the lot's main lines, through the plan's origin ----------
const turn = ([x, y], deg) => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180); return [x * c - y * s, x * s + y * c]; };
export function snapPt(p, step, angle = 0) { if (!(step > 0)) return p; const q = turn(p, -angle); return turn([Math.round(q[0] / step) * step, Math.round(q[1] / step) * step], angle).map(v => +v.toFixed(2)); }
// the grid's lines over the site's box (in the grid's own frame), at most `max` of them (none when too many to draw)
export function gridLines(ring, step, angle = 0, max = 600) {
  if (!(step > 0) || !(ring?.length >= 3)) return [];
  const r = ring.map(p => turn(p, -angle)), xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  const x0 = Math.floor(Math.min(...xs) / step) * step, x1 = Math.ceil(Math.max(...xs) / step) * step, y0 = Math.floor(Math.min(...ys) / step) * step, y1 = Math.ceil(Math.max(...ys) / step) * step;
  if ((x1 - x0) / step + (y1 - y0) / step > max) return [];
  const out = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) out.push([turn([x, y0], angle), turn([x, y1], angle)]);
  for (let y = y0; y <= y1 + 1e-6; y += step) out.push([turn([x0, y], angle), turn([x1, y], angle)]);
  return out;
}

// ---------- drawing areas and lines ----------
export const AREA_KINDS = [['green', 'Landscape'], ['plaza', 'Plaza'], ['pond', 'Pond'], ['keepout', 'Easement / no-build area']];
export const LINE_KINDS = [['drive', 'Drive', 26], ['trail', 'Walk / trail', 6]];
export function selfIntersects(poly) {
  const n = poly.length; if (n < 4) return false;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (S.segsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true; }
  return false;
}
// is a drawn outline usable? at least three points, not crossing itself, inside the lot (an easement may run along
// the lot line). Returns an error sentence, or ''.
export function areaError(plan, poly, kind) {
  if ((poly || []).length < 3) return 'Click at least three points to make an area.';
  if (selfIntersects(poly)) return 'The outline crosses itself. Click the points in order round the area.';
  if (S.ringArea(poly) < 50) return 'That area is too small to keep.';
  const ring = plan.ring || [], tol = kind === 'keepout' ? 2 : 0.6, n = ring.length;
  const off = p => !S.inRing(p, ring) && ring.every((a, k) => S.segDist(p, a, ring[(k + 1) % n]) > tol);
  const crosses = poly.some((p, i) => ring.some((a, k) => S.segsCross(p, poly[(i + 1) % poly.length], a, ring[(k + 1) % n]) && S.segDist(p, a, ring[(k + 1) % n]) > tol && S.segDist(poly[(i + 1) % poly.length], a, ring[(k + 1) % n]) > tol));
  if (poly.some(off) || crosses) return 'It has to be inside the lot' + (kind === 'keepout' ? ' (an easement can run along the lot line).' : '.');
  return '';
}
export function lineError(plan, pts) {
  if ((pts || []).length < 2) return 'Click at least two points to make a line.';
  if (pathLen(pts) < 10) return 'That line is too short to keep.';
  const ring = plan.ring || [], n = ring.length;
  if (pts.some(p => !S.inRing(p, ring) && ring.every((a, k) => S.segDist(p, a, ring[(k + 1) % n]) > 3))) return 'It has to be inside the lot (a drive can end at the lot line).';
  return '';
}
const nextNum = (plan, kind, base) => { const re = new RegExp('^' + base + ' (\\d+)$'); return 1 + Math.max(0, ...(plan.elements || []).filter(e => e.kind === kind).map(e => +(re.exec(e.name || '')?.[1] || 0))); };
// a drawn area as a piece (plan feet, pinned: placed by hand)
export function areaPiece(plan, kind, poly, id) {
  const P = S.signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice(), c = S.centroid(P), b = bboxOf([{ poly: P }]);
  const name = kind === 'keepout' ? 'Easement ' + nextNum(plan, kind, 'Easement') : kind === 'green' ? 'Landscape ' + nextNum(plan, kind, 'Landscape') : '';
  return { id, kind, poly: P.map(p => p.map(v => +v.toFixed(2))), x: +c[0].toFixed(2), y: +c[1].toFixed(2), w: +(b[2] - b[0]).toFixed(2), d: +(b[3] - b[1]).toFixed(2), rot: 0, name, ...(kind === 'keepout' ? { note: 'Drawn, not surveyed' } : {}), pinned: true };
}
export function linePiece(plan, kind, pts, id, width) {
  const W = width || (LINE_KINDS.find(k => k[0] === kind)?.[2] ?? 26), L = pathLen(pts); let t = L / 2, at = pts[0];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]); if (t <= s) { at = [a[0] + (b[0] - a[0]) * t / (s || 1), a[1] + (b[1] - a[1]) * t / (s || 1)]; break; } t -= s; }
  const b = bboxOf([{ path: pts, width: W, r: 0 }]);
  return { id, kind, path: pts.map(p => p.map(v => +v.toFixed(2))), width: W, r: kind === 'drive' ? 20 : 8, x: +at[0].toFixed(2), y: +at[1].toFixed(2), w: +(b[2] - b[0]).toFixed(2), d: +(b[3] - b[1]).toFixed(2), name: '', note: kind === 'trail' ? 'Walk' : W + ' ft drive', pinned: true };
}

// ---------- dimensions: a selected piece's width and depth along two of its edges ----------
// [{ at, text, rot (degrees clockwise, kept upright, for a map-aligned label) }]
export function dimLabels(e, off = 10) {
  if (!e || S.isFree(e) || !(e.w > 0) || !(e.d > 0)) return [];
  const r = e.rot || 0, at = (u, v) => { const q = turn([u, v], r); return [+(e.x + q[0]).toFixed(2), +(e.y + q[1]).toFixed(2)]; }, up = a => { let d = ((-a % 360) + 540) % 360 - 180; if (d > 90) d -= 180; if (d <= -90) d += 180; return +d.toFixed(1); };
  return [{ at: at(0, -e.d / 2 - off), text: fmtFt(e.w), rot: up(r) }, { at: at(e.w / 2 + off, 0), text: fmtFt(e.d), rot: up(r + 90) }];
}

// ---------- the save status: "just now", "3 min ago" ----------
export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000)); if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60); return h < 24 ? h + ' h ago' : Math.round(h / 24) + ' d ago';
}
