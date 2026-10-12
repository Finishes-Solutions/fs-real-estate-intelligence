// Site plan drawings: the plan as SVG (for the PDF sheet and previews) and the whole sheet as a printable HTML page:
// the plan to scale with north arrow and scale bar, title block, site data and land use, program and parking,
// parcels, notes from the site facts, legend and a conceptual-only disclaimer. Shared by the browser and the tests.
import * as S from './siteplan.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f0 = v => Math.round(v).toLocaleString('en-US');
export const PALETTE = {
  lot: '#fbfbf8', paving: '#d7d9d6', curb: '#9fa29d', ada: '#2f6db5', trash: '#a59f92', stripe: '#ffffff', walk: '#efefea', green: '#cfe3bf', tree: '#7fae5f', treeLine: '#55803c', pond: '#9cc7e8', bank: '#d9c9a3',
  court: '#5a87a8', pool: '#8fd3ec', play: '#e8d3a8', plaza: '#e6d6bd', boundary: '#c0392b', setback: '#9aa0a2', text: '#1b1e1f',
  use: { retail: '#c8673d', restaurant: '#c8673d', office: '#b5553c', medical: '#b5553c', other: '#b0603f', industrial: '#a2775b', multifamily: '#d8b16a', townhomes: '#b8865b', duplex: '#d9a77c', amenity: '#8a6fb3' }
};
export const LEGEND = [['Retail / commercial building', 'retail'], ['Apartments', 'multifamily'], ['Townhomes', 'townhomes'], ['Duplexes / cottages', 'duplex'], ['Industrial', 'industrial'], ['Community / amenity building', 'amenity'],
  ['Asphalt / concrete paving', 'paving'], ['Detention / amenity lake', 'pond'], ['Landscape / open space', 'green'], ['Accessible (ADA) stall', 'ada'], ['Trash enclosure', 'trash'], ['Canopy tree (proposed)', 'tree'], ['Boundary', 'boundary'], ['Building setback', 'setback']];

// the angle (degrees) to turn a plan so its street side is at the bottom of the sheet, as site plans are drawn
export function streetDown(plan) {
  const r = plan.ring || []; if (r.length < 3) return 0;
  const n = S.outwardOf(r, plan.front != null && plan.front < r.length ? plan.front : S.longestEdge(r)); return Math.atan2(n[1], n[0]) * 180 / Math.PI + 90;
}
// the plan turned by `deg` (counter-clockwise turns the drawing clockwise): every point and piece
export function turned(plan, deg) {
  if (!deg) return plan; const t = p => S.rotPt(p, -deg);
  return { ...plan, ring: (plan.ring || []).map(t), zones: (plan.zones || []).map(z => ({ ...z, ring: (z.ring || []).map(t) })), elements: (plan.elements || []).map(e => { const c = t([e.x, e.y]); return { ...e, x: c[0], y: c[1], rot: (e.rot || 0) - deg, ...(e.path ? { path: e.path.map(t) } : {}), ...(e.poly ? { poly: e.poly.map(t) } : {}) }; }) };
}

