// A one-page conceptual site layout sheet (24 x 36 in, landscape) as a PDF, written by hand (no packages): the option's
// pieces filled by kind and use, the property line, building labels, a title and numbers column, the independent
// check's results, and the fs-set-plans project model as invisible text (render mode 3) so the plan-set agent can read
// it back from the PDF's text (fs-set-plans/scripts/read_model.py). Deterministic: the same option gives the same bytes.
import * as S from './engine/siteplan.mjs';

const W = 2592, H = 1728; // pt
const FILL = { building: { multifamily: [0.86, 0.69, 0.42], townhomes: [0.71, 0.49, 0.36], duplex: [0.71, 0.49, 0.36], sfr: [0.78, 0.56, 0.42], retail: [0.82, 0.42, 0.26], restaurant: [0.82, 0.42, 0.26], office: [0.48, 0.58, 0.72], industrial: [0.61, 0.46, 0.36], flex: [0.61, 0.46, 0.36], storage: [0.6, 0.6, 0.66], amenity: [0.55, 0.43, 0.7], other: [0.7, 0.7, 0.7] },
  garage: [0.62, 0.64, 0.66], parking: [0.84, 0.84, 0.84], drive: [0.74, 0.74, 0.75], truck: [0.74, 0.74, 0.75], pond: [0.62, 0.8, 0.92], pool: [0.55, 0.85, 0.95], green: [0.8, 0.89, 0.76], plaza: [0.9, 0.84, 0.72], lot: [0.93, 0.95, 0.9], keepout: [0.95, 0.85, 0.85], play: [0.9, 0.8, 0.6] };
