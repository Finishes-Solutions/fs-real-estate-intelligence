// SP-1, the conceptual site layout sheet (36 x 24 in) on the Finishes Solutions title block, as a PDF written by hand
// (no packages): the border and title block (assets/titleblock-form.pdf, the same border fs-site-plan and fs-set-plans
// use, copied in as a Form XObject), the option's plan turned so the front street is at the bottom of the sheet at an
// engineering scale with its north arrow and scale bar, the view title and the not-for-construction stamp, two columns
// of numbers, checks and notes, the title block's fields (project, prepared by, phase, date, scale, the preliminary
// statement, sheet title, SP-1), and the fs-set-plans project model as invisible text (render mode 3) so the plan-set
// agent can read it back from the PDF (fs-set-plans/scripts/read_model.py). Laid out as fs-site-plan's SP-1
// (skills/fs-site-plan/scripts/build_siteplan.py render, fsplans/kit.py). Deterministic: the same option and meta give
// the same bytes.
import fs from 'node:fs';
import * as S from './engine/siteplan.mjs';

const W = 2592, H = 1728; // pt
// inside the border's heavy line (bottom-left origin) and the usable area (kit.py FRAME_TL / AREA)
const FX = 111, FY = H - 41 - 1650, FW = 2223, FH = 1650, PAD = 24, AX = FX + PAD, AY = FY + PAD, AW = FW - 2 * PAD, AH = FH - 2 * PAD;
const SIDE_COL = 330, GAP = 18, SIDE_W = SIDE_COL * 2 + GAP, LABEL_H = 46;
// the title block's fields, measured off the border from its top left (kit.py FIELDS / REV)
const FIELDS = { open: { x: 2382, y: 512, w: 168, h: 540 }, drawnBy: { x: 2440, y: 1411 }, checkedBy: { x: 2450, y: 1429 }, projectNumber: { x: 2382, y: 1464 }, sheetTitle: { x: 2382, y: 1517, w: 168 }, sheetNumber: { x: 2382, y: 1610, w: 168, h: 78 } };
const REV = { x0: 2400.8, pitch: 13, no: [1369.5, 1395], date: [1303.5, 1369.5], desc: [1070.8, 1303.5] };
const top = y => H - y;
const ENG_SCALES = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000];
const INK = [0.106, 0.118, 0.122], GREY = [0.30, 0.33, 0.34], RED = [0.75, 0.22, 0.17], WHITE = [1, 1, 1];
const PRELIMINARY = 'PRELIMINARY — NOT FOR CONSTRUCTION, BIDDING OR PERMIT.';
const PRELIMINARY_TEXT = 'Conceptual site layout prepared by Finishes Solutions with AI assistance for feasibility and planning only. Not prepared or sealed by a licensed architect, engineer or surveyor. Boundary, easements, utilities, drainage and code requirements are not verified and must be confirmed by licensed professionals and the authority having jurisdiction.';
const LABEL = 'AI-ASSISTED CONCEPTUAL SITE PLAN. FOR FEASIBILITY AND PLANNING ONLY. NOT FOR PERMIT OR CONSTRUCTION. FINAL DESIGN IS SUBJECT TO CURRENT SURVEY, TITLE, CIVIL ENGINEERING, ARCHITECTURAL/ENGINEERING REVIEW, FIRE AND ACCESSIBILITY REVIEW, UTILITY CONFIRMATION, FLOODPLAIN ANALYSIS AND APPROVAL BY THE AUTHORITY HAVING JURISDICTION.';

const FILL = { building: { multifamily: [0.90, 0.68, 0.45], townhomes: [0.91, 0.72, 0.47], duplex: [0.92, 0.76, 0.5], sfr: [0.93, 0.80, 0.55], retail: [0.85, 0.45, 0.42], restaurant: [0.88, 0.55, 0.35], office: [0.55, 0.65, 0.85], industrial: [0.65, 0.62, 0.75], flex: [0.65, 0.62, 0.75], storage: [0.7, 0.7, 0.7], amenity: [0.6, 0.8, 0.6], other: [0.8, 0.8, 0.8] },
  garage: [0.62, 0.64, 0.66], parking: [0.83, 0.83, 0.83], drive: [0.74, 0.74, 0.75], truck: [0.74, 0.74, 0.75], pond: [0.74, 0.86, 0.95], pool: [0.55, 0.85, 0.95], green: [0.8, 0.89, 0.76], plaza: [0.9, 0.84, 0.72], lot: [0.93, 0.95, 0.9], keepout: [0.95, 0.85, 0.85], play: [0.9, 0.8, 0.6] };