// the plan in feet. opts: { px (width), pad (ft), labels, lines (stall stripes), turn (degrees; default: street down) }.
// Returns { svg, scale (px per ft), box, height, turn }
export function planSVG(plan0, opts = {}) {
  const turn = opts.turn ?? streetDown(plan0), plan = turned(plan0, turn);
  const ring = plan.ring || [], els = plan.elements || [], prog = S.normalizeProgram(plan.program), P = PALETTE;
  if (ring.length < 3) return { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', scale: 1, box: [0, 0, 1, 1] };
  const pad = opts.pad ?? 40, xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  const W = box[2] - box[0], H = box[3] - box[1], k = opts.k || (opts.px || 1000) / W, px = +(W * k).toFixed(1), X = x => ((x - box[0]) * k).toFixed(1), Y = y => ((box[3] - y) * k).toFixed(1);
  const pts = r => r.map(p => X(p[0]) + ',' + Y(p[1])).join(' '), poly = (r, a) => '<polygon points="' + pts(r) + '" ' + a + '/>', o = [];
  const lw = v => (v * Math.max(0.6, Math.min(1.6, k * 2.5))).toFixed(2), fs = v => (v * Math.max(0.7, Math.min(1.4, k * 3))).toFixed(1);
  const d = S.details(plan), rules = S.edgeRules(ring, plan.front, plan.setbacks);
  o.push(poly(ring, 'fill="' + P.lot + '" stroke="none"'));
  for (const z of plan.zones || []) if (z.ring?.length >= 3 && (plan.zones.length > 1)) o.push(poly(z.ring, 'fill="none" stroke="#b9bdb5" stroke-width="' + lw(0.8) + '" stroke-dasharray="6 4"'));
  const order = ['green', 'trail', 'plaza', 'drive', 'truck', 'parking', 'pond', 'court', 'pool', 'play'];
  const paved = els.filter(x => S.PAVED.includes(x.kind) && !x.island); let curbed = false; const clip = 'site' + Math.random().toString(36).slice(2, 8);
  for (const kind of order.concat(['island'])) for (const e of els.filter(x => kind === 'island' ? x.island : x.kind === kind && !x.island)) {
    // paving is one surface: every paved piece stroked as curb first, then all the fills on top, so the curb shows only
    // round the outside of the whole and never where a drive meets a parking row
    if (S.PAVED.includes(kind) && !curbed && (curbed = true)) o.push('<clipPath id="' + clip + '">' + poly(ring, '') + '</clipPath><g clip-path="url(#' + clip + ')">' + paved.map(q => poly(S.outline(q), 'fill="' + P.curb + '" stroke="' + P.curb + '" stroke-width="' + lw(2.2) + '" stroke-linejoin="round"')).join('') + '</g>'); // (no curb across a driveway where it meets the street)
    if (kind === 'island') { o.push(poly(S.outline(e), 'fill="' + P.green + '" stroke="#a9c79a" stroke-width="' + lw(0.5) + '"')); continue; }
    if (kind === 'pond') { o.push(poly(e.poly ? S.grow(e.poly, 10) : S.outline({ ...e, w: e.w + 20, d: e.d + 20 }), 'fill="' + P.bank + '" stroke="none"')); o.push(poly(S.outline(e), 'fill="' + P.pond + '" stroke="#6ea3cc" stroke-width="' + lw(0.8) + '"')); continue; }
    const fill = { green: P.green, trail: '#e4d6b8', plaza: P.plaza, drive: P.paving, truck: P.paving, parking: P.paving, court: P.court, pool: P.pool, play: P.play }[kind];
    o.push(poly(S.outline(e), 'fill="' + fill + '" stroke="' + (kind === 'green' ? '#a9c79a' : kind === 'court' ? '#ffffff' : 'none') + '" stroke-width="' + lw(0.6) + '"'));
    if (kind === 'parking' && opts.lines !== false) for (const l of S.stallLines(e)) o.push('<line x1="' + X(l[0][0]) + '" y1="' + Y(l[0][1]) + '" x2="' + X(l[1][0]) + '" y2="' + Y(l[1][1]) + '" stroke="' + P.stripe + '" stroke-width="' + lw(0.5) + '"/>');
    if (kind === 'drive' && e.path && (e.width || 0) >= 24) { const c = S.fillet(e.path, e.r ?? 30, e.closed); o.push('<polyline points="' + pts(e.closed ? c.concat([c[0]]) : c) + '" fill="none" stroke="#f4f4f0" stroke-width="' + lw(0.6) + '" stroke-dasharray="8 6"/>'); }
    if (kind === 'drive' && !S.isFree(e) && e.d >= 24 && e.w >= 24 && e.name) { const a = (e.rot || 0) * Math.PI / 180, L = Math.max(e.w, e.d) / 2 - 8, along = e.w >= e.d ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
      o.push('<line x1="' + X(e.x - along[0] * L) + '" y1="' + Y(e.y - along[1] * L) + '" x2="' + X(e.x + along[0] * L) + '" y2="' + Y(e.y + along[1] * L) + '" stroke="#f4f4f0" stroke-width="' + lw(0.6) + '" stroke-dasharray="8 6"/>'); }
  }
  // markings: accessible stalls (blue, with the wheelchair symbol), their striped aisles, and the entry's stop bar and centre line
  const ln = (l, col, w) => '<line x1="' + X(l[0][0]) + '" y1="' + Y(l[0][1]) + '" x2="' + X(l[1][0]) + '" y2="' + Y(l[1][1]) + '" stroke="' + col + '" stroke-width="' + w + '"/>';
  if (opts.lines !== false) {
    const A = S.accessible(plan);
    for (const a of A.aisles) { o.push(poly(a.poly, 'fill="none" stroke="' + P.ada + '" stroke-width="' + lw(0.5) + '"')); for (const l of a.lines) o.push(ln(l, P.ada, lw(0.5))); }
    for (const a of A.stalls) { o.push(poly(a.poly, 'fill="' + P.ada + '" fill-opacity=".85" stroke="#ffffff" stroke-width="' + lw(0.5) + '"')); const r = Math.max(1.2, 2.6 * k); o.push('<circle cx="' + X(a.sym[0]) + '" cy="' + Y(a.sym[1]) + '" r="' + r.toFixed(1) + '" fill="none" stroke="#ffffff" stroke-width="' + (r * 0.35).toFixed(2) + '"/>'); }
    for (const m of S.entryMarks(plan)) o.push(ln(m.line, m.color, Math.max(0.6, m.w * k).toFixed(2)));
  }
  for (const e of els.filter(x => x.kind === 'lot')) o.push(poly(S.outline(e), 'fill="none" stroke="#9aa38f" stroke-width="' + lw(0.5) + '" stroke-dasharray="3 2"'));
  for (const i of d.islands) o.push(poly(S.outline(i), 'fill="' + P.green + '" stroke="#a9c79a" stroke-width="' + lw(0.4) + '"'));
  for (const w of d.walks) o.push(poly(S.corners(w), 'fill="' + P.walk + '" stroke="#d8d8d0" stroke-width="' + lw(0.4) + '"'));
  for (const e of els.filter(x => x.kind === 'building')) {
    const use = S.USES[e.use] ? e.use : prog.use;
    o.push(poly(S.outline(e), 'fill="' + (P.use[use] || P.use.other) + '" stroke="#4a3a2c" stroke-width="' + lw(0.9) + '"'));
    if (use === 'townhomes' && e.units > 1) for (let u = 1; u < e.units; u++) { const a = (e.rot || 0) * Math.PI / 180, x = -e.w / 2 + e.w * u / e.units, p1 = [e.x + x * Math.cos(a) + e.d / 2 * Math.sin(a), e.y + x * Math.sin(a) - e.d / 2 * Math.cos(a)], p2 = [e.x + x * Math.cos(a) - e.d / 2 * Math.sin(a), e.y + x * Math.sin(a) + e.d / 2 * Math.cos(a)];
      o.push('<line x1="' + X(p1[0]) + '" y1="' + Y(p1[1]) + '" x2="' + X(p2[0]) + '" y2="' + Y(p2[1]) + '" stroke="#4a3a2c" stroke-width="' + lw(0.4) + '"/>'); }
  }
  for (const e of els.filter(x => x.kind === 'trash')) { o.push(poly(S.outline(e), 'fill="' + P.trash + '" stroke="#4d4a44" stroke-width="' + lw(0.8) + '"')); const c = S.corners(e); o.push('<line x1="' + X(c[2][0]) + '" y1="' + Y(c[2][1]) + '" x2="' + X(c[3][0]) + '" y2="' + Y(c[3][1]) + '" stroke="#f4f4f0" stroke-width="' + lw(1.2) + '" stroke-dasharray="3 2"/>'); } // the gate side, dashed
  for (const [x, y, r] of d.trees) o.push('<circle cx="' + X(x) + '" cy="' + Y(y) + '" r="' + (r * k).toFixed(1) + '" fill="' + P.tree + '" fill-opacity=".85" stroke="' + P.treeLine + '" stroke-width="' + lw(0.5) + '"/>');
  o.push(poly(S.insetRing(ring, rules.map(r => r.build)), 'fill="none" stroke="' + P.setback + '" stroke-width="' + lw(0.7) + '" stroke-dasharray="5 4"'));
  o.push(poly(ring, 'fill="none" stroke="' + P.boundary + '" stroke-width="' + lw(1.8) + '" stroke-dasharray="14 4 2 4"'));
  // labels: biggest pieces first; lines that don't fit inside the piece are dropped, and a label never overlaps another
  if (opts.labels !== false) {
    const placed = [], cw = 0.6, order = els.slice().sort((a, b) => (b.kind === 'building') - (a.kind === 'building') || b.w * b.d - a.w * a.d);
    for (const e of order) {
      const L = S.labelOf(e, plan.program); if (!L.name && !L.size) continue; if (e.kind === 'drive' && !e.name) continue;
      const ca = Math.abs(Math.cos((e.rot || 0) * Math.PI / 180)) >= Math.SQRT1_2, vert = e.w >= e.d ? !ca : ca; // the piece's long side runs up the page
      const big = e.kind === 'building', along = (vert ? e.d : e.w) * k, across = (vert ? e.w : e.d) * k;
      let lines = [L.name.toUpperCase(), big ? L.what.toUpperCase() : '', L.size.toUpperCase()].filter(Boolean), size = big ? 10 : 8;
      const fit = () => { size = Math.min(big ? 11 : 9, across / (lines.length * 1.25 + 0.6), ...lines.map(t => along * 0.92 / (t.length * cw))); return size >= 5; };
      while (lines.length && !fit()) lines = lines.length > 2 ? [lines[0], lines[lines.length - 1]] : lines.slice(0, -1);
      if (!lines.length) continue;
      const tw = Math.max(...lines.map(t => t.length)) * size * cw, th = lines.length * size * 1.2, cx = +X(e.x), cy = +Y(e.y);
      const bb = vert ? [cx - th / 2, cy - tw / 2, cx + th / 2, cy + tw / 2] : [cx - tw / 2, cy - th / 2, cx + tw / 2, cy + th / 2];
      if (placed.some(q => bb[0] < q[2] && q[0] < bb[2] && bb[1] < q[3] && q[1] < bb[3])) continue; placed.push(bb);
      const ink = e.kind === 'pond' || e.kind === 'court' ? '#173a55' : P.text;
      o.push('<text x="' + cx + '" y="' + cy + '" font-size="' + size.toFixed(1) + '" text-anchor="middle" fill="' + ink + '" font-family="Arial, Helvetica, sans-serif" letter-spacing=".03em"' + (vert ? ' transform="rotate(-90 ' + cx + ' ' + cy + ')"' : '') + '>' +
        lines.map((t, i) => '<tspan x="' + cx + '" dy="' + (i ? '1.2em' : (-(lines.length - 1) * 0.6 + 0.35) + 'em') + '"' + (i === 0 && big ? ' font-weight="700"' : '') + '>' + esc(t) + '</tspan>').join('') + '</text>');
    }
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + px + ' ' + (H * k).toFixed(0) + '" width="' + px + '" height="' + (H * k).toFixed(0) + '">' + o.join('') + '</svg>';
  return { svg, scale: k, box, height: H * k, turn };
}

// ---------- the sheet ----------
const SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000];
const SIZES = { tabloid: { w: 16.5, h: 10.5, label: '11" × 17"' }, archd: { w: 35.5, h: 23.5, label: '24" × 36" (ARCH D)' } };
const DPI = 96;

// rows for the tables: land use, program and parking
export function sheetData(plan) {
  const m = S.metrics(plan), prog = S.normalizeProgram(plan.program), els = plan.elements || [], ac = v => (v / 43560).toFixed(2);
  const land = [['Gross site area', m.acres.toFixed(2) + ' ac', f0(m.siteSf) + ' sf']];
  for (const z of plan.zones || []) if ((plan.zones || []).length > 1) land.push([z.name, z.acres.toFixed(2) + ' ac', (z.acres * 43560 / m.siteSf * 100).toFixed(1) + '%']);
  land.push(['Building footprint (all uses)', f0(m.footprint) + ' sf', (m.coverage * 100).toFixed(1) + '%'], ['Impervious (buildings + paving)', ac(m.impervious * m.siteSf) + ' ac', (m.impervious * 100).toFixed(1) + '%']);
  if (m.pond) land.push(['Detention / pond', ac(m.pond) + ' ac', (m.pond / m.siteSf * 100).toFixed(1) + '%']);
  land.push(['Landscape / open space', ac(m.green * m.siteSf) + ' ac', (m.green * 100).toFixed(1) + '%'], ['Floor area / FAR', f0(m.gfa) + ' sf', m.far.toFixed(2)]);
  if (m.units) land.push(['Dwelling units / gross density', m.units + ' du', (m.units / m.acres).toFixed(1) + ' du/ac']);
  // program: buildings grouped by use
  const groups = new Map();
  for (const e of els.filter(x => x.kind === 'building')) {
    const use = S.USES[e.use] ? e.use : prog.use, g = groups.get(use) || { use, n: 0, sf: 0, floors: new Set(), units: 0, names: [] };
    g.n++; g.sf += e.w * e.d * (e.floors || 1); g.floors.add(e.floors || 1); g.names.push(e.name || ''); g.units += e.units ?? (use === 'multifamily' ? Math.floor(e.w * e.d * (e.floors || 1) * 0.85 / prog.unitSf) : 0); groups.set(use, g);
  }
  const program = [...groups.values()].map(g => [S.USES[g.use].label + (g.n > 1 ? ' — ' + g.n + ' bldgs' : g.names[0] ? ' — ' + g.names[0] : ''), (g.units ? g.units + ' du · ' : '') + f0(g.sf) + ' sf', [...g.floors].join('/') ]);
  const parking = [['Surface stalls (counted on plan)', f0(m.stalls)], ...(m.garages ? [['Garage spaces', f0(m.garages)]] : []), ...(m.ada ? [['Accessible (ADA) stalls, in the total', m.ada + ' (' + Math.ceil(m.ada / 6) + ' van)']] : []), ['Total provided', f0(m.spaces)], ['Needed at the ratios used', f0(m.required)]];
  return { m, land, program, parking };
}

// north arrow (pointing to true north on a drawing turned by `turn` degrees) and a scale bar for 1" = s feet
function northArrow(turn, size = 46) { // the drawing is turned `turn` degrees, so north is too
  return '<svg width="' + size + '" height="' + size + '" viewBox="-25 -25 50 50"><g transform="rotate(' + turn.toFixed(1) + ')"><circle r="21" fill="#fff" stroke="#1b1e1f" stroke-width="1.2"/><path d="M0 -19 L7 9 L0 4 L-7 9 Z" fill="#1b1e1f"/><text y="-23" text-anchor="middle" font-size="9" font-weight="700" font-family="Arial">N</text></g></svg>';
}
function scaleBar(s) {
  const segs = [0, s / 2, s, 2 * s], w = 2 * DPI; // 2 inches = 2s feet
  return '<svg width="' + (w + 30) + '" height="30" viewBox="0 0 ' + (w + 30) + ' 30">' + segs.slice(0, -1).map((v, i) => { const x0 = v / (2 * s) * w, x1 = segs[i + 1] / (2 * s) * w; return '<rect x="' + (5 + x0) + '" y="6" width="' + (x1 - x0) + '" height="6" fill="' + (i % 2 ? '#fff' : '#1b1e1f') + '" stroke="#1b1e1f" stroke-width=".8"/>'; }).join('') +
    segs.map(v => '<text x="' + (5 + v / (2 * s) * w) + '" y="24" font-size="8" text-anchor="middle" font-family="Arial">' + f0(v) + "'</text>").join('') + '</svg>';
}

// the whole sheet as an HTML document, sized for the PDF renderer (api/pdf, sheet: 'tabloid' | 'archd').
// d: { plan, project, parcels: [{ label, owner, propId, acres }], facts: [note strings], vicinity (HTML), address, county,
//      date, size, preparedFor }
export function sheetHTML(d) {
  const size = SIZES[d.size] ? d.size : 'tabloid', Z = SIZES[size], big = size === 'archd', u = big ? 2 : 1;
  const plan = d.plan, project = d.project || {}, { m, land, program, parking } = sheetData(plan);
  // the drawing area and the largest standard scale it fits at
  const side = 3.4 * u, bottom = 2.25 * u, areaW = (Z.w - side - 0.15) * DPI, areaH = (Z.h - bottom - 0.15) * DPI;
  const turn = streetDown(plan), t = turned(plan, turn), xs = t.ring.map(p => p[0]), ys = t.ring.map(p => p[1]), wf = Math.max(...xs) - Math.min(...xs) + 120, hf = Math.max(...ys) - Math.min(...ys) + 120;
  const scale = SCALES.find(s => wf * DPI / s <= areaW && hf * DPI / s <= areaH) || Math.ceil(Math.max(wf * DPI / areaW, hf * DPI / areaH) / 100) * 100;
  const drawing = planSVG(plan, { k: DPI / scale, pad: 60, turn });
  const tbl = (title, head, rows, cls = '') => '<div class="tb ' + cls + '"><div class="th">' + esc(title) + '</div><table>' + (head ? '<tr>' + head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' : '') + rows.map(r => '<tr>' + r.map((c, i) => '<td' + (i ? ' class="r"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table></div>';
  const usedUses = new Set((plan.elements || []).filter(e => e.kind === 'building').map(e => S.USES[e.use] ? e.use : S.normalizeProgram(plan.program).use));
  const legend = LEGEND.filter(([, k]) => k === 'trash' ? (plan.elements || []).some(e => e.kind === 'trash') : k === 'ada' ? m.ada > 0 : PALETTE.use[k] ? usedUses.has(k) || (k === 'retail' && ['restaurant', 'office', 'medical', 'other'].some(x => usedUses.has(x))) : true).map(([label, k]) => {
    const sw = k === 'tree' ? '<svg width="16" height="12"><circle cx="8" cy="6" r="5" fill="' + PALETTE.tree + '" stroke="' + PALETTE.treeLine + '"/></svg>' : k === 'boundary' ? '<svg width="16" height="12"><line x1="0" y1="6" x2="16" y2="6" stroke="' + PALETTE.boundary + '" stroke-width="2" stroke-dasharray="6 2 1 2"/></svg>' : k === 'setback' ? '<svg width="16" height="12"><line x1="0" y1="6" x2="16" y2="6" stroke="' + PALETTE.setback + '" stroke-width="1.2" stroke-dasharray="3 2"/></svg>' :
      '<i style="background:' + (PALETTE.use[k] || { paving: PALETTE.paving, pond: PALETTE.pond, green: PALETTE.green, trash: PALETTE.trash, ada: PALETTE.ada }[k]) + '"></i>';
    return '<div class="lg">' + sw + '<span>' + esc(label) + '</span></div>'; }).join('');
  const glance = [[f0(m.gfa) + ' SF', 'Building floor area'], ...(m.units ? [[m.units + ' Units', 'Homes']] : []), [f0(m.spaces) + ' Spaces', 'Parking' + (m.garages ? ' incl. ' + m.garages + ' garages' : '')], [m.acres.toFixed(2) + ' AC', 'Site']];
  const notes = (d.facts || []).concat(d.notes || []).slice(0, 12);
  const uses = [...usedUses].map(x => S.USES[x].label).join(' · ');
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(project.name || 'Site plan') + ' — Conceptual site plan</title><style>' +
    '@page{size:' + (Z.w + 0.5) + 'in ' + (Z.h + 0.5) + 'in;margin:0.25in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1b1e1f;font-size:' + (7 * u) + 'pt}' +
    '.sheet{width:' + Z.w + 'in;height:' + Z.h + 'in;border:' + (1.5 * u) + 'px solid #1b1e1f;display:grid;grid-template-columns:1fr ' + side + 'in;grid-template-rows:1fr ' + bottom + 'in}' +
    '.sheet{overflow:hidden}.draw{grid-column:1;grid-row:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;border-right:1px solid #1b1e1f;border-bottom:1px solid #1b1e1f}' +
    '.draw .na{position:absolute;top:' + (0.15 * u) + 'in;left:' + (0.15 * u) + 'in;text-align:center;font-size:' + (7 * u) + 'pt;font-weight:700}.draw .sc{position:absolute;bottom:' + (0.1 * u) + 'in;right:' + (0.15 * u) + 'in;text-align:right;font-size:' + (6.5 * u) + 'pt}' +
    '.side{grid-column:2;grid-row:1 / span 2;display:flex;flex-direction:column;overflow:hidden}.box{border-bottom:1px solid #1b1e1f;padding:' + (0.08 * u) + 'in ' + (0.1 * u) + 'in}.k{font-size:' + (5.5 * u) + 'pt;letter-spacing:.18em;text-transform:uppercase;color:#4d5457;margin-bottom:2px}' +
    '.pn{font-size:' + (15 * u) + 'pt;font-weight:800;letter-spacing:.02em;text-transform:uppercase;line-height:1.05}.st{font-size:' + (12 * u) + 'pt;font-weight:800;text-transform:uppercase}.sm{font-size:' + (6.5 * u) + 'pt;line-height:1.35}' +
    '.gl{display:grid;gap:' + (3 * u) + 'px}.gl b{display:block;font-size:' + (12 * u) + 'pt;color:#006527}.gl span{font-size:' + (5.5 * u) + 'pt;text-transform:uppercase;letter-spacing:.1em;color:#4d5457}' +
    '.warn{border:1px solid #c0392b;color:#c0392b;padding:' + (4 * u) + 'px;font-size:' + (6 * u) + 'pt;line-height:1.3}.vic{height:' + (1.9 * u) + 'in;overflow:hidden}.vic svg,.vic img{max-width:100%}' +
    '.bottom{grid-column:1;grid-row:2;overflow:hidden;display:grid;grid-template-columns:1.1fr 1.1fr 1fr 1.25fr .9fr;gap:0;border-right:1px solid #1b1e1f}.tb{padding:' + (0.06 * u) + 'in ' + (0.08 * u) + 'in;border-right:1px solid #1b1e1f;overflow:hidden}.tb:last-child{border-right:0}' +
    '.th{font-weight:800;font-size:' + (6.5 * u) + 'pt;letter-spacing:.14em;text-transform:uppercase;background:#1b1e1f;color:#fff;padding:2px 4px;margin-bottom:3px}table{width:100%;border-collapse:collapse;font-size:' + (6 * u) + 'pt}td,th{padding:1px 3px;border-bottom:.5px solid #c9ccc9;text-align:left;vertical-align:top}th{font-size:' + (5.5 * u) + 'pt;color:#4d5457}.r{text-align:right;white-space:nowrap}' +
    'ol{margin:0;padding-left:' + (12 * u) + 'px;font-size:' + (6 * u) + 'pt;line-height:1.3}.lg{display:flex;align-items:center;gap:5px;font-size:' + (6 * u) + 'pt;margin:1px 0}.lg i{display:inline-block;width:16px;height:10px;border:.5px solid #4a3a2c}' +
    '.sn{font-size:' + (26 * u) + 'pt;font-weight:800;text-align:right}</style></head><body><div class="sheet">' +
    '<div class="draw">' + drawing.svg + '<div class="na">' + northArrow(turn, 54 * u) + '</div><div class="sc">' + scaleBar(scale) + '<div>SCALE: 1" = ' + scale + "' ON " + Z.label + '</div></div></div>' +
    '<div class="side">' +
      (d.vicinity ? '<div class="box"><div class="k">Vicinity map</div><div class="vic">' + d.vicinity + '</div></div>' : '') +
      '<div class="box"><div class="k">Project</div><div class="pn">' + esc(project.name || 'Site plan') + '</div><div class="sm">' + esc(uses) + '<br>' + m.acres.toFixed(2) + ' acres' + (d.address ? ' · ' + esc(d.address) : '') + (d.county ? '<br>' + esc(d.county) : '') + ((d.parcels || []).length ? '<br>' + (d.parcels.length > 1 ? d.parcels.length + ' parcels' : 'Parcel ' + esc(d.parcels[0].propId || '')) : '') + '</div></div>' +
      '<div class="box"><div class="k">Sheet title</div><div class="st">Conceptual site plan</div><div class="sm">' + esc(d.planName || '') + ' · Land use · Circulation · Program</div></div>' +
      '<div class="box"><div class="k">Program at a glance</div><div class="gl">' + glance.map(([a, b]) => '<div><b>' + esc(a) + '</b><span>' + esc(b) + '</span></div>').join('') + '</div></div>' +
      '<div class="box"><div class="k">Basis of design</div><div class="sm">Boundary from ' + esc(d.boundarySource || 'county appraisal district parcel outlines') + '. Building sizes, unit and stall counts measured from this plan. Areas computed from plan geometry.</div></div>' +
      '<div class="box"><div class="warn"><b>CONCEPTUAL — FOR FEASIBILITY ONLY.</b> Not for construction, permitting, platting or regulatory submittal. Not prepared or sealed by a licensed engineer, architect or surveyor. Drainage, utilities, traffic, environmental and title matters are not resolved and may change yield and layout.</div></div>' +
      '<div class="box sm">Prepared for ' + esc(d.preparedFor || '______________________') + '<br>Prepared by ' + esc(d.preparedBy || 'Finishes Solutions') + '<br>Date ' + esc(d.date || '') + '</div>' +
      '<div class="box" style="flex:1;display:flex;align-items:flex-end;justify-content:flex-end;border-bottom:0"><div class="sn">SP-1</div></div>' +
    '</div>' +
    '<div class="bottom">' +
      tbl('Site data & land use', null, land) +
      tbl('Development program & parking', ['Use', 'Size', 'Floors'], program.concat([['', '', '']]).concat(parking.map(([a, b]) => [a, b, '']))) +
      tbl('Parcels', ['Address', 'Owner', 'Acres'], (d.parcels || []).slice(0, 12).map(p => [p.label || '', p.owner || '', p.acres ? p.acres.toFixed(2) : ''])) +
      '<div class="tb"><div class="th">Notes — constraints & due diligence</div>' + (notes.length ? '<ol>' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ol>' : '<div class="sm">No site facts were available.</div>') + '</div>' +
      '<div class="tb"><div class="th">Legend</div>' + legend + '</div>' +
    '</div></div></body></html>';
}