const ORDER = ['lot', 'green', 'keepout', 'pond', 'plaza', 'parking', 'drive', 'truck', 'pool', 'play', 'garage', 'building'];
const esc = t => String(t).replace(/[^\x20-\x7e]/g, ch => ({ '·': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-', '×': 'x', '²': '2', '≥': '>=', '≤': '<=', '°': ' deg' })[ch] ?? '?').replace(/[\\()]/g, m => '\\' + m);
const n = v => (Math.round(v * 100) / 100).toString();

export function sheetPDF(rec, { option = 1, title = 'Conceptual site layout', subtitle = '', model = null, modelLines = [] } = {}) {
  const o = rec.options[option - 1], ring = rec.brief.site.ring, els = o.elements.filter(e => !e.future || e.kind === 'green');
  // the drawing area: the left 70% of the sheet, the site fitted with a margin, north up
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const AX = 72, AY = 96, AW = W * 0.7 - 108, AH = H - 192, k = Math.min(AW / (x1 - x0 || 1), AH / (y1 - y0 || 1)), ox = AX + (AW - (x1 - x0) * k) / 2, oy = AY + (AH - (y1 - y0) * k) / 2;
  const X = p => [ox + (p[0] - x0) * k, oy + (p[1] - y0) * k], ops = [];
  const path = (r, fill, stroke, lw = 0.6) => { if (!r || r.length < 3) return; const q = r.map(X); ops.push((fill ? fill.map(n).join(' ') + ' rg ' : '') + (stroke ? stroke.map(n).join(' ') + ' RG ' + n(lw) + ' w ' : '') + n(q[0][0]) + ' ' + n(q[0][1]) + ' m ' + q.slice(1).map(p => n(p[0]) + ' ' + n(p[1]) + ' l').join(' ') + ' h ' + (fill && stroke ? 'B' : fill ? 'f' : 'S')); };
  const text = (x, y, t, size = 10, font = 'F1') => ops.push('0.1 0.1 0.1 rg BT /' + font + ' ' + n(size) + ' Tf ' + n(x) + ' ' + n(y) + ' Td (' + esc(t) + ') Tj ET');
  ops.push('1 1 1 rg 0 0 ' + W + ' ' + H + ' re f');
  path(ring, [0.93, 0.96, 0.91], null);
  for (const kind of ORDER) for (const e of els) { if (e.kind !== kind) continue; let r; try { r = S.outline(e); } catch { continue; }
    const fill = kind === 'building' ? FILL.building[e.use] || FILL.building[o.program?.use] || FILL.building.other : FILL[kind];
    path(r, fill, kind === 'building' || kind === 'garage' ? [0.25, 0.2, 0.15] : kind === 'pond' ? [0.3, 0.5, 0.7] : null, kind === 'building' ? 0.8 : 0.4); }
  // stall stripes on each row of 90 degree stalls (9 ft apart, across the row)
  ops.push('1 1 1 RG 0.5 w');
  for (const e of els) { if (e.kind !== 'parking' || e.poly || !(+e.w > 0) || Math.min(e.w, e.d) > 20) continue; const a = (e.rot || 0) * Math.PI / 180, along = e.w >= e.d, L = Math.max(e.w, e.d), D = Math.min(e.w, e.d), u = along ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)], v = [-u[1], u[0]];
    for (let s = -L / 2 + 9; s < L / 2 - 1; s += 9) { const p = X([e.x + u[0] * s - v[0] * D / 2, e.y + u[1] * s - v[1] * D / 2]), q = X([e.x + u[0] * s + v[0] * D / 2, e.y + u[1] * s + v[1] * D / 2]); ops.push(n(p[0]) + ' ' + n(p[1]) + ' m ' + n(q[0]) + ' ' + n(q[1]) + ' l S'); } }
  ops.push('[12 6] 0 d'); path(ring, null, [0.75, 0.1, 0.1], 2); ops.push('[] 0 d');
  // labels: each building's name and homes / floor area, at its middle, sized to its box
  for (const e of els) { if (e.kind !== 'building' && e.kind !== 'garage' && e.kind !== 'pond') continue; let c; try { c = X(S.centroid(S.outline(e))); } catch { continue; }
    const lines = [e.name || (e.kind === 'pond' ? 'Detention' : 'Building'), e.units ? e.units + ' units' + (e.floors ? ' - ' + e.floors + ' fl' : '') : e.gfa ? Math.round(e.gfa).toLocaleString('en-US') + ' sf' : ''].filter(Boolean);
    const sz = Math.max(4, Math.min(11, Math.min(+e.w || 60, +e.d || 60) * k / 4)); lines.forEach((t, i) => text(c[0] - t.length * sz * 0.26, c[1] + (lines.length / 2 - i - 0.8) * sz * 1.2, t, sz)); }
  // north arrow and scale bar
  ops.push('0 0 0 rg ' + n(AX + 20) + ' ' + n(H - 70) + ' m ' + n(AX + 30) + ' ' + n(H - 40) + ' l ' + n(AX + 40) + ' ' + n(H - 70) + ' l h f'); text(AX + 26, H - 88, 'N', 12, 'F2');
  const bar = [50, 100, 200, 500].find(f => f * k >= 120) || 500; ops.push('0 0 0 RG 2 w ' + n(AX) + ' 60 m ' + n(AX + bar * k) + ' 60 l S'); text(AX, 44, '0', 9); text(AX + bar * k - 12, 44, bar + ' ft', 9);
  // the right column: title, numbers, checks, notes
  const RX = W * 0.7 + 24; let y = H - 90; const line = (t, size = 11, font = 'F1', gap = 1.45) => { if (y < 70) return; text(RX, y, t, size, font); y -= size * gap; };
  ops.push('0 0 0 RG 1.5 w ' + n(W * 0.7) + ' 48 m ' + n(W * 0.7) + ' ' + (H - 48) + ' l S');
  line(title, 26, 'F2'); if (subtitle) line(subtitle, 14); line(o.name, 13); y -= 10;
  const q = o.quantities, pk = q.parking || {}, ac = (S.ringArea(ring) / 43560).toFixed(2);
  for (const t of ['Site: ' + ac + ' acres', q.totals?.units ? 'Homes: ' + q.totals.units + ' (' + (q.duAc ?? '').toString() + ' an acre)' : null, 'Building floor area: ' + Math.round(q.totals?.gfa || 0).toLocaleString('en-US') + ' sf', 'Buildings: ' + (q.totals?.buildings ?? ''), 'Parking: ' + pk.provided + ' provided / ' + pk.required + ' required', 'Check: ' + o.validation.status.toUpperCase() + ' (' + o.validation.counts.pass + ' pass, ' + o.validation.counts.fail + ' fail, ' + o.validation.counts.unknown + ' unknown)'].filter(Boolean)) line(t, 13);
  y -= 8; line('Independent check', 15, 'F2');
  for (const c of o.validation.checks) { if (c.status === 'n/a') continue; line((c.status === 'pass' ? '[ok] ' : c.status === 'fail' ? (c.hard ? '[FAIL] ' : '[warn] ') : '[?] ') + c.title + (c.measured != null && c.required != null ? ': ' + c.measured + ' / ' + (typeof c.required === 'object' ? JSON.stringify(c.required) : c.required) + (c.units ? ' ' + c.units : '') : ''), 9, 'F1', 1.35); }
  y -= 8; line('Notes', 15, 'F2');
  for (const t of [...(o.notes || []).slice(0, 8), 'Conceptual layout only: not for permit, bidding or construction. Rules marked assumption are not verified.', 'Engine ' + rec.versions?.engine + ' - input ' + (rec.inputHash || '').slice(0, 12) + ' - geometry ' + (o.geometryHash || '').slice(0, 12)]) {
    const words = String(t).split(' '); let cur = ''; for (const w of words) { if ((cur + ' ' + w).length > 95) { line(cur, 9, 'F1', 1.3); cur = w; } else cur = cur ? cur + ' ' + w : w; } if (cur) line(cur, 9, 'F1', 1.3); }
  // the project model as invisible text down the left margin, columns as needed
  if (modelLines.length) { const per = Math.floor((H - 80) / 5); for (let i = 0; i < modelLines.length; i += per) { ops.push('BT 3 Tr /F1 2.5 Tf 5 TL ' + n(40 + Math.floor(i / per) * 470) + ' ' + (H - 40) + ' Td'); for (const ln of modelLines.slice(i, i + per)) ops.push('(' + esc(ln) + ') Tj T*'); ops.push('ET'); } }
  void model;
  // the file: catalog, pages, page, fonts, content
  const content = ops.join('\n'), objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Length ' + Buffer.byteLength(content, 'latin1') + ' >>\nstream\n' + content + '\nendstream'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((b, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += (i + 1) + ' 0 obj\n' + b + '\nendobj\n'; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(v => String(v).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