const ORDER = ['lot', 'green', 'keepout', 'pond', 'plaza', 'parking', 'drive', 'truck', 'pool', 'play', 'garage', 'building'];
const USE_NAME = { multifamily: 'Multifamily', townhomes: 'Townhomes', duplex: 'Duplexes', sfr: 'Single-family homes', retail: 'Retail', restaurant: 'Restaurant', office: 'Office', industrial: 'Industrial / flex', flex: 'Flex', storage: 'Self storage', amenity: 'Amenity', other: 'Other' };
const n = v => (Math.round(v * 100) / 100).toString();

// ---------- text: WinAnsi bytes and Helvetica widths ----------
let WIDTHS = null;
const widths = () => (WIDTHS ??= JSON.parse(fs.readFileSync(new URL('../assets/helvetica-widths.json', import.meta.url), 'utf8')));
const WIN = { '—': 0x97, '–': 0x96, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '·': 0xb7, '×': 0xd7, '°': 0xb0, '²': 0xb2, '•': 0x95, '½': 0xbd };
const ASCII_FOR = { '≥': '>=', '≤': '<=', '→': '->', '…': '...' };
const codes = t => [...String(t)].flatMap(ch => { const c = ch.charCodeAt(0); if (c >= 32 && c < 127) return [c]; if (WIN[ch]) return [WIN[ch]]; if (ASCII_FOR[ch]) return [...ASCII_FOR[ch]].map(x => x.charCodeAt(0)); return [63]; });
const enc = t => codes(t).map(c => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 127 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0')).join('');
export const textWidth = (t, size, bold = false) => { const w = widths()[bold ? 'bold' : 'regular']; return codes(t).reduce((s, c) => s + (w[c] ?? 556), 0) * size / 1000; };
const wrap = (t, size, width, bold = false) => { const out = []; let cur = ''; for (const word of String(t).split(/\s+/).filter(Boolean)) { const next = cur ? cur + ' ' + word : word; if (cur && textWidth(next, size, bold) > width) { out.push(cur); cur = word; } else cur = next; } if (cur) out.push(cur); return out; };
// the model lines keep their plain ASCII spelling (read back from the text as written: test/skill-site-layout.mjs)
const esc = t => String(t).replace(/[^\x20-\x7e]/g, ch => ({ '·': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-', '×': 'x', '²': '2', '≥': '>=', '≤': '<=', '°': ' deg' })[ch] ?? '?').replace(/[\\()]/g, m => '\\' + m);

// ---------- the turn: the front street at the bottom of the sheet ----------
// the angle (radians, counter-clockwise) that turns the site so its front edge's outward side faces down the sheet
export function frontRotation(ring, front = 0) {
  if (!ring?.length || ring.length < 3) return 0;
  const f = Math.max(0, Math.min(ring.length - 1, front ?? 0)), a = ring[f], b = ring[(f + 1) % ring.length], ccw = S.signedArea(ring) >= 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, out = ccw ? [dy / L, -dx / L] : [-dy / L, dx / L];
  let t = Math.atan2(-1, 0) - Math.atan2(out[1], out[0]); while (t > Math.PI) t -= 2 * Math.PI; while (t <= -Math.PI) t += 2 * Math.PI;
  return Math.abs(t) < 1e-9 ? 0 : t;
}

// ---------- the title block: the border's Form XObject and its objects, renumbered from `base` ----------
function titleBlock(base) {
  const raw = fs.readFileSync(new URL('../assets/titleblock-form.pdf', import.meta.url)).toString('latin1');
  const sx = +[...raw.matchAll(/startxref\s+(\d+)/g)].pop()[1], xr = raw.slice(sx);
  const head = /^xref\s+(\d+)\s+(\d+)\s+/.exec(xr); if (!head) throw new Error('titleblock-form.pdf: no classic xref table');
  const off = {}; let i = +head[1]; for (const m of xr.slice(head[0].length).matchAll(/(\d{10}) (\d{5}) ([nf])\s/g)) { if (i >= +head[1] + +head[2]) break; if (m[3] === 'n') off[i] = +m[1]; i++; }
  const raws = {};
  const body = num => { if (raws[num]) return raws[num]; const at = off[num]; if (at == null) throw new Error('titleblock-form.pdf: no object ' + num);
    const h = new RegExp('^' + num + ' 0 obj\\s*', 'y'); h.lastIndex = 0; const hm = h.exec(raw.slice(at)); if (!hm) throw new Error('titleblock-form.pdf: object ' + num + ' not at its offset');
    const start = at + hm[0].length, endobj = raw.indexOf('endobj', start), sm = /stream\r?\n/.exec(raw.slice(start, endobj));
    if (!sm) return (raws[num] = { dict: raw.slice(start, endobj).trim() });
    const dict = raw.slice(start, start + sm.index).trim(), lm = /\/Length\s+(\d+)(\s+0\s+R)?/.exec(dict), len = lm[2] ? +body(+lm[1]).dict : +lm[1];
    return (raws[num] = { dict, data: raw.substr(start + sm.index + sm[0].length, len) }); };
  const refs = t => [...t.matchAll(/(\d+) 0 R\b/g)].map(m => +m[1]);
  const root = refs(/\/Root\s+\d+ 0 R/.exec(raw.slice(sx))[0])[0], pages = refs(/\/Pages\s+\d+ 0 R/.exec(body(root).dict)[0])[0], page = refs(/\/Kids\s*\[\s*\d+ 0 R/.exec(body(pages).dict)[0])[0];
  const res = /\/Resources\s*(\d+ 0 R|<<)/.exec(body(page).dict); const resDict = res[1] === '<<' ? body(page).dict.slice(res.index) : body(refs(res[1])[0]).dict;
  const form = refs(/\/XObject\s*<<\s*\/[^\s/>]+\s+\d+ 0 R/.exec(resDict)[0])[0];
  // every object the form reaches, in order of first reach, numbered from base
  const order = [], seen = new Set(), q = [form];
  while (q.length) { const o = q.shift(); if (seen.has(o)) continue; seen.add(o); order.push(o); for (const r of refs(body(o).dict)) if (!seen.has(r)) q.push(r); }
  const map = new Map(order.map((o, k) => [o, base + k])), re = t => t.replace(/(\d+) 0 R\b/g, (m, a) => map.has(+a) ? map.get(+a) + ' 0 R' : m);
  return { form: map.get(form), objs: order.map(o => { const b = body(o); return b.data == null ? re(b.dict) : re(b.dict) + '\nstream\n' + b.data + '\nendstream'; }) };
}

// ---------- the sheet ----------
export function sheetPDF(rec, { option = 1, title = 'Conceptual site layout', subtitle = '', meta = {}, modelLines = [] } = {}) {
  const o = rec.options[option - 1], ring0 = rec.brief.site.ring, els = o.elements.filter(e => !e.future || e.kind === 'green'), ops = [];
  const theta = frontRotation(ring0, rec.brief.site.front ?? 0), cs = Math.cos(theta), sn = Math.sin(theta), rot = p => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs], ring = ring0.map(rot);
  // the plan's view: left of the columns, above the view title; an engineering scale that holds the turned site
  const dw = AW - SIDE_W - 30, vx = AX, vy = AY + LABEL_H + 30, vw = dw, vh = AH - LABEL_H - 70;
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const scale = ENG_SCALES.find(s => (x1 - x0) / s * 72 <= vw * 0.94 && (y1 - y0) / s * 72 <= vh * 0.94) || Math.ceil(Math.max((x1 - x0) / (vw / 72), (y1 - y0) / (vh / 72)) / 100) * 100;
  const k = 72 / scale, ox = vx + (vw - (x1 - x0) * k) / 2, oy = vy + (vh - (y1 - y0) * k) / 2;
  const X = p => { const r = rot(p); return [ox + (r[0] - x0) * k, oy + (r[1] - y0) * k]; };
  const rgb = (c, s) => c.map(n).join(' ') + (s ? ' RG' : ' rg');
  const shape = (q, fill, stroke, lw = 0.6) => { if (!q || q.length < 3) return; ops.push((fill ? rgb(fill) + ' ' : '') + (stroke ? rgb(stroke, 1) + ' ' + n(lw) + ' w ' : '') + n(q[0][0]) + ' ' + n(q[0][1]) + ' m ' + q.slice(1).map(p => n(p[0]) + ' ' + n(p[1]) + ' l').join(' ') + ' h ' + (fill && stroke ? 'B' : fill ? 'f' : 'S')); };
  const text = (x, y, t, size = 7, bold = false, color = INK) => ops.push(rgb(color) + ' BT /' + (bold ? 'F2' : 'F1') + ' ' + n(size) + ' Tf ' + n(x) + ' ' + n(y) + ' Td (' + enc(t) + ') Tj ET');
  const rect = (x, y, w, h, fill, stroke, lw = 0.8) => ops.push((fill ? rgb(fill) + ' ' : '') + (stroke ? rgb(stroke, 1) + ' ' + n(lw) + ' w ' : '') + [x, y, w, h].map(n).join(' ') + ' re ' + (fill && stroke ? 'B' : fill ? 'f' : 'S'));
  const circle = (x, y, r, fill, stroke, lw = 1) => { const c = 0.5523 * r; ops.push((fill ? rgb(fill) + ' ' : '') + (stroke ? rgb(stroke, 1) + ' ' + n(lw) + ' w ' : '') + [x + r, y, 'm', x + r, y + c, x + c, y + r, x, y + r, 'c', x - c, y + r, x - r, y + c, x - r, y, 'c', x - r, y - c, x - c, y - r, x, y - r, 'c', x + c, y - r, x + r, y - c, x + r, y, 'c'].map(v => typeof v === 'number' ? n(v) : v).join(' ') + ' h ' + (fill && stroke ? 'B' : fill ? 'f' : 'S')); };

  // 1. the border and title block underneath everything
  ops.push('q /TB Do Q');
  // 2. the plan, clipped to its view
  ops.push('q ' + [AX, AY + LABEL_H + 26, dw, AH - LABEL_H - 26].map(n).join(' ') + ' re W n');
  shape(ring0.map(X), [0.91, 0.95, 0.88], null);
  for (const kind of ORDER) for (const e of els) { if (e.kind !== kind) continue; let r; try { r = S.outline(e); } catch { continue; }
    const fill = kind === 'building' ? FILL.building[e.use] || FILL.building[o.program?.use] || FILL.building.other : FILL[kind];
    shape(r.map(X), fill, kind === 'building' || kind === 'garage' ? [0.25, 0.2, 0.15] : kind === 'pond' ? [0.3, 0.5, 0.7] : null, kind === 'building' ? 0.8 : 0.4); }
  ops.push('1 1 1 RG 0.5 w'); // stall stripes on each row of 90 degree stalls (9 ft apart, across the row)
  for (const e of els) { if (e.kind !== 'parking' || e.poly || !(+e.w > 0) || Math.min(e.w, e.d) > 20) continue; const a = (e.rot || 0) * Math.PI / 180, along = e.w >= e.d, L = Math.max(e.w, e.d), D = Math.min(e.w, e.d), u = along ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], v = [-u[1], u[0]];
    for (let s = -L / 2 + 9; s < L / 2 - 1; s += 9) { const p = X([e.x + u[0] * s - v[0] * D / 2, e.y + u[1] * s - v[1] * D / 2]), q = X([e.x + u[0] * s + v[0] * D / 2, e.y + u[1] * s + v[1] * D / 2]); ops.push(n(p[0]) + ' ' + n(p[1]) + ' m ' + n(q[0]) + ' ' + n(q[1]) + ' l S'); } }
  ops.push('[12 6] 0 d'); shape(ring0.map(X), null, RED, 2); ops.push('[] 0 d');
  for (const e of els) { if (e.kind !== 'building' && e.kind !== 'garage' && e.kind !== 'pond') continue; let c; try { c = X(S.centroid(S.outline(e))); } catch { continue; }
    const lines = [e.name || (e.kind === 'pond' ? 'Detention' : 'Building'), e.units ? e.units + ' units' + (e.floors ? ' · ' + e.floors + ' fl' : '') : e.gfa ? Math.round(e.gfa).toLocaleString('en-US') + ' sf' : ''].filter(Boolean);
    const sz = Math.max(4, Math.min(9, Math.min(+e.w || 60, +e.d || 60) * k / 4)); lines.forEach((t, i) => text(c[0] - textWidth(t, sz, i === 0) / 2, c[1] + (lines.length / 2 - i - 0.8) * sz * 1.2, t, sz, i === 0)); }
  ops.push('Q');
  // 3. north arrow (true north turned with the plan), view title with its scale and bar, the stamp
  { const x = AX + 45, y = AY + AH - 45, s = 64; circle(x, y, s / 2, null, INK, 1);
    ops.push('q ' + [cs, sn, -sn, cs, x, y].map(v => n(v)).join(' ') + ' cm');
    shape([[0, s * 0.42], [s * 0.14, -s * 0.3], [0, -s * 0.16]], INK, INK, 1); shape([[0, s * 0.42], [-s * 0.14, -s * 0.3], [0, -s * 0.16]], WHITE, INK, 1);
    text(-textWidth('N', s * 0.22, true) / 2, s * 0.52, 'N', s * 0.22, true); ops.push('Q'); }
  const scaleText = '1" = ' + scale + "'-0\"";
  { const x = AX, y = AY + LABEL_H + 8, t = 'CONCEPTUAL SITE LAYOUT' + (o.name ? ' — ' + o.name.split(' · ')[0].toUpperCase() : ''), tw = textWidth(t, 11, true);
    circle(x + 11, y + 6, 11, null, INK, 1.2); text(x + 11 - textWidth('1', 10, true) / 2, y + 2.5, '1', 10, true);
    text(x + 30, y + 6, t, 11, true); ops.push(rgb(INK, 1) + ' 1.5 w ' + n(x + 30) + ' ' + n(y + 2) + ' m ' + n(x + 30 + Math.max(tw, 120)) + ' ' + n(y + 2) + ' l S');
    text(x + 30, y - 9, 'Scale: ' + scaleText + ' on 24" × 36"', 8);
    // the scale bar: four divisions of a round number of feet near three quarters of an inch
    const raw = scale * 0.75, nice = [1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 100, 200, 250, 500, 1000].reduce((b, v) => Math.abs(v - raw) < Math.abs(b - raw) ? v : b), seg = nice / scale * 72, bx = x + 30 + Math.max(tw, 120) + 20, by = y + 1;
    for (let i = 0; i < 4; i++) rect(bx + i * seg, by, seg, 5, i % 2 ? WHITE : INK, INK, 0.6);
    for (let i = 0; i <= 4; i++) { const t2 = String(nice * i) + (i === 4 ? "'" : ''); text(bx + i * seg - textWidth(t2, 6.5) / 2, by + 8, t2, 6.5); } }
  { const lines = wrap(LABEL, 7.5, dw - 10, true), h = lines.length * 9.5 + 8, y = AY + LABEL_H; rect(AX, y - h, dw, h, null, RED, 0.8); lines.forEach((ln, i) => text(AX + 5, y - 4 - (i + 1) * 9.5 + 2, ln, 7.5, true, RED)); }

  // 4. the two columns: numbers and checks, then notes and the legend
  const q = o.quantities, pk = q.parking || {}, ac = S.ringArea(ring0) / 43560, v = o.validation;
  const heading = (x, y, w, t) => { const h = 8.5 + 6; rect(x, y - h, w, h, INK, null); text(x + 6, y - h + 4.5, t.toUpperCase(), 8.5, true, WHITE); return y - h - 5; };
  const para = (x, y, w, t, size = 6.8, color = INK, bold = false, indent = 0, minY = AY) => { for (const ln of wrap(t, size, w - indent, bold)) { if (y - size * 1.3 < minY) return y; y -= size * 1.3; text(x + indent, y, ln, size, bold, color); } return y; };
  const table = (x, y, w, rows, minY = AY) => { for (const [a, b] of rows) { if (y - 10 < minY) return y; y -= 10; text(x, y, a, 6.8); text(x + w - textWidth(b, 6.8, true), y, b, 6.8, true); ops.push(rgb([0.85, 0.86, 0.85], 1) + ' 0.4 w ' + n(x) + ' ' + n(y - 2.5) + ' m ' + n(x + w) + ' ' + n(y - 2.5) + ' l S'); } return y - 4; };
  const x1c = AX + AW - SIDE_W, x2c = x1c + SIDE_COL + GAP;
  let y = AY + AH;
  y = heading(x1c, y, SIDE_COL, 'Program and numbers');
  y = para(x1c, y, SIDE_COL, o.name || '', 7.4, INK, true);
  y = table(x1c, y - 2, SIDE_COL, [['Site', ac.toFixed(2) + ' ac (' + Math.round(ac * 43560).toLocaleString('en-US') + ' sf)'], ...(q.totals?.units ? [['Homes', q.totals.units + ' (' + (q.duAc ?? (q.totals.units / ac).toFixed(1)) + ' an acre)']] : []), ['Building floor area', Math.round(q.totals?.gfa || 0).toLocaleString('en-US') + ' sf'], ['Buildings', String(q.totals?.buildings ?? '')], ['Parking', (pk.provided ?? '') + ' provided / ' + (pk.required ?? '') + ' required'], ['Independent check', v.status.toUpperCase() + ' (' + v.counts.pass + ' pass, ' + v.counts.fail + ' fail, ' + v.counts.unknown + ' unknown)']]);
  y -= 9; y = heading(x1c, y, SIDE_COL, 'Independent check');
  const checks = v.checks.filter(c => c.status !== 'n/a'), mark = c => c.status === 'pass' ? 'OK' : c.status === 'fail' ? (c.hard ? 'FAIL' : 'WARN') : '?';
  let col = x1c, colMin = AY;
  for (const c of checks) { const t = c.title + (c.measured != null && c.required != null ? ': ' + c.measured + ' / ' + (typeof c.required === 'object' ? JSON.stringify(c.required) : c.required) + (c.units ? ' ' + c.units : '') : '');
    if (y - 20 < colMin && col === x1c) { col = x2c; y = AY + AH; y = heading(col, y, SIDE_COL, 'Independent check (cont.)'); }
    const tag = mark(c), color = tag === 'FAIL' ? RED : tag === 'WARN' ? [0.8, 0.5, 0.05] : tag === '?' ? GREY : [0.24, 0.5, 0.25];
    text(col, y - 6.8 * 1.3, tag, 6.4, true, color); y = para(col, y, SIDE_COL, t, 6.8, INK, false, 30); y -= 2; }
  if (col === x1c) { col = x2c; y = AY + AH; } else y -= 9;
  y = heading(col, y, SIDE_COL, 'Notes');
  const notes = [...(o.notes || []), ...(o.tplNotes || [])].filter((t, i, a) => t && a.indexOf(t) === i).slice(0, 14);
  notes.forEach((t, i) => { if (y < AY + 160) return; text(col, y - 6.8 * 1.3, (i + 1) + '.', 6.8, true); y = para(col, y, SIDE_COL, t, 6.8, INK, false, 14); y -= 2; });
  y -= 9; y = heading(col, y, SIDE_COL, 'Legend');
  const uses = [...new Set(els.filter(e => e.kind === 'building').map(e => FILL.building[e.use] ? e.use : FILL.building[o.program?.use] ? o.program.use : 'other'))];
  const leg = [...uses.map(u => [FILL.building[u], USE_NAME[u] || u]), [FILL.parking, 'Parking'], [FILL.drive, 'Drives'], [FILL.green, 'Landscape / open space'], [FILL.pond, 'Detention'], ...(els.some(e => e.kind === 'pool') ? [[FILL.pool, 'Pool']] : [])];
  const half = Math.ceil(leg.length / 2); leg.forEach(([c, t], i) => { const lx = col + (i >= half ? SIDE_COL / 2 : 0), ly = y - 12 - (i % half) * 13; rect(lx, ly, 20, 10, c, null); text(lx + 27, ly + 1.5, t, 7); });
  { const ly = y - 12 - half * 13 - 4; ops.push('[6 3] 0 d'); ops.push(rgb(RED, 1) + ' 1.6 w ' + n(col) + ' ' + n(ly + 5) + ' m ' + n(col + 20) + ' ' + n(ly + 5) + ' l S [] 0 d'); text(col + 27, ly + 1.5, 'Property line', 7); y = ly - 14; }
  y -= 6; text(col, Math.max(AY + 4, y), 'Engine ' + (rec.versions?.engine || '') + ' · input ' + (rec.inputHash || '').slice(0, 12) + ' · geometry ' + (o.geometryHash || '').slice(0, 12), 5.6, false, GREY);

  // 5. the title block's fields
  { const f = FIELDS.open, x = f.x, w = f.w; let ty = top(f.y);
    const key = t => { ty -= 9; text(x, ty, t.toUpperCase(), 5.5, false, GREY); };
    const val = (t, size = 7.5, bold = true) => { for (const ln of wrap(t, size, w, bold)) { ty -= size * 1.25; text(x, ty, ln, size, bold); } };
    key('Project'); val(String(meta.name || title || 'Untitled project').toUpperCase(), 11, true);
    for (const ln of [meta.address || subtitle, ac.toFixed(2) + ' ac · ' + (o.name || '').split(' · ')[0]]) if (ln) val(ln, 6.5, false);
    if (meta.client) { key('Prepared for'); val(meta.client); }
    key('Prepared by'); val('Finishes Solutions'); key('Phase'); val('Conceptual site layout'); key('Date'); val(meta.date || ''); key('Scale'); val(scaleText);
    ty -= 8; const head = wrap(PRELIMINARY, 6.2, w - 8, true), body = wrap(PRELIMINARY_TEXT, 5.6, w - 8), h = head.length * 7.6 + body.length * 7.3 + 10;
    rect(x, ty - h, w, h, null, RED, 1); let yy = ty - 4; for (const ln of head) { yy -= 7.6; text(x + 4, yy, ln, 6.2, true, RED); } for (const ln of body) { yy -= 7.3; text(x + 4, yy, ln, 5.6); } }
  for (const [fk, val] of [['drawnBy', meta.drawn_by], ['checkedBy', meta.checked_by]]) if (val) text(FIELDS[fk].x, top(FIELDS[fk].y) - 8, val, 7, true);
  if (meta.number) text(FIELDS.projectNumber.x, top(FIELDS.projectNumber.y) - 16, meta.number, 9, true);
  { const st = FIELDS.sheetTitle; let yy = top(st.y); for (const ln of wrap('CONCEPTUAL SITE LAYOUT', 10.5, st.w, true).slice(0, 3)) { yy -= 12; text(st.x, yy, ln, 10.5, true); } for (const ln of wrap((o.name || '').split(' · ')[0], 6.5, st.w).slice(0, 2)) { yy -= 8.5; text(st.x, yy, ln, 6.5); }
    const sn2 = FIELDS.sheetNumber; text(sn2.x + sn2.w - textWidth('SP-1', 40, true), top(sn2.y + sn2.h) + 6, 'SP-1', 40, true); }
  { const cx = REV.x0; for (const [span, val] of [[REV.no, '0'], [REV.date, meta.date || ''], [REV.desc, 'Conceptual site layout']]) { if (!val) continue; let s = val; while (s.length > 3 && textWidth(s, 6.5) > span[1] - span[0] - 4) s = s.slice(0, -2);
    ops.push(rgb(INK) + ' BT /F1 6.5 Tf 0 1 -1 0 ' + n(cx + REV.pitch - 3.5) + ' ' + n(top(span[1]) + 2) + ' Tm (' + enc(s) + ') Tj ET'); } }

  // 6. the project model as invisible text down the left margin (outside the border's heavy line), columns as needed
  if (modelLines.length) { const per = Math.floor((H - 80) / 5); for (let i = 0; i < modelLines.length; i += per) { ops.push('BT 3 Tr /F1 2.5 Tf 5 TL ' + n(40 + Math.floor(i / per) * 470) + ' ' + (H - 40) + ' Td'); for (const ln of modelLines.slice(i, i + per)) ops.push('(' + esc(ln) + ') Tj T*'); ops.push('ET'); } }

  // the file: catalog, pages, page, fonts, content, then the title block's objects
  const TB = titleBlock(7), content = ops.join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /TB ' + TB.form + ' 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(content, 'latin1') + ' >>\nstream\n' + content + '\nendstream', ...TB.objs];
  let out = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'; const offs = [];
  objs.forEach((b, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + b + '\nendobj\n'; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(v2 => String(v2).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
