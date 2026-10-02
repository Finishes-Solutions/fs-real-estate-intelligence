// Small chart and tile builders that return HTML strings: used by the assistant's chat cards and the Reports tab.
// Sized in % / viewBox units so they fit any width (the chat drawer can be widened).
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// stat tiles: [{ v, label, title? }]
export const tiles = (list, cls = '') => '<div class="cc-tiles ' + cls + '">' + list.map(t => '<div><b title="' + E(t.title || t.v) + '">' + E(t.v) + '</b><span>' + E(t.label) + '</span></div>').join('') + '</div>';

// horizontal bars: [{ label, value, text }] (text = what is printed at the end of the bar)
export function hbars(items, { max } = {}) {
  const top = max || Math.max(1, ...items.map(i => i.value || 0));
  return '<div class="cc-hbars">' + items.map(i => '<div class="cc-hb"><span title="' + E(i.label) + '">' + E(i.label) + '</span><i><s style="width:' + Math.max(1.5, (i.value || 0) / top * 100).toFixed(1) + '%"></s></i><b>' + E(i.text ?? i.value) + '</b></div>').join('') + '</div>';
}

// vertical bars (or a line) over ordered categories: [{ label, value, text }]. The plot stretches to the card width at a
// fixed height; axis labels are HTML (so they don't stretch), a few of them so they never overlap; every value is in the tooltip
export function vbars(items, { line = false, h = 120 } = {}) {
  if (!items.length) return '';
  const W = 1000, H = 100, n = items.length, top = Math.max(1, ...items.map(i => i.value || 0)), bw = W / n, every = Math.ceil(n / 6);
  const y = v => H - (v / top) * (H - 4), tip = it => '<title>' + E(it.label + ': ' + (it.text ?? it.value)) + '</title>';
  const plot = line
    ? '<path class="cc-ln" vector-effect="non-scaling-stroke" d="' + items.map((it, k) => (k ? 'L' : 'M') + (k * bw + bw / 2).toFixed(1) + ',' + y(it.value || 0).toFixed(1)).join('') + '"/>' +
      items.map((it, k) => '<rect class="cc-hit" x="' + (k * bw).toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + H + '">' + tip(it) + '</rect>').join('')
    : items.map((it, k) => { const w = Math.min(bw * .72, 90), t = y(it.value || 0); return '<rect x="' + (k * bw + (bw - w) / 2).toFixed(1) + '" y="' + t.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (H - t).toFixed(1) + '">' + tip(it) + '</rect>'; }).join('');
  const labels = items.map((it, k) => k % every === 0 ? '<span style="left:' + ((k + .5) / n * 100).toFixed(2) + '%">' + E(String(it.label).slice(0, 10)) + '</span>' : '').join('');
  return '<div class="cc-vb"><svg class="cc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + h + 'px" role="img" aria-label="Chart">' + plot + '</svg><div class="cc-ax">' + labels + '</div></div>';
}

// a collapsible data table
export const dataTable = (head, rows, label = 'Show the data') => '<details class="cc-tbl"><summary>' + E(label) + '</summary><table><thead><tr>' + head.map(h => '<th>' + E(h) + '</th>').join('') + '</tr></thead><tbody>' +
  rows.map(r => '<tr>' + r.map(c => '<td>' + E(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></details>';
