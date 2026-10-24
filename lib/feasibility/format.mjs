// @ts-check
// How a feasibility study's figures read, the same in the workspace (src/workspace.js) and on the report
// (lib/reports/feasibility.mjs): dollars, millions, percents, counts, the tornado chart, a sensitivity grid's title and
// the break-even sentence. DOM-free.

export const usd = v => v == null || !Number.isFinite(+v) ? '—' : (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
export const usdM = v => v == null || !Number.isFinite(+v) ? '—' : (v < 0 ? '−$' : '$') + (Math.abs(v) / 1e6).toFixed(2) + 'M';
export const pct = (v, d = 2) => v == null || !Number.isFinite(+v) ? '—' : (v * 100).toFixed(d) + '%';
export const num = (v, d = 0) => v == null || !Number.isFinite(+v) ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
// '+' / '−' / '' in front of a change
export const sgn = x => x > 0 ? '+' : x < 0 ? '−' : '';

// a two-way grid's title from its row and column labels ('rent × cost')
export const gridTitle = g => g.rows[0].replace(/^[−+]?[\d.]+% /, '') + ' × ' + g.cols[0].replace(/^[−+]?[\d.]+% /, '');

// the break-even sentence; b wraps a figure (bold in HTML)
export function breakEvenText(be, b = s => s) {
  if (!be) return '';
  if (be.kind === 'rent') return 'Break-even rent ' + b(usd(be.rent)) + ' a unit a month against ' + usd(be.current) + ' modeled; ' + b(usd(be.rentForTarget)) + ' reaches a ' + pct(be.target) + ' yield on cost.';
  if (be.kind === 'price') return 'Break-even home price ' + b(usd(be.price)) + ' across ' + be.homes + ' homes.';
  return 'NOI needed for value to equal cost: ' + b(usd(be.noi)) + ' (modeled ' + usd(be.current) + ').';
}

// the tornado: a bar per driver from its low to its high case, a dashed line at the base. o.W / o.L: width and label
// column; o.classes: CSS classes (the workspace) instead of inline colours (the report, printed with no stylesheet)
export function tornadoSvg(t, esc, { W = 640, L = 190, classes = false } = {}) {
  const rows = t.rows.filter(x => x.lo != null && x.hi != null); if (!rows.length) return '';
  const vals = rows.flatMap(x => [x.lo, x.hi]).concat([t.base]), lo = Math.min(...vals), hi = Math.max(...vals), H = 22 * rows.length + 28, X = v => L + (v - lo) / ((hi - lo) || 1) * (W - L - 18);
  const fill = x => classes ? ' class="' + (x.lo < 0 ? 'neg' : 'pos') + '"' : ' fill="' + (x.lo < 0 ? '#b42318' : '#2f7d4f') + '" opacity=".85"';
  return '<svg' + (classes ? ' class="ws-tor"' : ' style="font:10px Montserrat,sans-serif"') + ' viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tornado chart of the inputs that move the result most; the table has the numbers" xmlns="http://www.w3.org/2000/svg">' +
    rows.map((x, i) => { const y = 7 + i * 22, a = X(Math.min(x.lo, x.hi)), b = X(Math.max(x.lo, x.hi));
      return '<text x="' + (L - 8) + '" y="' + (y + 12) + '" text-anchor="end"' + (classes ? '' : ' fill="#23282a"') + '>' + esc(x.label) + '</text><rect x="' + a.toFixed(1) + '" y="' + y + '" width="' + Math.max(1, b - a).toFixed(1) + '" height="15"' + fill(x) + '/>'; }).join('') +
    '<line x1="' + X(t.base).toFixed(1) + '" x2="' + X(t.base).toFixed(1) + '" y1="2" y2="' + (H - 17) + '"' + (classes ? '' : ' stroke="#0b0d0c" stroke-dasharray="3 2"') + '/>' +
    '<text x="' + X(t.base).toFixed(1) + '" y="' + (H - 3) + '" text-anchor="middle"' + (classes ? ' class="sub"' : ' fill="#6b7174"') + '>base ' + pct(t.base) + '</text></svg>';
}
